import test from 'node:test'
import assert from 'node:assert/strict'
import { createRoleDelegation, roleSnapshot, rolePrompt, assertRoleAuthorized } from '../lib/roles.js'
import plugin from '../lib/index.js'

function fixture({ saved = {}, roles, failWrite = false, failStart = false } = {}) {
  const tools = new Map(), handlers = new Map(), children = [], disposers = []
  let starts = 0
  let settings = { defaultRoute: { provider: 'global', model: 'global' }, sessionSelections: { parent: { provider: 'session', model: 'session' } }, roles: roles || { a: { displayName: 'Alpha', description: 'Alpha tasks', instructions: 'PRESET_ALPHA', provider: 'p', model: 'a', reasoningEffort: 'low' }, b: { displayName: 'Beta', description: 'Beta tasks', instructions: 'PRESET_BETA', provider: 'p', model: 'b' } } }
  const parent = { id: 'parent', options: { provider: 'p', model: 'base' }, model: { current: () => ({ provider: 'p', model: 'base' }), select() {} }, session: { header: {}, snapshotEvents: () => [{ type: 'subagent/model-selection-policy', data: { allowedModels: ['a', 'b'].map(model => ({ provider: 'p', model })) } }] } }
  const llmCalls = []
  const llm = { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }] } }), resolveCallConfig: async route => { llmCalls.push({ ...route }); return route } }
  const provider = { prepareContinuable() {}, inheritsParentContext: false, capabilities: { agentOptions: true, depthLimit: true } }
  const scoped = {
    storage: { backend: { get: () => ({ kv: { open: async () => ({ loadAll: async () => ({ tables: { bindings: structuredClone(saved) } }), putRecord: async (_table, id, record) => { if (failWrite) throw new Error('disk unavailable'); saved[id] = structuredClone(record) }, close: async () => {} }) } }) } },
    tools: { get: name => name === 'subagent' ? {} : tools.get(name), register: def => { tools.set(def.name, def); return () => tools.delete(def.name) } },
    subagents: { getProvider: () => provider, resolveMaxDepth: () => 3, startActivation: async spec => {
      starts++
      if (failStart) throw new Error('start rejected')
      let selected = spec.request.agentOptions
      const child = { id: spec.childId, options: selected, session: { header: { origin: 'subagent', parentSession: 'parent' } }, model: { current: () => selected, select: value => { selected = value } } }
      if (handlers.has('agent/created')) await handlers.get('agent/created')({ agent: child, source: 'startup', signal: spec.signal })
      children.push({ child, spec, route: () => selected })
      return { childId: spec.childId }
    } },
  }
  const ctx = { llm, logger: { warn() {} }, fiber: {}, get: key => key === 'agents' ? new Map([['parent', parent]]) : undefined, on: (event, callback) => handlers.set(event, callback), inject: (names, callback) => { if (names.includes('storage')) disposers.push(callback(scoped)) } }
  const config = Object.fromEntries(['defaultRoute', 'roles', 'sessionSelections', 'defaultRole'].map(key => [key, { get: () => settings[key], [Symbol.for('cosmokit.volatile.write')]() {} }]))
  plugin.apply(ctx, config)
  const exec = { agent: parent, signal: new AbortController().signal }
  return { ctx, parent, tools, saved, children, handlers, exec, llmCalls, starts: () => starts, set: value => { settings = value }, ready: () => handlers.get('agent/created')({ agent: { ...parent, session: { header: { origin: 'subagent' } } }, source: 'startup', signal: exec.signal }), dispose: async () => { for (const dispose of disposers) await dispose() }, call: (id, extra = {}) => tools.get('subagent_role').execute({ role_id: id, task: 'TASK_TOKEN', additional_instructions: 'EXTRA_TOKEN', description: 'Role test', ...extra }, exec) }
}

test('explicit role beats session/global routes and includes preset/task/additional guidance', async () => {
  const f = fixture(); await f.ready()
  const result = await f.call('a')
  assert.deepEqual(f.children[0].route(), { provider: 'p', model: 'a', reasoningEffort: 'low' })
  assert.equal(result.subagentId, f.children[0].child.id)
  assert.equal(f.children[0].spec.request.maxDepth, 3)
  for (const token of ['PRESET_ALPHA', 'TASK_TOKEN', 'EXTRA_TOKEN']) assert.ok(f.children[0].spec.request.prompt[0].text.includes(token))
  assert.equal(f.saved[result.subagentId].snapshot.revision, result.role_revision)
  await f.dispose()
})

test('concurrent roles persist distinct reserved identities and immutable snapshots', async () => {
  const f = fixture(); await f.ready()
  const results = await Promise.all([f.call('a'), f.call('b')])
  assert.notEqual(results[0].subagentId, results[1].subagentId)
  assert.deepEqual(results.map(item => f.saved[item.subagentId].snapshot.model), ['a', 'b'])
  f.set({ roles: {} })
  const child = f.children[0].child
  await f.handlers.get('agent/created')({ agent: child, source: 'resume', signal: f.exec.signal })
  assert.equal(f.children[0].route().model, 'a')
  await f.dispose()
  const restored = fixture({ saved: f.saved, roles: {} }); await restored.ready()
  let selected
  await restored.handlers.get('agent/created')({ agent: { ...child, model: { current: () => ({ provider: 'other', model: 'other' }), select: value => { selected = value } } }, source: 'resume', signal: restored.exec.signal })
  assert.equal(selected.model, 'a')
  await restored.dispose()
})

