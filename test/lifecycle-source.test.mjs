import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Normalized at the read boundary: two of the code-shape guards below spell `\n`
// literally, so a CRLF checkout (windows-latest) would stop matching them while an
// LF tree stays green.
const host = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const config = fs.readFileSync(new URL('../lib/config.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
// Code-shape guards (as opposed to prose guards) must not be satisfiable — or
// breakable — by a comment: the file documents the rc.2 contract at length.
const clientCode = client.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n')

// The client half is an official __ModuleLoader__ bundle: it is not importable in
// Node, so the two runtime guards below evaluate it in a sandbox and read the
// plugin object the factory returns. Only the OBJECT shape is evaluated — apply()
// is never called and document/window side effects never run, so the stub can stay
// this small (factory scope only requires `react`).
function loadClientPlugin() {
  let captured
  const React = {
    createElement: (...args) => ({ args }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useReducer: (state) => [state, () => {}],
    useEffect: () => {},
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: 'Fragment',
  }
  const sandbox = {
    window: { __ModuleLoader__: { load(spec) { captured = spec } } },
    // Deliberately minimal: `apply` (the only consumer of these globals) is not run.
    document: { createElement: () => ({ style: {}, dataset: {} }), head: { appendChild() {} }, querySelectorAll: () => [] },
    console,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(client, sandbox, { filename: 'lib/client.js' })
  assert.ok(captured, 'lib/client.js must call window.__ModuleLoader__.load')
  return captured.factory((id) => {
    if (id === 'react') return React
    throw new Error(`unexpected require(${id}) at factory scope`)
  })
}

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

test('host declares one capability-detected Config for both settings hosts', () => {
  // ≤ 0.1.5 resolves schemastery 3.18.1/3.18.2, where `.volatile()` does not
  // exist and calling it throws: the mark may only be applied through the
  // capability-detected helper, never directly on a schema expression.
  assert.match(host, /const volatile = \(schema\) => \(typeof schema\?\.volatile === 'function' \? schema\.volatile\(\) : schema\)/)
  // Exactly one CODE-level `.volatile()` call: the capability-detected helper.
  // Comments may name it; a schema expression may not call it directly.
  const hostCode = host.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n')
  assert.equal((hostCode.match(/\.volatile\(\)/g) || []).length, 1)
  // A volatile field's parsed value is a cosmokit wrapper carrying get() plus the
  // registered write symbol — and no `.set` — so the reader keys on the symbol.
  assert.match(host, /Symbol\.for\('cosmokit\.volatile\.write'\)/)
  assert.match(host, /if \(!\(VOLATILE_WRITE in value\)\) return value/)
  assert.doesNotMatch(host, /typeof value\.set === 'function'/)
  assert.doesNotMatch(host, /from ['"]@deepseek-ai\/cosmokit['"]/)
  // defaultRoute is a fixed path: its leaves are volatile. roles and
  // sessionSelections are keyed at runtime: the dict NODE is volatile and the
  // child schemas must stay plain (a volatile field inside a dict or inside
  // another volatile field is rejected at resolve time).
  assert.match(host, /defaultRoute: Schema\.object\(\{\n\s+provider: volatile\(Schema\.string\(\)\),\n\s+model: volatile\(Schema\.string\(\)\),\n\s+reasoningEffort: volatile\(Schema\.string\(\)\),\n\s+\}\)\.default\(\{\}\)/)
  assert.match(host, /defaultRole: volatile\(Schema\.string\(\)\)/)
  assert.match(host, /roles: volatile\(Schema\.dict\(RoleSchema\)\.default\(\{\}\)\)/)
  assert.match(host, /sessionSelections: volatile\(Schema\.dict\(RouteSchema\)\.default\(\{\}\)\)/)
  assert.doesNotMatch(host, /Schema\.string\(\)\.volatile/)
  assert.doesNotMatch(host, /RoleSchema\.default\(\{\}\)\.volatile/)
  assert.doesNotMatch(host, /volatile\(Schema\.dict\(volatile/)
  // The loader unwraps the default export before applying the plugin, so the
  // default object carries name/inject/apply AND the entry Config the ≥ 0.1.7
  // settings service reads.
  assert.match(host, /export default \{ name, inject, apply, Config: SettingsSchema \}/)
})

test('host keeps the optional settings transport non-gating', () => {
  // cordis treats every inject name as a REQUIRED gate, so declaring the
  // version-dependent transport in exports.inject leaves the fiber INACTIVE and
  // fails the whole Web boot. `settings` may only be awaited through the
  // non-gating ctx.inject(['settings'], cb) that already exists.
  assert.match(host, /export const inject = \['llm'\]/)
  assert.match(host, /ctx\.inject\(\['settings'\], \(sctx\) => \{/)
  assert.doesNotMatch(host, /export const inject = \[[^\]]*settings/)
  assert.doesNotMatch(host, /export const inject = \[[^\]]*(configForms|settingsScope)/)
  // The Host half never touches the client-side form transport.
  assert.doesNotMatch(host, /configForms/)
})

test('declarative-host branch suppresses the generated page and reads on demand', () => {
  // configure(presentation, owner) is keyed by the plugin entry's OWN fiber, and
  // the declarative branch is chosen by capability, not by host version.
  assert.match(host, /typeof settings\.configure === 'function'/)
  assert.match(host, /settings\.configure\(\{ auto: false \}, ctx\.fiber\)/)
  assert.match(host, /const settings = sctx\.settings\n\s+if \(!settings\) return/)
  // The parsed Config is read on EVERY request; nothing caches a settings value
  // at apply time, because volatile fields are edited in place.
  assert.match(host, /function readConfiguredSettings\(config\)/)
  assert.match(host, /const effective = validateSettings\(readConfiguredSettings\(config\)\)/)
  assert.match(host, /return normalizeSettings\(\{\}\)/)
  // Disposal mirrors the legacy branch on both paths.
  assert.equal((host.match(/\$\{name\}: settings fallback/g) || []).length, 1)
})

test('client looks up the settings form by the loader entry id', () => {
  // configForms.get(entryId) is keyed by the loader entry id, which the patch row
  // declares; the namespace must stay equal on both hosts.
  assert.match(patch, /id: subagent-conductor/)
  assert.match(client, /const NS = 'subagent-conductor'/)
  assert.match(client, /const forms = ctx\.get\('configForms'\)/)
  assert.match(client, /forms\.get\(namespace\)/)
})

test('settings card writes the fixed-path volatile fields leaf by leaf', () => {
  // defaultRoute's Config leaves are volatile but the enclosing node is not, and
  // the declarative host refuses an op whose path is not beneath a volatile node;
  // a whole-object write at ['defaultRoute'] would never land.
  assert.match(client, /path: \['defaultRoute', field\]/)
  assert.match(client, /\{ op: 'unset', path: \['defaultRoute', field\] \}/)
  assert.doesNotMatch(client, /path: \['defaultRoute'\]/)
  // The runtime-rekeyed records keep addressing the node itself.
  assert.match(client, /path: \['sessionSelections', rootId\]/)
  assert.match(client, /path: \['roles'\], value: form\.roles/)
  assert.match(client, /path: \['defaultRole'\]/)
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
  // 卡片必须在设置传输的子上下文上注册（sctx.slots），见 client.js 的 registerCard。
  assert.match(client, /sctx\.slots\.inject\('settings\.plugin\.item'/)
  assert.match(client, /ctx\.effect\(\(\) => \(\) => style\.remove\(\)/)
  assert.doesNotMatch(client, /214748/)
  assert.doesNotMatch(client, /document\.body\.appendChild/)
})

test('client declares dotted remote services and no legacy connection', () => {
  // NEITHER settings transport may appear in exports.inject: cordis treats every
  // inject name as a REQUIRED gate, so declaring the optional transport leaves the
  // plugin permanently pending and fails Web boot. The optional wait lives in
  // apply as ctx.inject([...], cb); the dotted remote names must stay declared.
  assert.match(client, /exports\.inject = \['slots', 'remote', 'remote\.session', 'remote\.settings'\]/)
  assert.match(client, /function resolveSettingsScopeFrom\(ctx, namespace\)/)
  assert.match(client, /ctx\.inject\(\['settingsScope'\], registerCard\)/)
  assert.match(client, /ctx\.inject\(\['configForms'\], \(sctx\) => \{ if \(scope === undefined\) registerCard\(sctx\) \}\)/)
  assert.doesNotMatch(client, /exports\.inject = \[[^\]]*settingsScope/)
  assert.doesNotMatch(client, /exports\.inject = \[[^\]]*configForms/)
  assert.doesNotMatch(client, /ctx\.settingsScope\.bind/)
  assert.doesNotMatch(client, /'connection'/)
  assert.doesNotMatch(client, /ctx\.get\('connection'\)/)
  assert.match(client, /remote\.session\.modelCatalog\(\)/)
  assert.match(client, /remote\.settings\.mutate\(payload\.ns, payload\.ops, payload\.expectedRevision\)/)
})

// ── the 0.1.7-rc.2 seat: the keyed slot plugins.row.config ───────────────────
//
// rc.2 removed `settings.plugin.item`; a bundle ROW's configuration seat is the
// keyed slot `plugins.row.config`, declared by the official plugin-manager page,
// and that page shows a row's configure control only while an occupant holds the
// exact `<package name>#<row id>` ledger key. Both seats therefore stay declared
// side by side — each fires only where its own slot exists.

test('rc.2: the card also registers on the keyed plugins.row.config seat', () => {
  // ONE options object (`{ name, key }`), never a slot name plus options: the real
  // slots service reads `options.name` and rejects a bare string as undeclared.
  assert.match(clientCode, /sctx\.slots\.register\(\{\s*name: 'plugins\.row\.config',\s*key: ROW_CONFIG_KEY,?\s*\},/)
  assert.doesNotMatch(clientCode, /slots\.register\(\s*'plugins\.row\.config'/)
  // Reached through the non-gating ctx.inject(['slots'], …) wait, and the
  // registration disposer is returned so the entry is owned by that fiber.
  assert.match(clientCode, /const registerRowConfig = \(sctx\) => sctx\.slots\.inject\('plugins\.row\.config', \(\) => sctx\.slots\.register\(/)
  assert.match(clientCode, /ctx\.inject\(\['slots'\], registerRowConfig\)/)
  // `view === 'summary'` renders the one-liner alone; `page` renders the card.
  assert.match(clientCode, /props\.view === 'summary'/)
  assert.match(clientCode, /return e\('span', \{ className: 'dscRowSummary' \}/)
  assert.match(clientCode, /return e\(SettingsCard, \{ scope, api \}\)/)
  // The host-owned `form` prop is optional: this plugin must not grow a second
  // read or write path on top of the resolved settings scope.
  assert.doesNotMatch(clientCode, /props\.form/)
  // The ≤ 0.1.5 seat stays exactly where it was.
  assert.match(clientCode, /sctx\.slots\.inject\('settings\.plugin\.item'/)
  // `scope` must be read from the apply closure at render time, never captured by
  // value at registration time (the transport may resolve after this registration).
  assert.doesNotMatch(clientCode, /e\(SettingsCard, \{ scope: props\./)
})

test('rc.2: ROW_CONFIG_KEY is exactly `<package name>#<row id in cordis.patch.yml>`', () => {
  const effective = patch.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n')
  const rowId = effective.match(/^\s*-\s*id:\s*([^\s#]+)\s*$/m)?.[1]
  assert.ok(rowId, 'cordis.patch.yml must declare one row id')
  const expected = `${pkg.name}#${rowId}`
  // One literal in the source …
  const literal = client.match(/const ROW_CONFIG_KEY = '([^']+)'/)
  assert.ok(literal, 'ROW_CONFIG_KEY must be declared as one single-quoted literal')
  assert.equal(literal[1], expected)
  // … and the same value the bundle actually exports.
  assert.equal(loadClientPlugin().ROW_CONFIG_KEY, expected)
})

test('client hard-gates on no version-dependent settings service', () => {
  const plugin = loadClientPlugin()
  assert.ok(Array.isArray(plugin.inject), 'exports.inject must be an array')
  // cordis resolves EVERY inject name as its own required gate, so an optional,
  // version-dependent transport here leaves the fiber INACTIVE and fails Web boot
  // with "N entries did not activate / waiting for service: <name>". Exact-entry
  // comparison keeps `remote.settings` (a dotted remote face) out of the ban.
  for (const name of ['settings', 'settingsScope', 'configForms']) {
    assert.ok(!plugin.inject.includes(name), `${name} must never be a hard inject gate`)
  }
  // Pin the complete list: any added gate fails here, and the dotted remote
  // declarations cannot be dropped silently. `slots` is provided by every Web
  // client and orders the registrations after the slot registry exists.
  assert.deepEqual([...plugin.inject], ['slots', 'remote', 'remote.session', 'remote.settings'])
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
