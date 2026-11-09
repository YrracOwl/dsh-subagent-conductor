import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// ── the Client half of role instructions ────────────────────────────────────
//
// Roles carry TWO human-facing strings that must never be confused:
//
//   description  — the one-line PURPOSE shown in the role list;
//   instructions — the role's PRESET PROMPT (default ''), handed to a child only
//                  by the explicit `subagent_role` tool.
//
// The card is an official __ModuleLoader__ bundle, so it is not importable in
// Node. These guards therefore execute the REAL bundle against a minimal hook
// host and drive the real editor handlers, exactly like a user click: source
// regexes alone would not prove that instructions survive edit → copy → save →
// JSON export/import.
const client = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

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

// A hook host that keeps ONE state slot per useState/useReducer call across
// render passes, so calling a rendered onClick/onChange followed by a re-render
// IS the user's interaction (no source-text matching involved).
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
    mount() { state = []; cursor = 0 },
    render(component, props) { cursor = 0; return component(props) },
  }
}

// Render the real SettingsCard from the additive `settings.section` seat, wired
// to a mutable settings document and a remote stub that records every mutation
// payload. The recorded ops are the exact document the Host would persist.
function mountCard(value) {
  const host = createHookHost()
  const plugin = loadClientPlugin(host.hooks)
  const snapshot = { value: structuredClone(value) }
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: snapshot.value, base: {}, user: {}, revision: 1 }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
    mutate: async () => true,
  }
  const mutations = []
  const remote = {
    session: { modelCatalog: async () => ({ ok: true, value: { groups: [] } }) },
    settings: { mutate: async (ns, ops) => { mutations.push({ ns, ops }); return { ok: true } } },
  }
  const registered = []
  const ctx = {
    get(name) {
      if (name === 'remote') return remote
      if (name === 'configForms') return { get: () => scope }
      return undefined
    },
    inject(names, cb) {
      const list = Array.isArray(names) ? names : [names]
      if (!list.every((name) => name === 'slots' || name === 'configForms')) return
      cb(ctx)
    },
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    slots: {
      inject(slot, cb) {
        if (slot !== 'settings.section' && slot !== 'plugins.row.config') return () => {}
        const dispose = cb()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(options, component) { registered.push({ options, component }); return () => {} },
      entries() { return [] },
    },
  }
  plugin.apply(ctx)
  const section = registered.find((item) => item.options.name === 'settings.section')
  assert.ok(section, 'expected a settings.section occupant to render the card')
  const element = section.component({ close: () => {} })
  host.mount()
  const draw = () => host.render(element.type, element.props)
  return { draw, mutations }
}

// Walk a rendered element tree and collect every element matching `predicate`.
function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) { for (const child of node) collect(child, predicate, found); return found }
  if (predicate(node)) found.push(node)
  for (const child of node.children || []) collect(child, predicate, found)
  return found
}

// The element whose only child is exactly `text` — i.e. a button label or a copy
// line, found by its rendered text rather than by a source regex.
function byText(root, text) {
  const matches = collect(root, (item) => Array.isArray(item.children) && item.children.length === 1 && item.children[0] === text)
  assert.ok(matches.length, `rendered tree must contain the text ${JSON.stringify(text)}`)
  return matches[0]
}

// One role's card in the list, addressed by the role id it renders.
function roleCard(page, id) {
  const cards = collect(page, (item) => item.props?.className === 'dscRoleCard')
  const match = cards.find((card) => collect(card, (item) => item.children?.[0] === id).length > 0)
  assert.ok(match, `expected a role card for ${JSON.stringify(id)}`)
  return match
}

const preview = (card) => collect(card, (item) => item.props?.className === 'dscRoleInstructions')[0].children[0]
const instructionsArea = (root) => collect(root, (item) => item.type === 'textarea' && item.props.rows === 8)[0]
const jsonArea = (root) => collect(root, (item) => item.type === 'textarea' && item.props.rows === 18)[0]
const dialog = (page, label) => collect(page, (item) => item.type === 'section' && item.props?.['aria-label'] === label)[0]

const ROLES = {
  defaultRole: 'reviewer',
  roles: {
    reviewer: { displayName: 'Reviewer', description: 'Review route', instructions: 'PRESET ONE', provider: 'p', model: 'm' },
    router: { displayName: 'Router', description: 'Route only', provider: 'p', model: 'm' },
  },
}