test('a role without an effort inherits it on an unchanged route and drops it on a route change', async () => {
  // The role editor labels the empty effort "继承" (inherit), and the Host keeps the
  // parent effort for an unchanged route (resolveChildAgentOptions). Re-selecting the
  // bare pair would strip it, so the binding path must reuse the configured-route
  // merge: inherit when unchanged, clear when the provider/model pair moves.
  const f = fixture(); await f.ready()
  await f.call('b')
  const child = f.children[0].child
  const resume = async (current) => {
    let selected
    const agent = { ...child, model: { current: () => current, select: (value) => { selected = value } } }
    await f.handlers.get('agent/created')({ agent, source: 'resume', signal: f.exec.signal })
    return selected
  }
  assert.deepEqual(await resume({ provider: 'p', model: 'b', reasoningEffort: 'high' }), { provider: 'p', model: 'b', reasoningEffort: 'high' })
  assert.deepEqual(await resume({ provider: 'p', model: 'base', reasoningEffort: 'high' }), { provider: 'p', model: 'b' })
  // Only what the role declares is preflighted: the inherited effort was already
  // applied to this child, and the ordinary path never re-validates a kept value.
  assert.deepEqual(f.llmCalls.at(-1), { provider: 'p', model: 'b' })
  assert.equal(f.llmCalls.some((call) => call.reasoningEffort === 'high'), false)
  await f.dispose()
})

test('strict role errors prevent creation and cancellation is observed', async () => {
  const f = fixture(); await f.ready()
  await assert.rejects(f.call('unknown'), /Unknown role/)
  await assert.rejects(f.call('a', { task: '' }), /task/)
  f.set({ roles: { incomplete: { displayName: 'I', description: 'I' }, effort: { displayName: 'E', description: 'E', provider: 'p', model: 'a', reasoningEffort: 'unsupported' }, denied: { displayName: 'D', description: 'D', provider: 'p', model: 'denied' } } })
  await assert.rejects(f.call('incomplete'), /complete/)
  await assert.rejects(f.call('effort'), /unsupported/)
  await assert.rejects(f.call('denied'), /not authorized/)
  assert.equal(f.starts(), 0)
  await f.dispose()
  const canceled = fixture(); await canceled.ready(); canceled.exec.signal = AbortSignal.abort()
  await assert.rejects(canceled.call('a'))
  assert.equal(canceled.starts(), 0)
  await canceled.dispose()
})

test('storage failure prevents activation; failed activation preserves recoverable binding', async () => {
  const disk = fixture({ failWrite: true }); await disk.ready()
  await assert.rejects(disk.call('a'), /disk unavailable/)
  assert.equal(disk.starts(), 0); await disk.dispose()
  const start = fixture({ failStart: true }); await start.ready()
  await assert.rejects(start.call('a'), /start rejected/)
  assert.equal(Object.keys(start.saved).length, 1); await start.dispose()
})

test('role discovery keeps instructions deferred, and disposal removes both tools', async () => {
  const f = fixture(); await f.ready()
  const directory = await f.tools.get('list_subagent_roles').execute({})
  assert.equal(directory.roles.length, 2)
  assert.equal('instructions' in directory.roles[0], false)
  assert.equal((await f.tools.get('list_subagent_roles').execute({ role_id: 'a' })).instructions, 'PRESET_ALPHA')
  await f.dispose(); assert.equal(f.tools.size, 0)
})

test('optional storage failure does not block ordinary child initialization', async () => {
  const warnings = []
  const ctx = {
    logger: { warn: message => warnings.push(message) },
    inject: (_names, callback) => callback({ storage: { backend: { get: () => ({ kv: { open: async () => { throw new Error('storage offline') } } }) } } }),
  }
  const roles = createRoleDelegation(ctx, () => ({ roles: {} }))
  assert.equal(await roles.binding({ id: 'ordinary' }), undefined)
  assert.match(roles.status(), /storage offline/)
  assert.equal(warnings.length, 1)
})

test('snapshot revision changes with guidance and policy is first-recorded', () => {
  const role = { displayName: 'A', provider: 'p', model: 'a', instructions: 'one' }
  const one = roleSnapshot('a', role), two = roleSnapshot('a', { ...role, instructions: 'two' })
  assert.notEqual(one.revision, two.revision)
  assert.ok(rolePrompt(one, 'task', '').includes('one'))
  const parent = { model: { current: () => ({ provider: 'p', model: 'a' }) }, session: { snapshotEvents: () => [] } }
  assert.doesNotThrow(() => assertRoleAuthorized(parent, one))
  assert.throws(() => assertRoleAuthorized(parent, { provider: 'p', model: 'b' }), /not authorized/)
})
