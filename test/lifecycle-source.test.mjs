import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const host = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8')

test('bundle patch inserts only the conductor row', () => {
  const effective = patch.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n')
  assert.match(effective, /id: subagent-conductor/)
  assert.doesNotMatch(effective, /disable:|replace:|tool-subagent|agent preset/i)
})

test('host uses one request listener and never wraps subagent methods', () => {
  assert.equal((host.match(/ctx\.on\('agent\/request'/g) || []).length, 1)
  assert.doesNotMatch(host, /subagents\.start\s*=/)
  assert.doesNotMatch(host, /subagents\.startContinuable\s*=/)
})

test('linked runtime imports no DSH or Cordis peer package', () => {
  assert.doesNotMatch(host, /from ['"]@deepseek-ai\/(?:dsh-|cordis)/)
  assert.match(host, /from ['"]@deepseek-ai\/schemastery['"]/)
})

test('host owns tool cleanup and settings watch lifecycle', () => {
  assert.match(host, /settingsScope\.watch\(reconcileTool\)/)
  assert.match(host, /ctx\.effect\(\(\) => \(\) => unmountTool\(\)/)
  assert.match(host, /subagent\/provider-removed/)
})

test('client follows the one-argument ModuleLoader factory contract', () => {
  assert.match(client, /factory: \(require\) => \{\s*const module = \{ exports: \{\} \}/)
  assert.doesNotMatch(client, /factory: \(require, exports, module\)/)
  assert.match(client, /return module\.exports/)
})

test('client registers official slots and removes its style', () => {
  assert.match(client, /conversation\.input\.right/)
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /ctx\.effect\(\(\) => \(\) => style\.remove\(\)/)
  assert.doesNotMatch(client, /214748/)
  assert.doesNotMatch(client, /document\.body\.appendChild/)
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
  assert.match(client, /reasoningEffort: level\.id/)
  assert.match(client, /state\.pane === 'root'/)
  assert.match(client, /className: 'dscGroupTitle'/)
  assert.match(client, /\.dscGroup\{padding:3px;border:1px solid var\(--dsw-alias-border-l2\);border-radius:10px;background:var\(--dsw-alias-bg-layer-3\)\}/)
  assert.match(client, /`\$\{group\.id\} · \$\{model\.model\}/)
  assert.doesNotMatch(client, /`\$\{currentRoute\.provider\}\/\$\{currentRoute\.model\}`/)
})

test('settings card is collapsed by default and combines provider with model selection', () => {
  assert.match(client, /子代理指挥 \/ Subagent Conductor/)
  assert.match(client, /const \[open, setOpen\] = React\.useState\(false\)/)
  assert.match(client, /'aria-expanded': open/)
  assert.match(client, /open && e\('div', \{ className: 'dscCardBody' \}/)
  assert.match(client, /默认提供商与模型/)
  assert.match(client, /groups\.map\(\(group\) => e\('section'/)
  assert.match(client, /chooseModel\(group\.id, model\.model\)/)
  assert.doesNotMatch(client, /默认 LLM 提供商|默认模型'/)
  assert.match(client, /const nativeSelect/)
  assert.match(client, /e\('select', \{ value: form\[key\]/)
  assert.doesNotMatch(client, /e\('datalist'/)
  assert.match(client, /\.dscCard\{font:inherit/)
  assert.match(client, /\.dscField input,\.dscField select,\.dscField textarea\{font:inherit/)
  assert.match(client, /api\.llm\.models\(\{\}\)/)
  assert.match(client, /导入\/导出角色 JSON/)
  assert.match(client, /className: 'dscInlinePanel', role: 'region'/)
  assert.doesNotMatch(client, /aria-modal|dscDialogShade|role: 'dialog'/)
  assert.doesNotMatch(client, /Full template|Background mode|Default provider/)
})

test('settings provides visual role management with advanced JSON fallback', () => {
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
  assert.match(client, /allow 和 deny 都留空时不创建 toolFilter，保留子代理原本可见的全部工具/)
  assert.match(client, /maxDepth/)
  assert.match(client, /enableRunInBackground/)
  assert.match(client, /全部工具.*agent 预设、父级过滤、权限和运行时能力限制/)
  assert.match(client, /rolesField,\s*\),\s*roleDialog,\s*jsonDialog,/)
  assert.match(client, /\.dscRolesHead \.dscPrimary\{background:var\(--dsw-alias-label-primary\);color:var\(--dsw-alias-bg-layer-3\)/)
  assert.doesNotMatch(client, /dscRolesHead \.dscPrimary\{background:var\(--dsw-alias-brand-primary\)/)
})

test('client and README disclose exact routing precedence', () => {
  assert.match(client, /单次 subagent_direct 参数 ＞ 选定角色 ＞ 输入框当前会话选择 ＞ 本页全局默认 ＞ DSH 原生继承/)
  assert.match(readme, /per-call subagent_direct override\s*> selected role\s*> root-session composer selection\s*> global Settings default\s*> native DSH inheritance/)
  assert.match(readme, /Provider, model, and reasoning effort are resolved independently/)
})

test('settings rows stack full-width behind dividers and effort greys out without metadata', () => {
  assert.match(client, /\.dscStack\{display:flex;flex-direction:column\}/)
  assert.match(client, /\.dscStack>\.dscField\+\.dscField\{border-top:1px solid var\(--dsw-alias-border-l2\)\}/)
  assert.doesNotMatch(client, /\.dscGrid\{display:grid;grid-template-columns:1fr 1fr/)
  assert.doesNotMatch(client, /dscWide/)
  assert.match(client, /effortAvailable = !!/)
  assert.match(client, /effortAvailable && form\.effort\.trim\(\)/)
  assert.match(client, /当前模型未公开思考强度元数据，无法选择。/)
  assert.match(client, /undefined, !effortAvailable\)/)
  assert.match(client, /\.dscField select:disabled\{opacity:\.55;cursor:not-allowed/)
})

test('card and model trigger chevrons replicate the official outline icon', () => {
  assert.match(client, /viewBox: '0 0 14 14'/)
  assert.match(client, /M11\.8486 5\.5L11\.4238 5\.92383/)
  assert.match(client, /className: 'dscCardChevron', 'aria-hidden': true \}\)/)
  assert.match(client, /\.dscCardOpen \.dscCardChevron\{transform:rotate\(180deg\)\}/)
  assert.match(client, /dscModelChevron\$\{modelOpen \? ' dscModelChevronOpen' : ''\}/)
  assert.match(client, /\.dscModelChevronOpen\{transform:rotate\(180deg\)\}/)
  assert.doesNotMatch(client, /⌄|⌃/)
})

test('composer trigger and popup rows use the official chevron icons and animations', () => {
  assert.match(client, /\.dscTriggerChevron\{color:var\(--dsw-alias-label-caption\);flex:none;transition:transform \.12s\}/)
  assert.match(client, /\.dscTriggerChevronOpen\{transform:rotate\(180deg\)\}/)
  assert.match(client, /dscTriggerChevron\$\{state\.open \? ' dscTriggerChevronOpen' : ''\}/)
  assert.match(client, /ChevronRight14 = \(props\) =>/)
  assert.match(client, /M5\.5 2\.15137L5\.92383 2\.57617/)
  assert.match(client, /e\(ChevronRight14, \{ className: 'dscCellChevron', 'aria-hidden': true \}\)/)
  assert.match(client, /\.dscCellChevron\{color:var\(--dsw-alias-label-tertiary\);flex:none\}/)
  assert.doesNotMatch(client, /dscArrow/)
  assert.doesNotMatch(client, /'›'/)
})

test('client document listeners have paired cleanup', () => {
  assert.match(client, /addEventListener\('mousedown', outside\)/)
  assert.match(client, /removeEventListener\('mousedown', outside\)/)
  assert.match(client, /addEventListener\('keydown', key\)/)
  assert.match(client, /removeEventListener\('keydown', key\)/)
})