test('the role editor exposes instructions as a multi-line textarea, separate from description', () => {
  const { draw } = mountCard(ROLES)
  let page = draw()
  // Unedited card: a SHORT single-line preview of the preset prompt.
  assert.equal(preview(roleCard(page, 'reviewer')), '预置提示词：PRESET ONE')
  // A route-only role says so instead of rendering an empty line.
  assert.equal(preview(roleCard(page, 'router')), '预置提示词：无（仅用于模型路由）')

  byText(roleCard(page, 'reviewer'), '编辑').props.onClick()
  page = draw()
  const editor = dialog(page, '编辑角色')
  assert.ok(editor, 'the edit-role editor must render')
  // exactly ONE multi-line textarea, holding the multi-line prompt verbatim
  assert.equal(collect(editor, (item) => item.type === 'textarea').length, 1)
  assert.equal(instructionsArea(editor).props.value, 'PRESET ONE')
  // description stays a single-line input: purpose is not the prompt
  assert.equal(collect(editor, (item) => item.type === 'input' && item.props.value === 'Review route').length, 1)
  assert.match(collect(editor, (item) => item.children?.[0] === '角色描述（用途）')[0].children[0], /角色描述（用途）/)
  assert.ok(byText(editor, '预置提示词（instructions）'))
})

test('a new role created through the editor keeps its multi-line instructions', () => {
  const { draw, mutations } = mountCard({ roles: {} })
  let page = draw()
  byText(page, '+ 新建角色').props.onClick()

  // Fill the real fields in the order the editor renders them: id, displayName,
  // description, then the instructions textarea.
  const type = (selector, value) => {
    const page = draw()
    const root = dialog(page, '新建角色')
    const target = selector(root)
    assert.ok(target, 'expected the editor field to render')
    target.props.onChange({ target: { value } })
  }
  type((root) => collect(root, (item) => item.type === 'input' && item.props.placeholder === 'code-reviewer')[0], 'writer')
  type((root) => collect(root, (item) => item.type === 'input')[1], 'Writer')
  type((root) => collect(root, (item) => item.type === 'input')[2], 'Write docs')
  type((root) => instructionsArea(root), 'WRITE CAREFULLY\nAND SHORTLY')

  page = draw()
  byText(dialog(page, '新建角色'), '应用到草稿').props.onClick()
  page = draw()
  // The draft preview collapses the two lines into one short line …
  assert.equal(preview(roleCard(page, 'writer')), '预置提示词：WRITE CAREFULLY AND SHORTLY')
  // … while the record itself keeps the newline.
  byText(page, '导入/导出 JSON').props.onClick()
  page = draw()
  assert.equal(JSON.parse(jsonArea(dialog(page, '导入或导出角色 JSON')).props.value).writer.instructions, 'WRITE CAREFULLY\nAND SHORTLY')

  // Saving writes ONE roles record whose instructions are the typed text.
  byText(draw(), '保存').props.onClick()
  return Promise.resolve().then(() => {
    const rolesOp = mutations.at(-1).ops.find((op) => op.path?.[0] === 'roles')
    assert.ok(rolesOp, 'the save must write the roles record')
    assert.equal(rolesOp.value.writer.instructions, 'WRITE CAREFULLY\nAND SHORTLY')
  })
})

test('copy duplicates instructions and never mutates the source role', () => {
  const { draw, mutations } = mountCard(ROLES)
  let page = draw()
  byText(roleCard(page, 'reviewer'), '复制').props.onClick()
  page = draw()
  // The copy editor is a CREATE editor pre-filled from the source, prompt included.
  const copyDialog = dialog(page, '新建角色')
  assert.ok(copyDialog, 'copy opens the create editor')
  assert.equal(instructionsArea(copyDialog).props.value, 'PRESET ONE')
  assert.equal(collect(copyDialog, (item) => item.type === 'input' && item.props.placeholder === 'code-reviewer')[0].props.value, 'reviewer-copy')
  byText(copyDialog, '应用到草稿').props.onClick()

  page = draw()
  assert.equal(preview(roleCard(page, 'reviewer-copy')), '预置提示词：PRESET ONE')
  assert.equal(preview(roleCard(page, 'reviewer')), '预置提示词：PRESET ONE')

  byText(page, '保存').props.onClick()
  return Promise.resolve().then(() => {
    const roles = mutations.at(-1).ops.find((op) => op.path?.[0] === 'roles').value
    assert.deepEqual(Object.keys(roles).sort(), ['reviewer', 'reviewer-copy', 'router'])
    assert.equal(roles['reviewer-copy'].instructions, 'PRESET ONE')
    assert.equal(roles.reviewer.instructions, 'PRESET ONE')
  })
})

