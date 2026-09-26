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
// Node, so the runtime guards below evaluate it in a sandbox and read the plugin
// object the factory returns. `reactHooks` hands the bundle a hook host that keeps
// state across render passes (see createHookHost); without it the stub records only
// the OBJECT shape, which is all the registration guards need. The DOM stub stays
// this small because `apply` only touches document.createElement / head.appendChild
// (its style node) — the card's own effects are never executed here.
function loadClientPlugin(reactHooks = {}) {
  let captured
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useReducer: (state) => [state, () => {}],
    useEffect: () => {},
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: 'Fragment',
    ...reactHooks,
  }
  const sandbox = {
    window: { __ModuleLoader__: { load(spec) { captured = spec } } },
    document: {
      createElement: () => ({ style: {}, dataset: {}, textContent: '', remove() {} }),
      head: { appendChild() {} },
      querySelectorAll: () => [],
    },
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

// One host shape: which optional services and which Slots are declared. `inject`
// fires only when every requested name is provided, exactly like cordis. cordis
// also COLLECTS the callback's returned function as an effect of the child fiber it
// creates for `ctx.inject` (Fiber._execute), which is this plugin's disposal path
// for both card seats — so `dispose()` here releases exactly what the real fiber
// would, and `disposals` records each released registration by name.
function makeCtx({ services = [], slots = [] } = {}) {
  const registered = []
  const disposals = []
  const fiberDisposers = []
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: {}, base: {}, user: {}, revision: 1 }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
    mutate: async () => true,
  }
  const ctx = {
    get(name) {
      if (name === 'settingsScope' && services.includes('settingsScope')) return { bind: () => scope }
      if (name === 'configForms' && services.includes('configForms')) return { get: () => scope }
      return undefined
    },
    inject(names, cb) {
      const list = Array.isArray(names) ? names : [names]
      if (!list.every((name) => name === 'slots' || services.includes(name))) return
      const dispose = cb(ctx)
      if (typeof dispose === 'function') fiberDisposers.push(dispose)
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') fiberDisposers.push(dispose)
      return typeof dispose === 'function' ? dispose : () => {}
    },
    slots: {
      inject(slot, cb) {
        if (!slots.includes(slot)) return () => {}
        const dispose = cb()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(options, component) {
        registered.push({ options, component })
        return () => { disposals.push(options.name) }
      },
    },
  }
  const dispose = () => {
    for (const release of fiberDisposers.splice(0)) {
      try { release() } catch (_) { /* a released effect must not mask the guard */ }
    }
  }
  return { ctx, registered, disposals, dispose }
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
  // `page` renders the card — and that view IS one card alone on a page of its
  // own, so it also asks for the expanded disclosure. The collapsed default
  // belongs to the legacy Plugins-list seat. Bounded to THIS occupant so the
  // additive settings.section page (same literal, guarded separately below)
  // cannot satisfy the assertion by itself.
  assert.match(clientCode, /props\.view === 'summary'[\s\S]{0,600}?return e\(SettingsCard, \{ scope, api, defaultOpen: true \}\)/)
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

// ── additive seat: the settings.section page (one click deep in 设置) ────────
//
// 0.1.7-rc.2 also declares the root-scope LIST slot `settings.section` ("one
// settings page per list entry") beside the two card seats. This registration is
// ADDITIVE and must never gate the plugin: the seat is host-version dependent and
// is awaited through the same NON-GATING `ctx.inject(['slots'], …)` shape the row
// seat uses, whose callback returns the registration disposer. The page renders
// the SAME SettingsCard the row seat renders for `view === 'page'` — one settings
// UI, one transport, one persistence path.

test('additive settings.section seat carries the exact nav identity', () => {
  assert.match(clientCode, /const registerSettingsSection = \(sctx\) => sctx\.slots\.inject\('settings\.section', \(\) => sctx\.slots\.register\(\{/)
  assert.match(clientCode, /name: 'settings\.section'/)
  assert.match(clientCode, /id: 'yotk-subagent-conductor'/)
  assert.match(clientCode, /order: 62/)
  // label is a THUNK: the shell re-reads it on every projection instead of
  // caching registrant-localized text
  assert.match(clientCode, /label: \(\) => 'YOTK · Conductor'/)
  // registered from inside the non-gating slots wait, and the disposer the
  // callback returns is collected by the child fiber cordis creates for
  // `ctx.inject([...], cb)` — the same disposal path as the row seat above.
  assert.match(clientCode, /ctx\.inject\(\['slots'\], registerSettingsSection\)/)
  assert.match(clientCode, /const registerRowConfig = \(sctx\) => sctx\.slots\.inject\('plugins\.row\.config'/)
  // the additive seat sits BESIDE both card seats, never instead of them
  assert.match(clientCode, /sctx\.slots\.inject\('settings\.plugin\.item'/)
  // the seat declares exactly { id, order, label } — no invented contract keys
  assert.doesNotMatch(clientCode, /name: 'settings\.section',\s*\n\s*locale:/)
})

test('settings.section fires without any settings transport and never gates', () => {
  const plugin = loadClientPlugin()
  // A host with the two card seats but NO settings transport at all: the seat
  // registration must still fire (non-gating), exactly like the row seat.
  const { ctx, registered, disposals, dispose } = makeCtx({
    services: [],
    slots: ['settings.section', 'plugins.row.config'],
  })
  plugin.apply(ctx)
  const section = registered.find((item) => item.options.name === 'settings.section')
  assert.ok(section, 'the settings.section occupant must register where the seat is declared')
  assert.deepEqual(Object.keys(section.options).sort(), ['id', 'label', 'name', 'order'])
  assert.equal(section.options.id, 'yotk-subagent-conductor')
  assert.equal(section.options.order, 62)
  assert.equal(typeof section.options.label, 'function')
  assert.equal(section.options.label(), 'YOTK · Conductor')
  // the registration is owned by the plugin: the disposer the callback returned
  // is what the plugin's own fiber releases
  assert.deepEqual(disposals, [], 'nothing is released before the plugin is disposed')
  dispose()
  assert.deepEqual(disposals.slice().sort(), ['plugins.row.config', 'settings.section'])

  // A host that does not declare the seat: nothing registers there and apply
  // still succeeds, so the seat can never gate activation.
  const absent = makeCtx({ services: [], slots: [] })
  assert.equal(plugin.apply(absent.ctx), undefined)
  assert.deepEqual(absent.registered, [])
})

test('the settings.section page renders the same card component as the row page', () => {
  const plugin = loadClientPlugin()
  const { ctx, registered } = makeCtx({
    services: ['configForms'],
    slots: ['settings.section', 'plugins.row.config'],
  })
  plugin.apply(ctx)
  const section = registered.find((item) => item.options.name === 'settings.section')
  const row = registered.find((item) => item.options.name === 'plugins.row.config')
  assert.ok(section, 'expected a settings.section occupant')
  assert.ok(row, 'expected a plugins.row.config occupant')

  // The section owner shares `close` and nothing else ...
  const sectionPage = section.component({ close: () => {} })
  const rowPage = row.component({ view: 'page' })
  // ... and it renders the SAME component the row seat renders for view=page:
  // one settings UI, one read path, one write path.
  assert.equal(typeof sectionPage.type, 'function')
  assert.equal(sectionPage.type, rowPage.type)
  assert.equal(sectionPage.props.scope, rowPage.props.scope)
  // neither `close` nor the host-owned optional `form` prop is consumed. The only
  // extra prop is the disclosure default: this page holds ONE card, so it must
  // start expanded (pinned behaviourally below).
  assert.deepEqual(Object.keys(sectionPage.props).sort(), ['api', 'defaultOpen', 'scope'])
  const passedForm = section.component({ close: () => {}, form: { state: {}, mutate() {} } })
  assert.equal(passedForm.type, sectionPage.type)
  assert.equal(passedForm.props.scope, sectionPage.props.scope)
  // a one-liner is still what the row seat's summary branch renders
  assert.equal(row.component({ view: 'summary' }).type, 'span')
})

// ── the card's disclosure default: expanded where the card renders alone ────
//
// Two seats put this ONE card on a page of its own — the row seat's
// `view === 'page'` branch and the additive `settings.section` page — so its body
// must start expanded there, while the header button keeps folding it back up. The
// legacy ≤ 0.1.5 `settings.plugin.item` card still sits in the Plugins list beside
// many other cards, so it keeps the collapsed default. The card here is the REAL
// SettingsCard and these hooks are a minimal host that keeps one state slot per
// useState/useReducer call across render passes, so `header.onClick` followed by a
// re-render IS the user's click: no source-text matching is involved.
function createHookHost() {
  let state = []
  let cursor = 0
  return {
    hooks: {
      useState(initial) {
        const index = cursor++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        const set = (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next }
        return [state[index], set]
      },
      useReducer(reducer, initial) {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        const dispatch = (action) => { state[index] = reducer(state[index], action) }
        return [state[index], dispatch]
      },
      useEffect() { cursor++; return undefined },
      useRef(current) { cursor++; return { current } },
      useCallback(fn) { cursor++; return fn },
      useMemo(fn) { cursor++; return fn() },
    },
    // a FRESH mount: React would own new state slots for a new card instance
    mount() { state = []; cursor = 0 },
    // one render pass: hook slots are addressed from 0 again, state survives
    render(component, props) { cursor = 0; return component(props) },
  }
}

test('the card body starts expanded on both single-card pages and the header still collapses it', () => {
  const host = createHookHost()
  const plugin = loadClientPlugin(host.hooks)
  const { ctx, registered } = makeCtx({
    services: ['configForms'],
    slots: ['settings.section', 'plugins.row.config'],
  })
  plugin.apply(ctx)
  const section = registered.find((item) => item.options.name === 'settings.section')
  const row = registered.find((item) => item.options.name === 'plugins.row.config')

  for (const [seat, element] of [
    ['settings.section', section.component({ close: () => {} })],
    ["plugins.row.config view='page'", row.component({ view: 'page' })],
  ]) {
    // the seat asks for the expanded disclosure ...
    assert.equal(element.props.defaultOpen, true, `${seat} must ask for an expanded card`)

    host.mount()
    const page = host.render(element.type, element.props)
    // SettingsCard returns one Fragment holding the single card element
    const card = page.children[0]
    // ... and the first render shows it open: body present, aria-expanded true
    assert.equal(card.props.className, 'dscCard dscCardOpen', `${seat} must start expanded`)
    assert.equal(card.children[0].props['aria-expanded'], true)
    assert.equal(card.children[1].props.className, 'dscCardBody')

    // the manual toggle still folds it back up
    card.children[0].props.onClick()
    const collapsed = host.render(element.type, element.props).children[0]
    assert.equal(collapsed.props.className, 'dscCard', `${seat} must collapse on the header click`)
    assert.equal(collapsed.children[0].props['aria-expanded'], false)
    assert.ok(!collapsed.children[1], `${seat} must render no body once collapsed`)
  }

  // the legacy ≤ 0.1.5 seat is untouched: its card still sits in the Plugins list
  // of many cards, which is the reason the collapsed default existed, so it asks
  // for nothing and starts collapsed there.
  const { ctx: legacyCtx, registered: legacyRegistered } = makeCtx({
    services: ['settingsScope'],
    slots: ['settings.plugin.item'],
  })
  loadClientPlugin(host.hooks).apply(legacyCtx)
  const legacy = legacyRegistered[0]
  assert.equal(legacy.options.name, 'settings.plugin.item')
  const legacyElement = legacy.component()
  assert.equal(legacyElement.props.defaultOpen, undefined, 'the legacy list seat asks for nothing')
  host.mount()
  const legacyCard = host.render(legacyElement.type, legacyElement.props).children[0]
  assert.equal(legacyCard.props.className, 'dscCard')
  assert.ok(!legacyCard.children[1], 'the legacy list card starts collapsed')
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
  // The disclosure default is SEAT-owned: the card starts from `defaultOpen`, so
  // the legacy Plugins-list registration (which passes nothing) stays collapsed
  // while the two single-card seats pass `defaultOpen: true`. The behavioural
  // guard with the real SettingsCard lives in the disclosure test below.
  assert.match(client, /const \[open, setOpen\] = React\.useState\(defaultOpen === true\)/)
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

// ── manifest: the schemastery FLOOR decides whether a settings page exists ───
//
// The profile root hoists the older 3.18.2 line, and `^3.18.1` is *satisfied* by
// that hoisted copy, so pnpm never materializes a private volatile-capable copy.
// `SettingsForms.describe()` drops any entry whose schema exposes no volatile
// field, so the settings page disappears with no error at all. This is a FLOOR
// rule, not a caret rule: the assertion below parses the declared range and
// compares its minimum version, so `>=3.18.4`, `^3.18.4` and any future higher
// floor pass while `^3.18.1` / `^3.18.2` / `^3.18.3` fail.
const VOLATILE_FLOOR = [3, 18, 4]

// Minimum stable version of a supported range, or null when the range is
// permissive / unparseable (a `*`-like range admits 3.18.2, so it is not a floor).
function minimumSatisfiableVersion(range) {
  if (typeof range !== 'string') return null
  const trimmed = range.trim()
  if (trimmed === '' || trimmed === '*' || trimmed === 'x' || trimmed === 'latest') return null
  if (trimmed.includes('||')) return null // an OR admits every branch's minimum
  let floor = null
  for (const token of trimmed.split(/\s+/).filter(Boolean)) {
    const m = /^(\^|~|>=|<=|>|<|=|v)?\s*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(token)
    if (!m) return null
    const version = [Number(m[2]), Number(m[3]), Number(m[4])]
    const stable = m[5] === undefined
    const op = m[1] || '='
    // A caret/tilde/exact floor is the version itself; `>` sits just above it.
    const candidate = op === '>' ? [version[0], version[1], version[2] + 1] : version
    if (!stable) return null // a prerelease floor does not promise a stable `.volatile()`
    if (floor === null || compareVersions(candidate, floor) > 0) floor = candidate
  }
  return floor
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  return 0
}

test('declared @deepseek-ai/schemastery floor can never resolve a line without .volatile()', () => {
  // It must stay a private `dependencies` entry: a peer would be downgraded to
  // the profile's hoisted 3.18.2 copy, which is exactly the silent failure.
  assert.equal(
    Object.prototype.hasOwnProperty.call(pkg.dependencies ?? {}, '@deepseek-ai/schemastery'),
    true,
    '@deepseek-ai/schemastery must stay a private dependencies entry',
  )
  const range = pkg.dependencies['@deepseek-ai/schemastery']
  const floor = minimumSatisfiableVersion(range)
  assert.ok(floor !== null, `unparseable / permissive schemastery range: ${range}`)
  assert.ok(
    compareVersions(floor, VOLATILE_FLOOR) >= 0,
    `the declared floor must exclude schemastery lines without .volatile() (got ${range}, floor ${floor.join('.')})`,
  )
})

test('the floor guard itself rejects the volatile-less lines and accepts higher floors', () => {
  for (const range of ['^3.18.4', '>=3.18.4', '^3.18.5', '>3.18.3', '3.18.4', '^4.0.0']) {
    const floor = minimumSatisfiableVersion(range)
    assert.ok(floor, `${range} must parse to a floor`)
    assert.ok(compareVersions(floor, VOLATILE_FLOOR) >= 0, `${range} must pass the floor guard`)
  }
  for (const range of ['^3.18.1', '^3.18.2', '^3.18.3', '>=3.18.0', '~3.18.2', '3.18.2', '*', '^3.18.4-rc.1']) {
    const floor = minimumSatisfiableVersion(range)
    assert.ok(
      floor === null || compareVersions(floor, VOLATILE_FLOOR) < 0,
      `${range} must fail the floor guard`,
    )
  }
})
