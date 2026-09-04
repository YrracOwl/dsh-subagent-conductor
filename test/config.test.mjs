import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS,
  applyResolvedRoute,
  decideRequestRoute,
  normalizeReasoningEffort,
  normalizeSettings,
  resolveRoute,
  validateSettings,
} from '../lib/config.js'

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
