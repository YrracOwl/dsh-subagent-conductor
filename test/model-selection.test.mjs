import test from 'node:test'
import assert from 'node:assert/strict'
import plugin from '../lib/index.js'

const WRITE = Symbol.for('cosmokit.volatile.write')
function fixture(initial, { resolve, origin = 'subagent', source = 'startup', deferSettings = false } = {}) {
  let settings = initial
  const handlers = new Map()
  const warnings = []
  const selections = []
  let current = { provider: 'official', model: 'original', reasoningEffort: 'high' }
  const root = { id: 'root', session: { header: {} } }
  const child = {
    id: 'child', options: { ...current },
    session: { header: { origin, parentSession: 'root' } },
    model: { current: () => ({ ...current }), select(value) { selections.push(value); current = value } },
  }
  const ctx = {
    fiber: {}, logger: { warn: (text) => warnings.push(text) },
    get: (name) => name === 'agents' ? new Map([['root', root], ['child', child]]) : undefined,
    llm: { resolveModelInfo: resolve || (async () => ({ reasoning: { efforts: [{ id: 'low' }] } })) },
    on: (event, fn) => handlers.set(event, fn),
    inject(names, fn) { if (!deferSettings && names.includes('settings')) fn({ settings: { configure() {} }, effect: (run) => run() }) },
  }
  const config = Object.fromEntries(['defaultRoute', 'defaultRole', 'roles', 'sessionSelections'].map(key => [key, { get: () => settings[key], [WRITE]() {} }]))
  plugin.apply(ctx, config)
  return {
    child, warnings, selections, set: value => { settings = value },
    create: (signal) => handlers.get('agent/created')({ agent: child, source, signal }),
    request: base => handlers.get('agent/request')({ agent: child }, async () => base),
    current: () => current,
  }
}

test('awaited initialization selects configured route before model/tool preparation', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const f = fixture({ defaultRoute: { provider: 'configured', model: 'target', reasoningEffort: 'low' } }, {
    resolve: async () => { await gate; return { reasoning: { efforts: [{ id: 'low' }] } } },
  })
  const initializing = f.create()
  assert.equal(f.selections.length, 0)
  release()
  await initializing
  const prepared = { ...f.current(), maxTokens: 100 }
  assert.deepEqual(prepared, { provider: 'configured', model: 'target', reasoningEffort: 'low', maxTokens: 100 })
  assert.equal(await f.request(prepared), prepared, 'request must retain the exact prepared config')
})

test('session selection wins over role, global and explicit official route', async () => {
  const f = fixture({
    defaultRoute: { provider: 'global', model: 'global' },
    defaultRole: 'reviewer', roles: { reviewer: { displayName: 'Reviewer', description: 'Review route', provider: 'role', model: 'role' } },
    sessionSelections: { root: { provider: 'session', model: 'session' } },
  })
  await f.create()
  assert.deepEqual(f.current(), { provider: 'session', model: 'session' })
})

test('volatile edits are read on each new/resumed initialization', async () => {
  const f = fixture({ defaultRoute: { provider: 'before', model: 'before' } }, { source: 'resume' })
  f.set({ defaultRoute: { provider: 'after', model: 'after' } })
  await f.create()
  assert.deepEqual(f.current(), { provider: 'after', model: 'after' })
  const prepared = f.current()
  f.set({ defaultRoute: { provider: 'later', model: 'later' } })
  assert.equal(await f.request(prepared), prepared, 'live edit must not replace an already prepared route')
})

test('declarative routing works before optional settings service injection', async () => {
  const f = fixture({ defaultRoute: { provider: 'configured', model: 'target' } }, { deferSettings: true })
  await f.create()
  assert.deepEqual(f.current(), { provider: 'configured', model: 'target' })
})

test('complete configured route works without an initial official model', async () => {
  const f = fixture({ defaultRoute: { provider: 'configured', model: 'target' } })
  f.child.options = {}
  f.child.model.current = () => undefined
  await f.create()
  assert.deepEqual(f.current(), { provider: 'configured', model: 'target' })
})

test('empty config and top-level agents retain official selection', async () => {
  for (const f of [fixture({}), fixture({ defaultRoute: { provider: 'p', model: 'm' } }, { origin: 'session' })]) {
    await f.create()
    assert.equal(f.selections.length, 0)
    assert.deepEqual(f.current(), { provider: 'official', model: 'original', reasoningEffort: 'high' })
  }
})

test('unknown routes warn and retain official selection', async () => {
  const f = fixture({ defaultRoute: { provider: 'missing', model: 'missing' } }, { resolve: async () => { throw new Error('unknown model') } })
  await f.create()
  assert.equal(f.selections.length, 0)
  assert.match(f.warnings[0], /ignored conductor route missing\/missing/)
})

test('unsupported effort clears inherited effort on route change; same-route invalid effort is inert', async () => {
  const changed = fixture({ defaultRoute: { provider: 'other', model: 'other', reasoningEffort: 'unsupported' } })
  await changed.create()
  assert.deepEqual(changed.current(), { provider: 'other', model: 'other' })
  const same = fixture({ defaultRoute: { provider: 'official', model: 'original', reasoningEffort: 'unsupported' } })
  await same.create()
  assert.equal(same.selections.length, 0)
})

test('same-route supported effort applies and cancellation prevents a selection', async () => {
  const same = fixture({ defaultRoute: { provider: 'official', model: 'original', reasoningEffort: 'low' } })
  await same.create()
  assert.deepEqual(same.current(), { provider: 'official', model: 'original', reasoningEffort: 'low' })
  const controller = new AbortController()
  const canceled = fixture({ defaultRoute: { provider: 'other', model: 'other' } }, { resolve: async () => { controller.abort(); return {} } })
  await canceled.create(controller.signal)
  assert.equal(canceled.selections.length, 0)
})
