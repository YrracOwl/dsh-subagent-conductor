import Schema from '@deepseek-ai/schemastery'
import {
  MARKER_KEY,
  SETTINGS_NAMESPACE,
  TOOL_NAME,
  applyResolvedRoute,
  findRootSessionId,
  isFreshSubagent,
  isSubagent,
  makeMarker,
  normalizeReasoningEffort,
  normalizeSettings,
  readMarker,
  resolveRoute,
  validateSettings,
} from './config.js'

const RouteSchema = Schema.object({ provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string() })
const RoleSchema = Schema.object({
  displayName: Schema.string(), description: Schema.string(), persona: Schema.string(),
  provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string(),
  toolFilter: Schema.object({ allow: Schema.array(Schema.string()), deny: Schema.array(Schema.string()) }),
})
const SettingsSchema = Schema.object({
  defaultRoute: RouteSchema.default({}), defaultRole: Schema.string(),
  subagentProvider: Schema.string().default('spawn'),
  maxDepth: Schema.number().step(1).min(0).max(32).default(3), enableRunInBackground: Schema.boolean().default(true),
  backgroundMode: Schema.union(['one-shot', 'continuable']).default('one-shot'),
  roles: Schema.dict(RoleSchema).default({}), sessionSelections: Schema.dict(RouteSchema).default({}),
})

export const name = 'dsh-subagent-conductor'
export const inject = ['subagents', 'tools', 'llm']

function outputText(blocks = []) {
  return blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('')
}

function stopReasonError(result) {
  if (result.stopReason === 'completed') return undefined
  return ({ aborted: 'subagent run was cancelled', error: 'subagent run failed', 'max-tokens': 'subagent run hit its token limit', refusal: 'subagent declined the task' })[result.stopReason]
    || `subagent run ended abnormally (${String(result.stopReason)})`
}

async function settleForeground(run) {
  const [execution] = await Promise.allSettled([run.result.then((result) => {
    const error = stopReasonError(result)
    if (error) throw new Error(error + (result.diagnostic ? `\nDiagnostic: ${result.diagnostic}` : '') + (outputText(result.output) ? `\nPartial output:\n${outputText(result.output)}` : ''))
    return { kind: 'foreground', runId: String(run.id), output: result.output }
  })])
  const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())])
  if (execution.status === 'rejected') {
    if (disposal.status === 'rejected') throw new AggregateError([execution.reason, disposal.reason], 'subagent execution and disposal failed')
    throw execution.reason
  }
  if (disposal.status === 'rejected') throw disposal.reason
  return execution.value
}

async function settleBackground(start, signal) {
  let run
  try {
    run = await start
    const result = await run.result
    if (result.stopReason === 'completed') return { status: 'completed', output: result.output }
    return signal.aborted ? { status: 'killed' } : { status: 'failed', detail: stopReasonError(result) }
  } catch (error) {
    return signal.aborted ? { status: 'killed' } : { status: 'failed', detail: String(error) }
  } finally {
    if (run) await run.dispose().catch(() => {})
  }
}

function rolesGuidance(settings) {
  const entries = Object.entries(settings.roles || {})
  if (!entries.length) return ''
  const lines = [`Subagent Conductor roles. Use ${TOOL_NAME} with a role id when a task matches:`]
  for (const [id, role] of entries) lines.push(`- ${id} — ${role.displayName}: ${role.description}`)
  lines.push('A role applies only to the directly created child; do not assume it propagates to nested subagents.')
  return lines.join('\n')
}

function toolDefinition(execute) {
  return {
    name: TOOL_NAME,
    description: 'Delegate a task to a role-bound subagent with optional per-call provider, model, and reasoning-effort overrides. The role applies only to this child. Per-call role/effort survives the fresh live residency but not a later continuable cold resume.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['description', 'prompt'],
      properties: {
        description: { type: 'string', description: 'A short 3-5 word display label.' },
        prompt: { type: 'string', description: 'The complete task for the child.' },
        role: { type: 'string', description: 'Role id; display name is accepted with a warning.' },
        provider: { type: 'string', description: 'Per-call LLM provider route.' },
        model: { type: 'string', description: 'Per-call model id.' },
        reasoning_effort: { type: 'string', description: 'Per-call reasoning effort id.' },
        run_in_background: { type: 'boolean', description: 'Run in background according to conductor settings.' },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.kind === 'foreground' ? outputText(value.output) : value.kind === 'continuable' ? `started subagent ${value.subagentId}` : `started background subagent job ${value.jobId}` }],
    },
    isConcurrencySafe: () => true,
    execute,
  }
}

