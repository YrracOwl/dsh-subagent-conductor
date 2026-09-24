import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../lib/index.js'
import { findRootSessionId, isSubagent, validateSettings } from '../lib/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// These DSH white-box tests inspect the locally installed DSH implementation.
// A public package CI runner has no DSH checkout, so require an explicit
// opt-in path and skip only those checks when it is unavailable. Never guess
// a host path: on POSIX, a Windows path would become a bogus relative path.
const dshRoot = typeof process.env.DSH_CHECKOUT === 'string' && process.env.DSH_CHECKOUT.length > 0
  ? path.resolve(process.env.DSH_CHECKOUT)
  : undefined
const subagentImpl = dshRoot && path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js')
const agentImpl = dshRoot && path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-agent/lib/index.js')
const readDshFile = (file) => file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined

test('DSH resolves the child AgentOptions route at creation (official layer source)', { skip: !subagentImpl || !fs.existsSync(subagentImpl) }, () => {
  const source = readDshFile(subagentImpl)
  // Provider/model (and effort when supplied) become child options before the
  // first request; the Host conductor reads that snapshot as the official
  // layer. Explicit model-facing choices and tool-instance defaults both land
  // here, so the listener never needs a private marker.
  assert.match(source, /resolveChildAgentOptions\(parent, request\.agentOptions, childDepth\)/)
  assert.match(source, /agentProvider = agentOptions\.provider/)
  assert.match(source, /agentReasoningEffort = agentOptions\.reasoningEffort/)
  assert.doesNotMatch(source, /__dshSubagentConductor/)
})

test('DSH dispatches agent/request as a waterfall with resolved config', { skip: !agentImpl || !fs.existsSync(agentImpl) }, () => {
  const source = readDshFile(agentImpl)
  assert.match(source, /agentCtx\.on\("agent\/request", async \(_payload, next\) => \{/)
  assert.match(source, /const resolved = await next\(\)/)
})

test('conductor source carries no private marker or delegation tool', () => {
  const index = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  const config = fs.readFileSync(new URL('../lib/config.js', import.meta.url), 'utf8')
  const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  for (const source of [index, config, client]) {
    assert.doesNotMatch(source, /__dshSubagentConductor|MARKER_KEY|makeMarker|readMarker|subagent_direct/)
    assert.doesNotMatch(source, /ctx\.subagents\.start\s*=|ctx\.subagents\.startContinuable\s*=/)
  }
})

test('cold-resumed and fresh children are detected by origin without any marker', () => {
  const agent = { options: { provider: 'p', model: 'm' }, session: { header: { origin: 'subagent' } } }
  assert.equal(isSubagent(agent), true)
  assert.equal(isSubagent({ options: { subagentDepth: 1 }, session: { header: { origin: 'session' } } }), true)
  assert.equal(isSubagent({ options: {}, session: { header: { origin: 'session' } } }), false)
  assert.equal(isSubagent({ options: {}, session: { header: { id: 'root' } } }), false)
})

test('nested child resolves the non-subagent root and detects cycles', () => {
  const root = { id: 'root', session: { header: { id: 'root' } } }
  const child = { id: 'child', session: { header: { id: 'child', origin: 'subagent', parentSession: 'root' } } }
  const grandchild = { id: 'grand', session: { header: { id: 'grand', origin: 'subagent', parentSession: 'child' } } }
  const agents = new Map([['root', root], ['child', child], ['grand', grandchild]])
  assert.equal(findRootSessionId(grandchild, agents), 'root')
  root.session.header = { id: 'root', origin: 'subagent', parentSession: 'grand' }
  assert.equal(findRootSessionId(grandchild, agents), undefined)
})

// ── both settings hosts, exercised through the real listener ────────────────
// A volatile field's parsed value is a cosmokit wrapper: get() plus the
// registered write symbol, and deliberately NO `.set` — the reader must key on
// the symbol, so a box that exposed `.set` would make these fakes unfaithful.
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')
function box(initial) {
  let value = initial
  return { get: () => value, setValue: (next) => { value = next }, [VOLATILE_WRITE]() {} }
}

function makeHarness(settings, config) {
  const handlers = new Map()
  const effects = []
  const fiber = { id: 'conductor-entry-fiber' }
  const ctx = {
    fiber,
    logger: { warn() {} },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [] } }) },
    get() { return undefined },
    inject(names, callback) {
      if (names.includes('settings')) callback({ settings, effect: (execute) => { effects.push(execute()); return () => {} } })
    },
    on(event, handler) { handlers.set(event, handler) },
  }
  plugin.apply(ctx, config)
  const request = (payload, base) => handlers.get('agent/request')(payload, async () => base)
  return { request, effects, fiber }
}

