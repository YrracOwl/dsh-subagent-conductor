import { createHash, randomUUID } from 'node:crypto'
import { normalizeReasoningEffort } from './config.js'

const UNIT = { name: 'subagent_conductor_roles', version: 1, tables: ['bindings'], hasGlobal: false, layout: 'single' }
const text = (value, field, required = false) => {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || (required && !value.trim())) throw new Error(`${field} must be a non-empty string`)
  return value
}
const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }

export function roleSnapshot(roleId, role) {
  if (!role || !role.provider || !role.model) throw new Error(`Role "${roleId}" requires a complete provider/model route`)
  const snapshot = { roleId, displayName: role.displayName, instructions: role.instructions || '', provider: role.provider, model: role.model, ...(role.reasoningEffort ? { reasoningEffort: role.reasoningEffort } : {}) }
  return { ...snapshot, revision: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') }
}

export function rolePrompt(snapshot, task, extra) {
  return [
    `Role: ${snapshot.displayName} (${snapshot.roleId})\nRole revision: ${snapshot.revision}`,
    `Role guidance:\n${snapshot.instructions || '(No preset guidance.)'}`,
    `Current task:\n${task}`,
    ...(extra ? [`Additional task requirements:\n${extra}`] : []),
  ].join('\n\n')
}

// The official tool checks this durable policy at model-authored delegation.
// Read the first policy event exactly as the official projection does; never
// infer authorization from provider availability or the conductor role list.
export function assertRoleAuthorized(parent, route) {
  const events = parent.session.snapshotEvents()
  const policy = events.find(event => event.type === 'subagent/model-selection-policy')?.data?.allowedModels
  const current = parent.model?.current() || parent.options || {}
  const allowed = policy === undefined
    ? current.provider === route.provider && current.model === route.model
    : Array.isArray(policy) && policy.some(item => item.provider === route.provider && item.model === route.model)
  if (!allowed) throw new Error(`Role route ${route.provider}/${route.model} is not authorized for this Session`)
}

export function createRoleDelegation(ctx, getSettings) {
  let mounted
  let initializing
  let unavailable = 'Role delegation requires the current Host storage and subagent services'
  ctx.inject(['tools', 'subagents', 'storage', 'storage.backend.json'], sctx => {
    let disposed = false
    let unit
    let writes = Promise.resolve()
    const records = new Map()
    const disposers = []
    const save = (id, value) => {
      const work = writes.then(async () => {
        if (disposed) throw new Error('Role delegation was unloaded')
        await unit.putRecord('bindings', id, value)
        records.set(id, value)
      })
      writes = work.catch(() => {})
      return work
    }
    initializing = (async () => {
      unit = await sctx.storage.backend.get('json').kv.open(UNIT)
      const loaded = await unit.loadAll()
      for (const [id, record] of Object.entries(loaded.tables.bindings || {})) records.set(id, record)
      if (disposed) return
      mounted = { records, save }
      const register = definition => disposers.push(sctx.tools.register(definition))
      register({
        name: 'list_subagent_roles',
        description: 'List reusable subagent roles and their models. Supply role_id to read its preset guidance before calling subagent_role.',
        parameters: { type: 'object', properties: { role_id: { type: 'string', description: 'Exact role id; omit for a compact role directory.' } }, additionalProperties: false },
        output,
        isConcurrencySafe: () => true,
        async execute(args) {
          const roles = getSettings().roles
          if (args.role_id !== undefined) {
            const id = text(args.role_id, 'role_id', true)
            if (!Object.hasOwn(roles, id)) throw new Error(`Unknown role: ${id}`)
            return { role_id: id, ...roles[id], callable: !!(roles[id].provider && roles[id].model) }
          }
          return { roles: Object.entries(roles).map(([id, role]) => ({ role_id: id, displayName: role.displayName, description: role.description, provider: role.provider || null, model: role.model || null, reasoningEffort: role.reasoningEffort || null, callable: !!(role.provider && role.model) })) }
        },
      })
      register({
        name: 'subagent_role',
        description: 'Start a fresh-context subagent using a saved role’s model and preset guidance. Returns its id and role snapshot; completion arrives asynchronously. Use send_message for follow-ups. Discover roles with list_subagent_roles.',
        parameters: {
          type: 'object', additionalProperties: false, required: ['role_id', 'task', 'description'],
          properties: {
            role_id: { type: 'string', description: 'Exact saved role id. Its complete model route overrides conductor session/global defaults while remaining subject to Host authorization.' },
            task: { type: 'string', description: 'Self-contained task, including necessary context; the child does not inherit this conversation.' },
            additional_instructions: { type: 'string', description: 'Optional task-specific scope, priorities, or output requirements appended to the role guidance.' },
            description: { type: 'string', description: 'Short task label shown in the subagent list.' },
            cwd: { type: 'string', description: 'Initial working directory; relative paths use the parent directory, omission inherits it.' },
          },
        },
        output,
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (disposed) throw new Error('Role delegation was unloaded')
          const parent = exec.agent
          if (!parent || typeof parent.model?.select !== 'function') throw new Error('Role delegation requires a current Host agent')
          if (!sctx.tools.get('subagent', parent)) throw new Error('Role delegation requires subagent delegation to be available in the calling scope')
          const id = text(args.role_id, 'role_id', true)
          const task = text(args.task, 'task', true)
          const extra = text(args.additional_instructions, 'additional_instructions')
          const label = text(args.description, 'description', true)
          if (args.cwd !== undefined) text(args.cwd, 'cwd', true)
          const roles = getSettings().roles
          if (!Object.hasOwn(roles, id)) throw new Error(`Unknown role: ${id}`)
          const snapshot = roleSnapshot(id, roles[id])
          assertRoleAuthorized(parent, snapshot)
          const provider = sctx.subagents.getProvider('spawn')
          if (!provider?.prepareContinuable || provider.inheritsParentContext || !provider.capabilities.agentOptions || !provider.capabilities.depthLimit) throw new Error('Role delegation requires the official continuable spawn provider')
          const model = await ctx.llm.resolveModelInfo(snapshot.provider, snapshot.model, exec.signal)
          if (snapshot.reasoningEffort && !normalizeReasoningEffort(model, snapshot.reasoningEffort)) throw new Error(`Role ${id} uses an unsupported reasoning effort`)
          const route = { provider: snapshot.provider, model: snapshot.model, ...(snapshot.reasoningEffort ? { reasoningEffort: snapshot.reasoningEffort } : {}) }
          await ctx.llm.resolveCallConfig(route, exec.signal)
          exec.signal.throwIfAborted()
          if (sctx.subagents.getProvider('spawn') !== provider) throw new Error('Subagent provider changed; retry role delegation')
          const childId = randomUUID()
          const record = { version: 1, childId, parentId: parent.id, snapshot, createdAt: Date.now() }
          await save(childId, record)
          exec.signal.throwIfAborted()
          const maxDepth = sctx.subagents.resolveMaxDepth()
          // A reserved id makes the saved binding visible to awaited creation.
          // Keep failed-start records: a partial accepted activation may resume.
          const activation = await sctx.subagents.startActivation({
            provider: 'spawn', childId, label, signal: exec.signal, delivery: 'parent',
            request: { parent, prompt: [{ type: 'text', text: rolePrompt(snapshot, task, extra) }], agentOptions: route, ...(args.cwd === undefined ? {} : { cwd: args.cwd }), ...(maxDepth === undefined ? {} : { maxDepth }) },
          })
          if (activation.childId !== childId) throw new Error('Host did not honor the reserved child identity')
          return { subagentId: childId, role_id: id, role_revision: snapshot.revision, route }
        },
      })
    })().catch(async error => {
      mounted = undefined
      for (const dispose of disposers.splice(0).reverse()) dispose()
      await unit?.close()
      unit = undefined
      unavailable = `Role delegation unavailable: ${String(error?.message || error)}`
      ctx.logger.warn(unavailable)
      throw error
    })
    // The routing listener awaits this too; avoid an unhandled rejection while
    // the optional service attachment is pending without a child creation.
    initializing.catch(() => {})
    return async () => {
      disposed = true
      for (const dispose of disposers.reverse()) dispose()
      mounted = undefined
      await initializing.catch(() => {})
      await writes
      await unit?.close()
    }
  })
  return {
    async binding(agent) {
      // Optional role storage must not disable ordinary delegation. When it
      // cannot load, ordinary routing remains available; role tools are
      // withdrawn and the warning identifies degraded binding restoration.
      if (initializing) {
        try { await initializing } catch { return undefined }
      }
      const record = mounted?.records.get(agent.id)
      if (!record) return undefined
      if (record.version !== 1 || record.childId !== agent.id || record.parentId !== agent.session.header.parentSession || record.snapshot?.revision !== roleSnapshot(record.snapshot.roleId, record.snapshot).revision) throw new Error(`Invalid persisted role binding for ${agent.id}`)
      return record.snapshot
    },
    status: () => mounted ? undefined : unavailable,
  }
}
