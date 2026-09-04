import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARKER_KEY, findRootSessionId, isSubagent, makeMarker, readMarker } from '../lib/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// These three tests inspect the locally installed DSH implementation. A public
// package CI runner has no DSH checkout, so require an explicit opt-in path and
// skip only those white-box checks when it is unavailable. Never guess a host
// path: on POSIX, a Windows path would become a bogus relative path.
const dshRoot = typeof process.env.DSH_CHECKOUT === 'string' && process.env.DSH_CHECKOUT.length > 0
  ? path.resolve(process.env.DSH_CHECKOUT)
  : undefined
const childAgent = dshRoot && path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/child-agent.js')
const continuation = dshRoot && path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/continuation.js')
const descriptor = dshRoot && path.join(dshRoot, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/descriptor.js')
const readDshFile = (file) => file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined

test('stock child option resolver spreads requested marker before depth', { skip: !childAgent || !fs.existsSync(childAgent) }, () => {
  const source = readDshFile(childAgent)
  assert.match(source, /\.\.\.requested,[\s\S]*subagentDepth:\s*childDepth/)
})

test('cold resume reconstructs only descriptor provider and model', { skip: !continuation || !fs.existsSync(continuation) }, () => {
  const source = readDshFile(continuation)
  assert.match(source, /agentOptions:\s*\{[\s\S]*descriptor\.agentProvider[\s\S]*descriptor\.agentModel[\s\S]*\}/)
  assert.match(source, /composition:\s*\{\s*persona:\s*descriptor\.persona,\s*toolFilter:\s*descriptor\.toolFilter\s*\}/)
  assert.doesNotMatch(source.slice(source.indexOf('async coldResume'), source.indexOf('async submitMaterialized')), new RegExp(MARKER_KEY))
})

test('continuable descriptor rejects unknown keys', { skip: !descriptor || !fs.existsSync(descriptor) }, () => {
  const source = readDshFile(descriptor)
  assert.match(source, /CONTINUABLE_DESCRIPTOR_KEYS/)
  assert.match(source, /assertKnownKeys\(value, mode === ['"]one-shot['"] \? ONE_SHOT_DESCRIPTOR_KEYS : CONTINUABLE_DESCRIPTOR_KEYS/)
})

test('private marker is readable for a fresh resident child', () => {
  const marker = makeMarker({ role: 'reviewer', provider: 'p', model: 'm', reasoningEffort: 'high' })
  const agent = { options: { subagentDepth: 1, [MARKER_KEY]: marker }, session: { header: { origin: 'subagent' } } }
  assert.deepEqual(readMarker(agent), marker)
  assert.equal(isSubagent(agent), true)
})

test('cold-resumed child is detected by origin without depth or marker', () => {
  const agent = { options: { provider: 'p', model: 'm' }, session: { header: { origin: 'subagent' } } }
  assert.equal(readMarker(agent), undefined)
  assert.equal(isSubagent(agent), true)
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