const CHILD = { agent: { id: 'agent-1', options: { subagentDepth: 1 }, session: { header: { origin: 'session' } } } }

test('declarative host suppresses the generated page and routes from the live Config', async () => {
  const selections = box({ 'agent-1': { provider: 'session-p', model: 'session-m' } })
  const config = {
    defaultRoute: { provider: box('default-p'), model: box('default-m'), reasoningEffort: box(undefined) },
    defaultRole: box(undefined),
    roles: box({}),
    sessionSelections: selections,
  }
  const calls = []
  const { request, fiber } = makeHarness({ configure: (presentation, owner) => { calls.push([presentation, owner]); return () => {} } }, config)
  // configure(presentation, owner) is keyed by the plugin entry's own fiber.
  assert.deepEqual(calls, [[{ auto: false }, fiber]])
  const base = { provider: 'official-p', model: 'official-m' }
  assert.deepEqual(await request(CHILD, base), { provider: 'session-p', model: 'session-m' })
  // The settings service edits volatile fields in place without remounting the
  // entry, so the next request must observe the edited value: nothing is cached.
  selections.setValue({ 'agent-1': { provider: 'edited-p', model: 'edited-m' } })
  assert.deepEqual(await request(CHILD, base), { provider: 'edited-p', model: 'edited-m' })
})

test('declarative host degrades to empty settings when the Config is invalid', async () => {
  const config = {
    defaultRoute: { provider: box('default-p'), model: box('default-m'), reasoningEffort: box(undefined) },
    defaultRole: box(undefined),
    roles: box({ 'Not_Kebab': { displayName: 'Bad', description: 'Bad id' } }),
    sessionSelections: box({}),
  }
  const { request } = makeHarness({ configure: () => () => {} }, config)
  const base = { provider: 'official-p', model: 'official-m' }
  // A rejected Config must never break routing: it degrades to the empty
  // conductor layers and the official/inherited request passes untouched.
  assert.deepEqual(await request(CHILD, base), base)
})

test('declarative host is inert when the settings service is absent or register-less', async () => {
  const base = { provider: 'official-p', model: 'official-m' }
  for (const settings of [undefined, {}, { read: () => ({}) }]) {
    const { request, effects } = makeHarness(settings, undefined)
    assert.deepEqual(await request(CHILD, base), base)
    assert.equal(effects.length, 0)
  }
})

test('legacy host still registers the namespace and routes from its scope', async () => {
  const registrations = []
  const settings = {
    register: (ns, schema, options) => {
      registrations.push({ ns, schema, options })
      return { get: () => ({ defaultRoute: { provider: 'legacy-p', model: 'legacy-m' } }) }
    },
  }
  const { request, effects } = makeHarness(settings, undefined)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].ns, 'subagent-conductor')
  assert.equal(registrations[0].options.validate, validateSettings)
  assert.deepEqual(await request(CHILD, { provider: 'official-p', model: 'official-m' }), { provider: 'legacy-p', model: 'legacy-m' })
  assert.equal(effects.length, 1)
  // Disposal mirrors the declarative branch: routing falls back to empty.
  effects[0]()
  assert.deepEqual(await request(CHILD, { provider: 'official-p', model: 'official-m' }), { provider: 'official-p', model: 'official-m' })
})
