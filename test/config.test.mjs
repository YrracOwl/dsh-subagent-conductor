import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS,
  applyResolvedRoute,
  isFreshSubagent,
  normalizeReasoningEffort,
  normalizeSettings,
  resolveRoute,
} from '../lib/config.js'

test('resolves call over role over session over default per field', () => {
  const result = resolveRoute({
    marker: { role: 'reviewer', call: { model: 'call-model' } },
    session: { provider: 'session-provider', model: 'session-model', reasoningEffort: 'low' },
    settings: {
      defaultRoute: { provider: 'default-provider', model: 'default-model', reasoningEffort: 'off' },
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', reasoningEffort: 'high' } },
    },
    applyDefaultRole: true,
  })
  assert.equal(result.provider, 'role-provider')
  assert.equal(result.model, 'call-model')
  assert.equal(result.reasoningEffort, 'high')
  assert.deepEqual(result.provenance, { provider: 'role', model: 'call', reasoningEffort: 'role' })
})

test('defaultRole routes a fresh stock child with no marker', () => {
  const result = resolveRoute({
    marker: undefined,
    session: undefined,
    settings: {
      defaultRole: 'reviewer',
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', model: 'role-model' } },
    },
    applyDefaultRole: true,
  })
  assert.equal(result.provider, 'role-provider')
  assert.equal(result.model, 'role-model')
  assert.equal(result.roleId, 'reviewer')
  assert.equal(result.provenance.provider, 'role')
})

test('explicit role marker wins over defaultRole', () => {
  const result = resolveRoute({
    marker: { role: 'writer' },
    session: undefined,
    settings: {
      defaultRole: 'reviewer',
      roles: {
        reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'reviewer-provider', model: 'reviewer-model' },
        writer: { displayName: 'Writer', description: 'Write', provider: 'writer-provider', model: 'writer-model' },
      },
    },
    applyDefaultRole: true,
  })
  assert.equal(result.provider, 'writer-provider')
  assert.equal(result.model, 'writer-model')
  assert.equal(result.roleId, 'writer')
})

test('explicit role marker is honored even when defaultRole policy is off', () => {
  const result = resolveRoute({
    marker: { role: 'reviewer' },
    session: { provider: 'session-provider' },
    settings: {
      defaultRoute: { provider: 'default-provider', model: 'default-model' },
      roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', model: 'role-model' } },
    },
    applyDefaultRole: false,
  })
  assert.equal(result.provider, 'role-provider')
  assert.equal(result.model, 'role-model')
  assert.equal(result.roleId, 'reviewer')
})

test('cold resume suppresses defaultRole and falls back to session then default', () => {
  const settings = {
    defaultRole: 'reviewer',
    defaultRoute: { provider: 'default-provider', model: 'default-model' },
    roles: { reviewer: { displayName: 'Reviewer', description: 'Review', provider: 'role-provider', model: 'role-model' } },
  }
  const withSession = resolveRoute({
    marker: undefined,
    session: { provider: 'session-provider', model: 'session-model' },
    settings,
    applyDefaultRole: false,
  })
  assert.equal(withSession.provider, 'session-provider')
  assert.equal(withSession.model, 'session-model')
  assert.equal(withSession.roleId, undefined)
  assert.deepEqual(withSession.provenance, { provider: 'session', model: 'session', reasoningEffort: 'inherit' })
  const withoutSession = resolveRoute({ marker: undefined, session: undefined, settings, applyDefaultRole: false })
  assert.equal(withoutSession.provider, 'default-provider')
  assert.equal(withoutSession.model, 'default-model')
  assert.equal(withoutSession.roleId, undefined)
  assert.deepEqual(withoutSession.provenance, { provider: 'default', model: 'default', reasoningEffort: 'inherit' })
})

test('fresh and cold-resume children are identified explicitly for the defaultRole policy', () => {
  assert.equal(isFreshSubagent({ options: { subagentDepth: 1 }, session: { header: { origin: 'subagent' } } }), true)
  assert.equal(isFreshSubagent({ options: { subagentDepth: 2 }, session: { header: { origin: 'subagent' } } }), true)
  assert.equal(isFreshSubagent({ options: {}, session: { header: { origin: 'subagent' } } }), false)
  assert.equal(isFreshSubagent({ options: { provider: 'p', model: 'm' }, session: { header: { origin: 'subagent' } } }), false)
  assert.equal(isFreshSubagent({ options: { subagentDepth: 0 }, session: { header: { origin: 'subagent' } } }), false)
})

test('resolveRoute requires the explicit applyDefaultRole policy', () => {
  assert.throws(
    () => resolveRoute({ marker: undefined, session: undefined, settings: {} }),
    /explicit applyDefaultRole/,
  )
})

test('fallbackOnInvalid is fully removed as a dead setting', () => {
  assert.ok(!('fallbackOnInvalid' in DEFAULT_SETTINGS))
  const normalized = normalizeSettings({ fallbackOnInvalid: false, defaultRoute: { provider: 'p', model: 'm' } })
  assert.ok(!('fallbackOnInvalid' in normalized))
  assert.deepEqual(normalized.defaultRoute, { provider: 'p', model: 'm' })
})

test('normalization drops invalid session selections', () => {
  const value = normalizeSettings({ sessionSelections: { ok: { provider: 'p', model: 'm' }, bad: { provider: 'p' } } })
  assert.deepEqual(value.sessionSelections, { ok: { provider: 'p', model: 'm' } })
})

test('provider/model switch atomically clears inherited effort', () => {
  assert.deepEqual(applyResolvedRoute({ provider: 'a', model: 'x', reasoningEffort: 'high', maxTokens: 10 }, { provider: 'b', model: 'y' }), { provider: 'b', model: 'y', maxTokens: 10 })
})

test('effort is accepted only from exact model metadata', () => {
  const info = { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }
  assert.equal(normalizeReasoningEffort(info, 'high'), 'high')
  assert.equal(normalizeReasoningEffort(info, 'max'), undefined)
  assert.equal(normalizeReasoningEffort({}, 'high'), undefined)
})