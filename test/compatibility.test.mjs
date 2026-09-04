import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARKER_KEY, findRootSessionId, isSubagent, makeMarker, readMarker } from '../lib/config.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const dsh = path.resolve(process.env.DSH_CHECKOUT || 'C:/Users/CarryWho/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh')
const childAgent = path.join(dsh, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/child-agent.js')
const continuation = path.join(dsh, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/continuation.js')
const descriptor = path.join(dsh, 'node_modules/@deepseek-ai/dsh-subagent/lib/types/descriptor.js')

test('stock child option resolver spreads requested marker before depth', () => {
  const source = fs.readFileSync(childAgent, 'utf8')
  assert.match(source, /\.\.\.requested,[\s\S]*subagentDepth:\s*childDepth/)
})

test('cold resume reconstructs only descriptor provider and model', () => {
  const source = fs.readFileSync(continuation, 'utf8')
  assert.match(source, /agentOptions:\s*\{[\s\S]*descriptor\.agentProvider[\s\S]*descriptor\.agentModel[\s\S]*\}/)
  assert.match(source, /composition:\s*\{\s*persona:\s*descriptor\.persona,\s*toolFilter:\s*descriptor\.toolFilter\s*\}/)
  assert.doesNotMatch(source.slice(source.indexOf('async coldResume'), source.indexOf('async submitMaterialized')), new RegExp(MARKER_KEY))
})

test('continuable descriptor rejects unknown keys', () => {
  const source = fs.readFileSync(descriptor, 'utf8')
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