test('a route-only role saves an explicit empty instructions string', () => {
  const { draw, mutations } = mountCard(ROLES)
  let page = draw()
  byText(roleCard(page, 'router'), '编辑').props.onClick()
  page = draw()
  const editor = dialog(page, '编辑角色')
  assert.equal(instructionsArea(editor).props.value, '', 'a role without instructions opens an empty prompt field')
  byText(editor, '应用到草稿').props.onClick()

  byText(draw(), '保存').props.onClick()
  return Promise.resolve().then(() => {
    const roles = mutations.at(-1).ops.find((op) => op.path?.[0] === 'roles').value
    // The key is present and empty: the host Config declares it with that default,
    // so writing it keeps draft, saved record and JSON on one shape.
    assert.equal('instructions' in roles.router, true)
    assert.equal(roles.router.instructions, '')
  })
})

test('JSON export/import round-trips instructions and treats the key as optional', () => {
  const { draw } = mountCard(ROLES)
  let page = draw()
  byText(page, '导入/导出 JSON').props.onClick()
  page = draw()
  const exported = JSON.parse(jsonArea(dialog(page, '导入或导出角色 JSON')).props.value)
  assert.deepEqual(exported.reviewer, { displayName: 'Reviewer', description: 'Review route', instructions: 'PRESET ONE', provider: 'p', model: 'm' })
  assert.deepEqual(exported.router, { displayName: 'Router', description: 'Route only', instructions: '', provider: 'p', model: 'm' })

  // An imported record WITHOUT the key is accepted and normalized to '' …
  const area = jsonArea(dialog(page, '导入或导出角色 JSON'))
  area.props.onChange({ target: { value: JSON.stringify({ plain: { displayName: 'Plain', description: 'Desc' } }) } })
  page = draw()
  byText(dialog(page, '导入或导出角色 JSON'), '应用到草稿').props.onClick()
  page = draw()
  assert.equal(preview(roleCard(page, 'plain')), '预置提示词：无（仅用于模型路由）')
  byText(page, '导入/导出 JSON').props.onClick()
  page = draw()
  assert.equal(JSON.parse(jsonArea(dialog(page, '导入或导出角色 JSON')).props.value).plain.instructions, '')

  // … and a multi-line prompt survives import → export byte for byte.
  const multiline = { 'doc-writer': { displayName: 'Doc Writer', description: 'Write docs', instructions: 'Line one\nLine two', provider: 'p', model: 'm' } }
  jsonArea(dialog(page, '导入或导出角色 JSON')).props.onChange({ target: { value: JSON.stringify(multiline) } })
  page = draw()
  byText(dialog(page, '导入或导出角色 JSON'), '应用到草稿').props.onClick()
  page = draw()
  assert.equal(preview(roleCard(page, 'doc-writer')), '预置提示词：Line one Line two')
  byText(page, '导入/导出 JSON').props.onClick()
  page = draw()
  assert.equal(JSON.parse(jsonArea(dialog(page, '导入或导出角色 JSON')).props.value)['doc-writer'].instructions, 'Line one\nLine two')
})

test('an invalid import still reports the pairing rule and leaves the draft untouched', () => {
  const { draw } = mountCard({ roles: {} })
  let page = draw()
  byText(page, '导入/导出 JSON').props.onClick()
  page = draw()
  jsonArea(dialog(page, '导入或导出角色 JSON')).props.onChange({ target: { value: JSON.stringify({ broken: { displayName: 'Broken', description: 'Desc', provider: 'p' } }) } })
  page = draw()
  byText(dialog(page, '导入或导出角色 JSON'), '应用到草稿').props.onClick()
  page = draw()
  const alert = collect(page, (item) => item.props?.role === 'alert')[0]
  assert.match(alert.children[0], /provider 与 model 必须成对出现/)
  // the draft is still empty: nothing was imported
  assert.equal(collect(page, (item) => item.props?.className === 'dscRoleCard').length, 0)
})

test('client copy separates the default role from explicit role delegation', () => {
  // The default role is a MODEL ROUTE only; instructions travel only through the
  // explicit `subagent_role` tool, whose route is not overridden by session or
  // global defaults. Both sentences must be present, and no permission bypass may
  // be claimed here.
  const plain = client.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n')
  assert.match(plain, /默认角色只是模型路由层，不会注入任何提示词/)
  assert.match(plain, /显式的 subagent_role 工具使用角色自身模型与预置提示词，不受本页全局默认或输入框根会话选择覆盖/)
  assert.match(plain, /普通默认角色只影响模型路由，不会把这段文本注入普通 subagent \/ subagent_fork 委派/)
  assert.match(plain, /且只改变模型路由，不注入角色的预置提示词/)
  // ... and nothing here may pretend to grant permissions or special-case Gate 9.
  assert.doesNotMatch(plain, /Gate9|gate9|权限绕过|bypass/i)
})
