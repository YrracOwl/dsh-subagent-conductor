import test from 'node:test'
import assert from 'node:assert/strict'
import plugin, { readVolatile } from '../lib/index.js'
import {
  DEFAULT_SETTINGS,
  applyResolvedRoute,
  decideRequestRoute,
  normalizeReasoningEffort,
  normalizeSettings,
  resolveRoute,
  validateSettings,
} from '../lib/config.js'

// Both lines must pass: ≤ 0.1.5 resolves schemastery 3.18.1/3.18.2 (no volatile,
// plain parsed values) and ≥ 0.1.7 resolves 3.18.4 (volatile nodes parse to
// cosmokit wrappers). Every assertion below therefore unwraps with the plugin's
// own reader instead of assuming either shape.
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')
const unwrap = (value) => readVolatile(value)
/** JSON-shaped projection: unwrap wrappers and drop absent fields. */
function plain(value) {
  const unwrapped = readVolatile(value)
  if (Array.isArray(unwrapped)) return unwrapped.map(plain)
  if (unwrapped !== null && typeof unwrapped === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(unwrapped)) {
      const entry = plain(child)
      if (entry !== undefined) out[key] = entry
    }
    return out
  }
  return unwrapped
}
const supportsVolatile = (schema) => typeof schema?.dict?.roles?.volatile === 'function'

test('resolves session over default role over global default per field', () => {
  const result = resolveRoute({
    session: { provider: 'session-provider', model: 'session-model', reasoningEffort: 'low' },
    settings: {
      defaultRoute: { provider: 'default-provider', model: 'default-model', reasoningEffort: 'off' },
      defaultRole: 'reviewer',
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', model: 'role-model', reasoningEffort: 'high' } },
    },
  })
  assert.equal(result.provider, 'session-provider')
  assert.equal(result.model, 'session-model')
  assert.equal(result.reasoningEffort, 'low')
  assert.deepEqual(result.provenance, { provider: 'session', model: 'session', reasoningEffort: 'session' })
  assert.equal(result.roleId, 'reviewer')
})

test('fields resolve independently across conductor layers', () => {
  const result = resolveRoute({
    session: { provider: 'session-provider' },
    settings: {
      defaultRoute: { model: 'default-model', reasoningEffort: 'off' },
      defaultRole: 'reviewer',
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', reasoningEffort: 'high' } },
    },
  })
  assert.equal(result.provider, 'session-provider')
  assert.equal(result.model, 'default-model')
  assert.equal(result.reasoningEffort, 'high')
  assert.deepEqual(result.provenance, { provider: 'session', model: 'default', reasoningEffort: 'role' })
})

test('default role routes a subagent when no session selection exists', () => {
  const result = resolveRoute({
    session: undefined,
    settings: {
      defaultRole: 'reviewer',
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', model: 'role-model' } },
    },
  })
  assert.equal(result.provider, 'role-provider')
  assert.equal(result.model, 'role-model')
  assert.equal(result.roleId, 'reviewer')
  assert.deepEqual(result.provenance, { provider: 'role', model: 'role', reasoningEffort: 'inherit' })
})

test('global default applies when neither session nor role defines a route', () => {
  const result = resolveRoute({
    session: undefined,
    settings: { defaultRoute: { provider: 'default-provider', model: 'default-model', reasoningEffort: 'off' } },
  })
  assert.equal(result.provider, 'default-provider')
  assert.equal(result.model, 'default-model')
  assert.equal(result.reasoningEffort, 'off')
})

test('empty conductor layers leave provenance inherit and decideRequestRoute silent', () => {
  const conductor = resolveRoute({ session: undefined, settings: {} })
  assert.equal(conductor.provider, undefined)
  assert.equal(conductor.model, undefined)
  assert.equal(conductor.reasoningEffort, undefined)
  assert.deepEqual(conductor.provenance, { provider: 'inherit', model: 'inherit', reasoningEffort: 'inherit' })
  assert.equal(decideRequestRoute({ provider: 'a', model: 'x' }, conductor, { provider: 'a', model: 'x' }), undefined)
})