export function apply(ctx) {
  let getSettings = () => normalizeSettings({})
  let settingsScope
  let disposeTool
  let mountedProvider
  const agents = () => ctx.get('agents')

  function unmountTool() {
    if (disposeTool) disposeTool()
    disposeTool = undefined
    mountedProvider = undefined
  }

  async function validateRoute(route, signal, strict) {
    if (!route.provider && !route.model) return { route, effort: undefined }
    if (!route.provider || !route.model) {
      if (strict) throw new Error('subagent-conductor: final route requires both provider and model')
      return undefined
    }
    try {
      const info = await ctx.llm.resolveModelInfo(route.provider, route.model, signal)
      const effort = normalizeReasoningEffort(info, route.reasoningEffort)
      if (route.reasoningEffort && !effort && strict) throw new Error(`subagent-conductor: ${route.provider}/${route.model} does not support effort ${route.reasoningEffort}`)
      return { route, effort }
    } catch (error) {
      if (strict) throw error
      ctx.logger.warn(`[${name}] ignored invalid configured route ${route.provider}/${route.model}: ${String(error?.message || error)}`)
      return undefined
    }
  }

  function mountTool(provider) {
    unmountTool()
    mountedProvider = provider.name
    disposeTool = ctx.tools.register(toolDefinition(async (args, exec) => {
      const parent = exec.agent
      if (!parent) throw new Error('subagent-conductor: calling agent unavailable')
      const live = getSettings()
      if (!Number.isSafeInteger(live.maxDepth) || live.maxDepth < 0) throw new Error('subagent-conductor: invalid maxDepth')
      const marker = makeMarker({ role: args.role, provider: args.provider, model: args.model, reasoningEffort: args.reasoning_effort })
      const rootId = findRootSessionId(parent, agents()) || parent.id
      const resolved = resolveRoute({ marker, session: live.sessionSelections[rootId], settings: live, applyDefaultRole: true })
      const validated = await validateRoute(resolved, exec.signal, true)
      const selectedRole = resolved.roleId ? live.roles[resolved.roleId] : undefined
      if (selectedRole?.persona && !provider.capabilities.persona) throw new Error(`subagent-conductor: transport ${provider.name} does not support persona`)
      if (selectedRole?.toolFilter && !provider.capabilities.toolFilter) throw new Error(`subagent-conductor: transport ${provider.name} does not support toolFilter`)
      if (!provider.capabilities.depthLimit) throw new Error(`subagent-conductor: transport ${provider.name} cannot enforce maxDepth`)
      const request = {
        label: args.description, prompt: [{ type: 'text', text: args.prompt }], parent,
        agentOptions: { ...(validated.route.provider ? { provider: validated.route.provider } : {}), ...(validated.route.model ? { model: validated.route.model } : {}), [MARKER_KEY]: marker },
        ...(selectedRole?.persona ? { persona: selectedRole.persona } : {}),
        ...(selectedRole?.toolFilter ? { toolFilter: selectedRole.toolFilter } : {}), maxDepth: live.maxDepth,
      }
      const background = live.enableRunInBackground && (args.run_in_background ?? live.backgroundMode === 'continuable')
      if (background && live.backgroundMode === 'continuable') {
        if (!provider.prepareContinuable) throw new Error(`subagent-conductor: transport ${provider.name} does not support continuable mode`)
        const start = await ctx.subagents.startContinuable({ provider: provider.name, label: args.description, request, signal: exec.signal })
        return { kind: 'continuable', subagentId: start.childId }
      }
      if (background) {
        const jobs = ctx.get('jobs')
        if (!jobs) throw new Error('subagent-conductor: jobs service unavailable')
        return { kind: 'background', jobId: jobs.start({ kind: 'subagent', label: args.description, owner: parent, run: () => {
          const controller = new AbortController()
          return { cancel: (reason) => controller.abort(reason || 'cancelled'), done: settleBackground(ctx.subagents.start(provider.name, { ...request, signal: controller.signal }), controller.signal) }
        } }) }
      }
      return settleForeground(await ctx.subagents.start(provider.name, { ...request, signal: exec.signal }))
    }))
  }

  function reconcileTool() {
    const providerName = getSettings().subagentProvider
    if (mountedProvider === providerName && disposeTool) return
    const provider = ctx.subagents.getProvider(providerName)
    if (provider) mountTool(provider)
    else unmountTool()
  }

  ctx.inject(['settings'], (sctx) => {
    settingsScope = sctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: normalizeSettings({}), applies: 'live', validate: validateSettings })
    getSettings = () => normalizeSettings(settingsScope.get())
    sctx.effect(() => settingsScope.watch(reconcileTool), `${name}: settings watch`)
    sctx.effect(() => () => { settingsScope = undefined; getSettings = () => normalizeSettings({}); reconcileTool() }, `${name}: settings fallback`)
    reconcileTool()
  })

  ctx.on('agent/request', async (payload, next) => {
    const base = await next()
    const agent = payload.agent
    if (!isSubagent(agent)) return base
    const settings = getSettings()
    const rootId = findRootSessionId(agent, agents())
    const marker = readMarker(agent)
    // Fresh children (subagentDepth >= 1) and marker-bearing residents reapply defaultRole;
    // continuable cold resume (origin=subagent, no depth, no marker) must not, and falls back to session > default > inherit.
    const applyDefaultRole = isFreshSubagent(agent) || marker !== undefined
    const resolved = resolveRoute({ marker, session: rootId ? settings.sessionSelections[rootId] : undefined, settings, applyDefaultRole })
    if (!resolved.provider && !resolved.model && !resolved.reasoningEffort) return base
    const validated = await validateRoute({ provider: resolved.provider || base.provider, model: resolved.model || base.model, reasoningEffort: resolved.reasoningEffort }, payload.signal, false)
    return validated ? applyResolvedRoute(base, validated.route, validated.effort) : base
  })

  ctx.on('subagent/provider-added', (provider) => { if (provider.name === getSettings().subagentProvider) reconcileTool() })
  ctx.on('subagent/provider-removed', (providerName) => { if (providerName === mountedProvider) unmountTool() })
  ctx.effect(() => () => unmountTool(), `${name}: tool cleanup`)
  reconcileTool()

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) systemPrompt.section({ name: `${name}:roles`, order: 117, text: () => rolesGuidance(getSettings()) })
}
