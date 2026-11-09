import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import plugin from '../lib/index.js'
import { findRootSessionId, isSubagent, validateSettings } from '../lib/config.js'

// These DSH white-box guards inspect the locally installed DSH implementation.
// A public package CI runner has no DSH checkout, so require an explicit opt-in
// path and skip only those checks when it is unavailable. Never guess a host
// path: on POSIX, a Windows path would become a bogus relative path.
//
// Plain Node cannot read an app.asar install (fs.stat/readdir fail there), so an
// asar DSH_CHECKOUT skips under `npm test`. Run the same file through Electron's
// Node mode (`ELECTRON_RUN_AS_NODE=1 <app.exe> --test --test-isolation=none`) to
// execute these guards against an installed desktop asar.
const dshRoot = typeof process.env.DSH_CHECKOUT === 'string' && process.env.DSH_CHECKOUT.length > 0
  ? path.resolve(process.env.DSH_CHECKOUT)
  : undefined

function hostDir(packageName) {
  if (dshRoot === undefined) return undefined
  const dir = path.join(dshRoot, 'node_modules', '@deepseek-ai', packageName)
  return fs.existsSync(dir) ? dir : undefined
}

// Concatenate one installed package's JavaScript sources. The guards below are
// CONTRACT checks: they look for the host's own vocabulary (event names, API
// calls, guard messages) wherever THIS version keeps it, so a module moving
// between `lib/index.js` and `lib/types/*.js` cannot make a valid host look
// broken. Asserting one fixed file layout is what made the previous guards
// stale on 0.2.x.
function hostSources(packageName) {
  const dir = hostDir(packageName)
  if (dir === undefined) return undefined
  const parts = []
  const walk = (current) => {
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
        try { parts.push(fs.readFileSync(full, 'utf8')) } catch { /* an unreadable file is not a contract hit */ }
      }
    }
  }
  walk(path.join(dir, 'lib'))
  return parts.length === 0 ? undefined : parts.join('\n')
}

function hostVersion() {
  if (dshRoot === undefined) return undefined
  const candidates = [path.join(dshRoot, 'package.json'), path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof manifest.version === 'string' && manifest.version.length > 0) return manifest.version
    } catch { /* a malformed manifest is simply not a version source */ }
  }
  return undefined
}

const agentSource = hostSources('dsh-agent')
const loopSource = hostSources('dsh-agent-loop')
const subagentSource = hostSources('dsh-subagent')
const version = hostVersion()
const readable = agentSource !== undefined && loopSource !== undefined && subagentSource !== undefined
// The plugin supports `>=0.1.2-rc.1 <0.3.0-0` and splits its routing on ONE host
// capability: a durable `agent.model.select()` usable from the awaited
// `agent/created` boundary. Which release first shipped it inside that range is
// NOT verified, so this guard branches on the INSTALLED host's own vocabulary
// instead of guessing a version boundary — the detected version is printed in
// each test name and diagnostic. Sampled evidence: 0.1.7-rc.2 (request waterfall,
// no durable selection) and 0.2.2-rc.1 (creation-time selection).
const durableSelection = agentSource !== undefined && /session\.append\(["']model\/selection["']/.test(agentSource)
const hostIdentity = version === undefined ? 'unknown-version host' : `DSH ${version}`
const unreadable = 'set DSH_CHECKOUT to a DSH install root this process can read (plain Node cannot read app.asar)'
const skipCreation = readable ? (durableSelection ? false : `${hostIdentity} records no durable model selection`) : unreadable
const skipLegacy = readable ? (durableSelection ? `${hostIdentity} records a durable model selection` : false) : unreadable

test(`${hostIdentity}: creation-time routing contract (durable model selection)`, { skip: skipCreation }, (t) => {
  t.diagnostic(`${hostIdentity} detects a durable model selection; asserting the creation-time boundary`)
  // The conductor reads the official layer from the child's creation-time
  // AgentOptions snapshot, so the Host must still resolve it there.
  assert.match(subagentSource, /resolveChildAgentOptions\(parent, request\.agentOptions, childDepth\)/, `${hostIdentity}: child AgentOptions are no longer resolved at creation`)
  // Creation routing is legal only because listeners of `agent/created` complete
  // before the child is announced as created / its first input is admitted.
  assert.match(agentSource, /\bserial\([^)]*["']agent\/created["']/, `${hostIdentity}: agent/created is no longer a serial (awaited) dispatch`)
  // `agent.model.select()` must record a durable selection event; without it the
  // creation-time route could not survive into step preparation.
  assert.match(agentSource, /session\.append\(["']model\/selection["']/, `${hostIdentity}: model selection is no longer recorded durably`)
  // The step fixes its selection before `agent/request`, and a late rewrite is a
  // hard error — which is why the request listener must stay inert here.
  assert.match(loopSource, /waterfall\(["']agent\/request["']/, `${hostIdentity}: agent/request is no longer a waterfall`)
  assert.match(loopSource, /use agent\.model\.select\(\) before step preparation/, `${hostIdentity}: a late agent/request model change is no longer rejected`)
})

test(`${hostIdentity}: request-waterfall routing contract (no durable model selection)`, { skip: skipLegacy }, (t) => {
  t.diagnostic(`${hostIdentity} has no durable model selection; asserting the legacy waterfall boundary`)
  // This is the seam the guarded legacy listener targets. On these hosts there is
  // no durable model selection, so the waterfall is the only place a route can be
  // applied at all.
  assert.match(agentSource, /agentCtx\.on\(["']agent\/request["'], async \(_payload, next\) => \{/, `${hostIdentity}: the legacy agent/request waterfall is gone`)
  assert.match(agentSource, /const resolved = await next\(\)/, `${hostIdentity}: agent/request no longer resolves the official config`)
  assert.doesNotMatch(agentSource, /["']model\/selection["']/, `${hostIdentity}: a durable selection appeared here, so the legacy-only contract no longer describes this host`)
})

test('conductor keeps stock tools and AgentOptions free of private markers', () => {
  const index = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
  const config = fs.readFileSync(new URL('../lib/config.js', import.meta.url), 'utf8')
  const roles = fs.readFileSync(new URL('../lib/roles.js', import.meta.url), 'utf8')
  const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  for (const source of [index, config, roles, client]) {
    assert.doesNotMatch(source, /__dshSubagentConductor|MARKER_KEY|makeMarker|readMarker|subagent_direct/)
    assert.doesNotMatch(source, /ctx\.subagents\.start\s*=|ctx\.subagents\.startContinuable\s*=/)
  }
  // Role delegation goes through the official managed activation service, and the
  // only tools this package registers are its own two role tools — never a copy or
  // re-registration of the stock delegation tool.
  assert.match(roles, /sctx\.subagents\.startActivation\(/)
  assert.match(roles, /name: 'list_subagent_roles'/)
  assert.match(roles, /name: 'subagent_role'/)
  assert.equal((roles.match(/tools\.register\(/g) || []).length, 1)
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