test('conductor route wins over the official creation-time route', () => {
  const conductor = resolveRoute({ session: { provider: 'p', model: 'm' }, settings: {} })
  const intent = decideRequestRoute({ provider: 'a', model: 'x', reasoningEffort: 'high' }, conductor, { provider: 'a', model: 'x', reasoningEffort: 'high' })
  assert.deepEqual(intent, { provider: 'p', model: 'm' })
})

test('conductor effort alone keeps the official route', () => {
  const conductor = resolveRoute({ settings: { defaultRoute: { reasoningEffort: 'low' } } })
  const intent = decideRequestRoute({ provider: 'a', model: 'x', reasoningEffort: 'high' }, conductor, { provider: 'a', model: 'x' })
  assert.deepEqual(intent, { provider: 'a', model: 'x', conductorEffort: 'low' })
})

test('official route falls back to base when options omit provider/model', () => {
  const conductor = resolveRoute({ settings: { defaultRoute: { reasoningEffort: 'low' } } })
  const intent = decideRequestRoute({ provider: 'a', model: 'x' }, conductor, {})
  assert.deepEqual(intent, { provider: 'a', model: 'x', conductorEffort: 'low' })
})

test('missing effective provider or model yields no intent', () => {
  const conductor = resolveRoute({ settings: { defaultRoute: { reasoningEffort: 'low' } } })
  assert.equal(decideRequestRoute({}, conductor, {}), undefined)
})

test('normalization drops v1-only keys and invalid session selections', () => {
  const value = normalizeSettings({
    subagentProvider: 'spawn', maxDepth: 3, enableRunInBackground: false, backgroundMode: 'continuable',
    defaultRoute: { provider: 'p', model: 'm' },
    roles: { ok: { displayName: 'Ok', description: 'Fine', persona: 'ignored', toolFilter: { allow: ['read'] } } },
    sessionSelections: { ok: { provider: 'p', model: 'm' }, bad: { provider: 'p' } },
  })
  assert.equal('subagentProvider' in value, false)
  assert.equal('maxDepth' in value, false)
  assert.equal('enableRunInBackground' in value, false)
  assert.equal('backgroundMode' in value, false)
  assert.deepEqual(value.defaultRoute, { provider: 'p', model: 'm' })
  assert.deepEqual(value.roles.ok, { displayName: 'Ok', description: 'Fine' })
  assert.deepEqual(value.sessionSelections, { ok: { provider: 'p', model: 'm' } })
  assert.ok(!('fallbackOnInvalid' in DEFAULT_SETTINGS))
})

test('validateSettings rejects a defaultRole that does not exist', () => {
  assert.throws(
    () => validateSettings({ defaultRole: 'missing', roles: {} }),
    /defaultRole "missing" does not exist/,
  )
})

test('provider/model switch atomically clears inherited effort', () => {
  assert.deepEqual(applyResolvedRoute({ provider: 'a', model: 'x', reasoningEffort: 'high', maxTokens: 10 }, { provider: 'b', model: 'y' }), { provider: 'b', model: 'y', maxTokens: 10 })
})

test('same-route effort replacement keeps provider and model', () => {
  assert.deepEqual(applyResolvedRoute({ provider: 'a', model: 'x', reasoningEffort: 'high' }, { provider: 'a', model: 'x' }, 'low'), { provider: 'a', model: 'x', reasoningEffort: 'low' })
})

test('effort is accepted only from exact model metadata', () => {
  const info = { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }
  assert.equal(normalizeReasoningEffort(info, 'high'), 'high')
  assert.equal(normalizeReasoningEffort(info, 'max'), undefined)
  assert.equal(normalizeReasoningEffort({}, 'high'), undefined)
})

