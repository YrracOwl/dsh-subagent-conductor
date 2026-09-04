import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const host = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const config = fs.readFileSync(new URL('../lib/config.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8')

test('bundle patch inserts only the conductor row', () => {
  const effective = patch.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n')
  assert.match(effective, /id: subagent-conductor/)
  assert.doesNotMatch(effective, /disable:|replace:|tool-subagent|agent preset/i)
})

test('host uses one request listener, no delegation tool, no marker', () => {
  assert.equal((host.match(/ctx\.on\('agent\/request'/g) || []).length, 1)
  assert.doesNotMatch(host, /tools\.register/)
  assert.doesNotMatch(host, /subagents\.start\s*=/)
  assert.doesNotMatch(host, /subagents\.startContinuable\s*=/)
  assert.doesNotMatch(host, /subagent\/provider-added|subagent\/provider-removed/)
  assert.doesNotMatch(host, /__dshSubagentConductor|MARKER_KEY/)
  assert.match(host, /settings\.register\(SETTINGS_NAMESPACE/)
  assert.match(host, /ctx\.llm\.resolveModelInfo/)
})

test('linked runtime imports no DSH or Cordis peer package', () => {
  assert.doesNotMatch(host + config, /from ['"]@deepseek-ai\/(?:dsh-|cordis)/)
  assert.match(host, /from ['"]@deepseek-ai\/schemastery['"]/)
})

test('config exposes only v2 helpers', () => {
  assert.doesNotMatch(config, /MARKER_KEY|TOOL_NAME|makeMarker|readMarker|isFreshSubagent|applyDefaultRole/)
  assert.match(config, /export function decideRequestRoute/)
  assert.match(config, /export function resolveRoute/)
  assert.match(config, /export function isSubagent/)
  assert.match(config, /export function normalizeReasoningEffort/)
})

test('client follows the one-argument ModuleLoader factory contract', () => {
  assert.match(client, /factory: \(require\) => \{\s*const module = \{ exports: \{\} \}/)
  assert.doesNotMatch(client, /factory: \(require, exports, module\)/)
  assert.match(client, /return module\.exports/)
})

test('client registers official slots and removes its style', () => {
  assert.match(client, /conversation\.input\.right/)
  assert.match(client, /\(props\) => e\(Selector, \{ \.\.\.props, api, scope \}\)/)
  assert.doesNotMatch(client, /inject: \(sessionId\) => \(\{ sessionId, api, scope \}\)/)
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /ctx\.effect\(\(\) => \(\) => style\.remove\(\)/)
  assert.doesNotMatch(client, /214748/)
  assert.doesNotMatch(client, /document\.body\.appendChild/)
})

test('client declares dotted remote services and no legacy connection', () => {
  assert.match(client, /exports\.inject = \['slots', 'settingsScope', 'remote', 'remote\.session', 'remote\.settings'\]/)
  assert.doesNotMatch(client, /'connection'/)
  assert.doesNotMatch(client, /ctx\.get\('connection'\)/)
  assert.match(client, /remote\.session\.modelCatalog\(\)/)
  assert.match(client, /remote\.settings\.mutate\(payload\.ns, payload\.ops, payload\.expectedRevision\)/)
})

test('selector matches main model typography and exposes effort selection', () => {
  assert.match(client, /font-size:13px;font-weight:500;line-height:20px/)
  assert.match(client, /`sub丨\$\{modelLabel\}`/)
  assert.match(client, /className: 'dscEffort'/)
  assert.match(client, /reasoning\.efforts/)
  assert.match(client, /useSessions\(\(s\) => s\.byId\)/)
  assert.match(client, /function resolveRootSessionId\(sessionId, byId\)/)
  assert.match(client, /path: \['sessionSelections', rootId\]/)
  assert.match(client, /SOURCE_LABELS/)
  assert.match(client, /session: '根会话选择'/)
  assert.match(client, /state\.pane === 'root'/)
})

test('settings card is collapsed by default and combines provider with model selection', () => {
  assert.match(client, /子代理指挥 \/ Subagent Conductor/)
  assert.match(client, /const \[open, setOpen\] = React\.useState\(false\)/)
  assert.match(client, /'aria-expanded': open/)
  assert.match(client, /open && e\('div', \{ className: 'dscCardBody' \}/)
  assert.match(client, /默认提供商与模型/)
  assert.match(client, /groups\.map\(\(group\) => e\('section'/)
  assert.match(client, /chooseModel\(group\.id, model\.model\)/)
  assert.match(client, /const nativeSelect/)
  assert.match(client, /e\('select', \{ value: form\[key\]/)
  assert.match(client, /api\.llm\.models\(\{\}\)/)
})

test('settings provides visual role management with JSON fallback', () => {
  assert.match(client, /\+ 新建角色/)
  assert.match(client, /const openRoleEditor/)
  assert.match(client, /const saveRoleEditor/)
  assert.match(client, /const removeRole/)
  assert.match(client, /'复制'/)
  assert.match(client, /角色 ID 必须是小写 kebab-case/)
  assert.match(client, /提供商与模型成对选择/)
  assert.match(client, /disabled: !roleEffortAvailable/)
  assert.match(client, /选定模型未公开 reasoning\.efforts/)
  assert.match(client, /path: \['roles'\], value: form\.roles/)
  assert.match(client, /path: \['defaultRole'\]/)
  assert.match(client, /JSON\.parse\(jsonText \|\| '\{\}'\)/)
  assert.match(client, /normalizeImportedRoles\(raw\)/)
  assert.match(client, /顶层必须是角色对象/)
  assert.match(client, /provider 与 model 必须成对出现/)
})

test('client and README disclose exact routing precedence without v1 claims', () => {
  assert.match(client, /输入框根会话选择 ＞ 默认角色路由 ＞ 本页全局默认 ＞ 官方工具显式选择 ＞ DSH 原生继承/)
  assert.match(readme, /root-session composer selection[\s\S]*default role route[\s\S]*global Settings default[\s\S]*official tool selection[\s\S]*native DSH inheritance/i)
  assert.doesNotMatch(client, /subagent_direct/)
  assert.doesNotMatch(client + readme, /per-call subagent_direct override/)
})

test('advanced v1 controls are gone from the client', () => {
  for (const token of ['maxDepth', 'enableRunInBackground', 'backgroundMode', 'providerTransport', 'persona', 'toolFilter', 'advancedField']) {
    assert.doesNotMatch(client, new RegExp(token))
  }
})

test('settings rows stack full-width behind dividers and effort greys out without metadata', () => {
  assert.match(client, /\.dscStack\{display:flex;flex-direction:column\}/)
  assert.match(client, /effortAvailable && form\.effort\.trim\(\)/)
  assert.match(client, /当前模型未公开思考强度元数据，无法选择。/)
  assert.match(client, /\.dscField select:disabled\{opacity:\.55;cursor:not-allowed/)
})

test('client document listeners have paired cleanup', () => {
  assert.match(client, /addEventListener\('mousedown', outside\)/)
  assert.match(client, /removeEventListener\('mousedown', outside\)/)
  assert.match(client, /addEventListener\('keydown', key\)/)
  assert.match(client, /removeEventListener\('keydown', key\)/)
})
