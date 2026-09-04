// dsh-subagent-conductor — Host half (v0.2)
//
// Settings and default-route layer over the OFFICIAL subagent tools. This
// package does NOT register a delegation tool, does NOT read or write a
// private AgentOptions marker, and never wraps ctx.subagents methods. The
// official tool rows (tool-subagent / tool-subagent-fork) own delegation and
// explicit model-facing selection.
//
// One agent/request listener applies the conductor layers first:
//
//   root-session selection > default role > global default > official choice
//
// "Official choice" is the creation-time child AgentOptions snapshot
// (explicit model-facing route, tool-instance config default, or the parent
// route copied at creation). When every conductor layer is empty the listener
// returns next()'s config untouched, so pure official/inherit flows never
// change. Conductor routes are validated as exact provider/model pairs; a
// conductor reasoning effort is applied only when that exact model publishes
// it. Invalid configured routes degrade with a warning and leave the
// official/inherited request intact — stock delegation never breaks.

import Schema from '@deepseek-ai/schemastery'
import {
  SETTINGS_NAMESPACE,
  applyResolvedRoute,
  decideRequestRoute,
  findRootSessionId,
  isSubagent,
  normalizeReasoningEffort,
  normalizeSettings,
  resolveRoute,
  validateSettings,
} from './config.js'

const RouteSchema = Schema.object({ provider: Schema.string(), model: Schema.string(), reasoningEffort: Schema.string() })
const RoleSchema = Schema.object({
  displayName: Schema.string(),
  description: Schema.string(),
  provider: Schema.string(),
  model: Schema.string(),
  reasoningEffort: Schema.string(),
})
const SettingsSchema = Schema.object({
  defaultRoute: RouteSchema.default({}),
  defaultRole: Schema.string(),
  roles: Schema.dict(RoleSchema).default({}),
  sessionSelections: Schema.dict(RouteSchema).default({}),
})

export const name = 'dsh-subagent-conductor'
export const inject = ['llm']

/** Detached provider/model/effort snapshot carried on the child AgentOptions. */
function officialOptions(agent) {
  const options = agent?.options && typeof agent?.options === 'object' ? agent.options : {}
  return {
    ...(typeof options.provider === 'string' && options.provider ? { provider: options.provider } : {}),
    ...(typeof options.model === 'string' && options.model ? { model: options.model } : {}),
    ...(typeof options.reasoningEffort === 'string' && options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
  }
}

export function apply(ctx) {
  let getSettings = () => normalizeSettings({})

  ctx.inject(['settings'], (sctx) => {
    const settingsScope = sctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, {
      base: normalizeSettings({}),
      applies: 'live',
      validate: validateSettings,
    })
    getSettings = () => normalizeSettings(settingsScope.get())
    sctx.effect(() => () => {
      getSettings = () => normalizeSettings({})
    }, `${name}: settings fallback`)
  })

  ctx.on('agent/request', async (payload, next) => {
    const base = await next()
    const agent = payload?.agent
    if (!isSubagent(agent)) return base
    const settings = getSettings()
    const agents = ctx.get('agents')
    const rootId = findRootSessionId(agent, agents)
    const conductor = resolveRoute({
      session: rootId ? settings.sessionSelections[rootId] : undefined,
      settings,
    })
    const official = officialOptions(agent)
    const intent = decideRequestRoute(base, conductor, official)
    if (!intent) return base
    const changed = intent.provider !== base?.provider || intent.model !== base?.model
    if (!changed && !intent.conductorEffort) return base
    let modelInfo
    try {
      modelInfo = await ctx.llm.resolveModelInfo(intent.provider, intent.model, payload?.signal)
    } catch (error) {
      ctx.logger.warn(`[${name}] ignored conductor route ${intent.provider}/${intent.model}: ${String(error?.message || error)}`)
      return base
    }
    let effort
    if (intent.conductorEffort) {
      effort = normalizeReasoningEffort(modelInfo, intent.conductorEffort)
      if (!effort) {
        ctx.logger.warn(`[${name}] ${intent.provider}/${intent.model} does not publish reasoning effort "${intent.conductorEffort}"; ${changed ? 'switching route without effort' : 'keeping the official request'}`)
        if (!changed) return base
      }
    }
    return applyResolvedRoute(base, intent, effort)
  })
}
