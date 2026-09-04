import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRootSessionId, isSubagent } from '../lib/config.js'

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
