// Guards for the v0.1 → v0.2 settings hand-off on DSH ≥ 0.1.7.
//
// The host's one-shot import refuses a whole `settings.yaml` section when any key in it
// is neither declared nor volatile, and only logs a warning — so a v0.1 section silently
// costs the user their defaultRoute and every sessionSelections entry. These tests pin the
// diagnostic that reports it, and pin that it stays quiet in every case where there is
// nothing to report. Hermetic: the document lives in a temp directory, never in $DSH_HOME.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reportUnimportableLegacyDocument } from '../lib/index.js'

/** A fake context exposing only what the diagnostic touches. */
function fakeCtx(home) {
  const warnings = []
  return {
    warnings,
    ctx: {
      get: (name) => (name === 'profileContext' && home !== undefined ? { home } : undefined),
      logger: { warn: (...args) => warnings.push(args.join(' ')) },
    },
  }
}

/** A temp home; `document === undefined` leaves the imported file absent. */
function homeWith(document) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-legacy-'))
  if (document !== undefined) fs.writeFileSync(path.join(dir, 'settings.yaml.imported'), document, 'utf8')
  return dir
}

const V01_SECTION = [
  'subagent-conductor:',
  '  defaultRoute:',
  '    provider: commandcode',
  '    model: deepseek/deepseek-v4.1-flash',
  '    reasoningEffort: high',
  '  subagentProvider: spawn',
  '  backgroundMode: continuable',
  '',
].join('\n')

test('reports a v0.1 section the one-shot import had to refuse', () => {
  const { ctx, warnings } = fakeCtx(homeWith(V01_SECTION))
  reportUnimportableLegacyDocument(ctx, { defaultRoute: {}, sessionSelections: {} })
  assert.equal(warnings.length, 1, `expected exactly one warning; saw ${JSON.stringify(warnings)}`)
  assert.match(warnings[0], /settings\.yaml\.imported/)
  assert.match(warnings[0], /subagentProvider/)
  assert.match(warnings[0], /sessionSelections/)
})

test('stays silent when the values arrived, when the keys are gone, and when nothing is knowable', () => {
  // The user already re-applied the values: nothing to report.
  const arrived = fakeCtx(homeWith(V01_SECTION))
  reportUnimportableLegacyDocument(arrived.ctx, { defaultRoute: { provider: 'p', model: 'm' }, sessionSelections: {} })
  assert.deepEqual(arrived.warnings, [])

  // A section without the dropped keys imports cleanly, so the document proves nothing.
  const cleaned = fakeCtx(homeWith('subagent-conductor:\n  defaultRoute:\n    provider: p\n'))
  reportUnimportableLegacyDocument(cleaned.ctx, { defaultRoute: {}, sessionSelections: {} })
  assert.deepEqual(cleaned.warnings, [])

  // No renamed document (a fresh profile, or a host that never had one).
  const missing = fakeCtx(homeWith(undefined))
  reportUnimportableLegacyDocument(missing.ctx, { defaultRoute: {}, sessionSelections: {} })
  assert.deepEqual(missing.warnings, [])

  // No profileContext: never guess a machine path.
  const unknownHome = fakeCtx(undefined)
  reportUnimportableLegacyDocument(unknownHome.ctx, { defaultRoute: {}, sessionSelections: {} })
  assert.deepEqual(unknownHome.warnings, [])
})