test('default export carries a Config schema with the legacy shape and defaults', () => {
  // The loader unwraps the default export before applying the plugin, and the
  // ≥ 0.1.7 settings service reads `Config` from this entry. Importing the module
  // must not throw on the ≤ 0.1.5 schemastery, where `.volatile()` is absent.
  assert.equal(plugin.name, 'dsh-subagent-conductor')
  assert.deepEqual(plugin.inject, ['llm'])
  assert.equal(typeof plugin.apply, 'function')
  assert.equal(typeof plugin.Config?.['~standard']?.validate, 'function')
  const result = plugin.Config['~standard'].validate(undefined)
  assert.equal(result.issues, undefined)
  // Same fields and defaults the ≤ 0.1.5 registration schema declares, so the
  // client's reads and path writes keep working on both hosts. Parsed values are
  // read through the plugin's own reader: on 3.18.4 the two records and the
  // defaultRoute leaves arrive as cosmokit wrappers.
  for (const key of Object.keys(result.value)) {
    assert.ok(['defaultRoute', 'defaultRole', 'roles', 'sessionSelections'].includes(key), `unexpected Config field ${key}`)
  }
  assert.deepEqual(plain(result.value.defaultRoute), {})
  assert.deepEqual(plain(result.value.roles), {})
  assert.deepEqual(plain(result.value.sessionSelections), {})
  assert.equal(unwrap(result.value.defaultRole), undefined)
  assert.deepEqual(Object.keys(plugin.Config.dict.defaultRoute.dict), ['provider', 'model', 'reasoningEffort'])
  assert.deepEqual(Object.keys(plugin.Config.dict.roles.inner.dict), ['displayName', 'description', 'provider', 'model', 'reasoningEffort'])
})

test('a volatile field parses to a cosmokit wrapper this plugin unwraps', () => {
  const schema = plugin.Config
  // Volatility only exists on the 0.1.7 schemastery line; on 0.1.5 the helper is
  // the identity, so this guard reports rather than asserts.
  if (!supportsVolatile(schema)) return
  const parsed = schema['~standard'].validate({})
  const roles = parsed.value.roles
  // get() plus the registered write symbol — and no `.set`: the reader must key
  // on the symbol, or routing would silently receive a wrapper instead of the
  // record.
  assert.equal(typeof roles?.get, 'function')
  assert.equal(VOLATILE_WRITE in roles, true)
  assert.deepEqual(readVolatile(roles), {})
  assert.deepEqual(readVolatile(parsed.value.sessionSelections), {})
  // A non-volatile node stays an ordinary value.
  assert.deepEqual(plain(parsed.value.defaultRoute), {})
})

test('Config marks the editable nodes volatile and nests none', () => {
  const schema = plugin.Config
  if (!supportsVolatile(schema)) return
  // `meta.volatile` is the mark the settings service reads (volatileForm /
  // isVolatilePath). Walk the live schema tree, not toJSON(): the serialized form
  // is a ref graph, while the instance nodes carry `.dict` / `.inner` directly.
  const node = (path) => path.reduce((current, key) => current?.dict?.[key], schema)
  const marked = (path) => node(path)?.meta?.volatile === true
  assert.equal(marked(['defaultRole']), true)
  assert.equal(marked(['roles']), true)
  assert.equal(marked(['sessionSelections']), true)
  assert.equal(marked(['defaultRoute']), false)
  for (const leaf of ['provider', 'model', 'reasoningEffort']) assert.equal(marked(['defaultRoute', leaf]), true)
  // Children of the volatile records stay plain: a volatile field inside a
  // record, or enclosed by another volatile field, is rejected at resolve time.
  for (const key of ['roles', 'sessionSelections']) {
    const children = Object.values(node([key])?.inner?.dict ?? {})
    assert.ok(children.length > 0, `${key} children not found in the schema`)
    for (const child of children) assert.ok(!child?.meta?.volatile)
  }
})
