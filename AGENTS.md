# dsh-subagent-conductor Agent Guide

## Scope and Purpose

- This package is an independently published Host+Web Cordis bundle: a **settings and default-route layer over the official subagent tools** (0.2.x, DSH 0.1.2-rc.1+). It owns a Settings namespace, a composer per-root-session selector, role templates, and one Host request listener.
- It does NOT delegate: no own tool, no private AgentOptions marker, no wrapping of `ctx.subagents.*`, no replacement of stock `subagent` / `subagent_fork` rows, no agent-preset copies.
- It mounts once in the Host composition. Never copy its row into an agent preset: settings registration and the request listener are single-instance Host capabilities.
- Historical: `HANDOFF.md` documents the superseded 0.1.x plan (own `subagent_direct` tool + marker semantics). Do not implement from it; v0.2 contracts live here and in `docs/design.md`.

## Key Files

- `docs/design.md`: v0.2 contract — precedence, official-choice detection, effort atomicity.
- `lib/config.js`: pure normalization, layer resolution (`session > defaultRole > default`), request-route intent, lineage and subagent helpers.
- `lib/index.js`: Host Settings registration and the single `agent/request` listener (validation, non-strict degradation).
- `lib/client.js`: official Client bundle — composer selector (`conversation.input.right`) and the role/settings card, registered on BOTH card seats: legacy `settings.plugin.item` (declared by ≤ 0.1.5) and the rc.2 keyed row seat `plugins.row.config` keyed `ROW_CONFIG_KEY`, plus the additive `settings.section` page; lifecycle-owned styles/listeners.
- `test/config.test.mjs`, `test/compatibility.test.mjs`, `test/lifecycle-source.test.mjs`: v2 guards (lifecycle-source also carries the rc.2 row-seat, `settings.section` page and `ROW_CONFIG_KEY` derivation guards).
- `README.md`: user-facing EN/ZH semantics incl. migration notes from 0.1.x.

## Invariants

- Routing precedence is fixed: **root-session selection > default role > global default > official tool selection > native inheritance**. Conductor layers win over the official choice when they define a field; empty conductor layers leave the official/inherited request untouched.
- The official layer is read from the child's creation-time `AgentOptions` snapshot (`agent.options.provider/model/reasoningEffort`) — never from prompt text or tool names. No private marker, no fresh/cold-resume special case.
- A single `agent/request` listener is the only Host decision point. It must never wrap `ctx.subagents.start` / `startContinuable`, never register tools, and never touch other plugins' settings namespaces.
- Provider/model changes atomically clear inherited effort; conductor effort applies only after `ctx.llm.resolveModelInfo` confirms the exact model publishes it. Invalid configured routes degrade with a Host warning and keep the official request — stock delegation must never break.
- The composer selector writes one revision-aware path under the resolved non-subagent root session id (`origin`/`parentId` lineage, cycle-safe, fail closed). Client and Host must agree on the root key.
- Role entries are route presets + display metadata only (id/displayName/description/provider/model/reasoningEffort). v0.1 persona/toolFilter/transport/maxDepth/background fields are dropped and must not be reintroduced as runtime claims; the official tool rows own those start-time fields.
- Every listener, Settings registration, Slot, style node, and DOM listener needs a lifecycle-owned disposer. Runtime code must not import DSH/Cordis peer packages from the linked package path; obtain capabilities from injected `ctx` services.
- Settings reach the Host two ways. ≤ 0.1.5 registers the `subagent-conductor` namespace with `ctx.settings.register(...)`. ≥ 0.1.7 has no `register`: the namespace IS the entry's exported `Config`, keyed by the loader entry id `subagent-conductor`, where `defaultRoute`'s leaves and `defaultRole` are volatile and the two RECORDS (`roles`, `sessionSelections`) are volatile **as nodes** — the only legal way to keep `sessionSelections.<rootSessionId>` writable, since a volatile field may never sit inside a dict. `.volatile()` is applied by capability (the 0.1.5 schemastery has no such method; an unconditional call throws at module load), and `getSettings` must unwrap the resolved values (Symbol `Symbol.for('cosmokit.volatile.write')`, then `.get()`) on every read, because the service updates them in place without remounting. `ctx.settings.configure({ auto: false }, ctx.fiber)` declares that this plugin renders its own card rather than a generated page.
- The Client card has TWO version-split settings seats, because 0.1.7-rc.2 **removed** `settings.plugin.item`. Keep the legacy `settings.plugin.item` registration (key `subagent-conductor`, declared only by ≤ 0.1.5) beside the rc.2 occupant of the keyed slot `plugins.row.config`, registered as ONE options object (`{ name, key: ROW_CONFIG_KEY }` — the slots service reads `options.name`) from inside the non-gating `ctx.inject(['slots'], …)` callback that returns the registration disposer. `ROW_CONFIG_KEY` must stay `` `dsh-subagent-conductor#subagent-conductor` `` = `` `${package.json#name}#<row id in cordis.patch.yml>` ``: the official plugin-manager renders a row's configure control only while its registration ledger holds that exact key, so a card left on one seat renders nowhere, silently. The rc.2 occupant renders a one-liner alone for `view === 'summary'` and the existing card for `'page'`, and must never read the host-owned optional `form` prop — both seats keep the single resolved transport (`settingsScope` ≤ 0.1.5 / `configForms` ≥ 0.1.7).
- The same card is ALSO registered on the root-scope list seat `settings.section` (id `yotk-subagent-conductor`, order `62`, label thunk `() => 'YOTK · Conductor'` rendering the identity `YOTK · Conductor`), which is what makes it a first-class page one click deep in 设置. That seat is additive and host-version dependent: it must be kept BESIDE the row seat (not instead of it), registered with the same non-gating `ctx.inject(['slots'], …)` shape whose callback returns the registration disposer (cordis collects a callback's returned function as an effect of the child fiber `ctx.inject` creates), and it must render the SAME `SettingsCard` (one settings UI, one transport, one persistence path) — so a host that does not declare the seat simply never fires it and the plugin gains no new activation gate. Both single-card seats (the row seat's `view === 'page'` branch and this one) ask for `defaultOpen: true`, while the legacy `settings.plugin.item` list card keeps its collapsed default. `test/lifecycle-source.test.mjs` guards the nav identity, the no-transport registration plus its released disposer, the shared card component, and the disclosure default.
- `@deepseek-ai/schemastery` is a private `dependencies` entry whose FLOOR must be ≥ 3.18.4 (`^3.18.4`), because the profile hoists an older line (3.18.2) that satisfies a lower floor, and an entry whose Config exposes no volatile field is dropped from `SettingsForms.describe()` — the settings card then renders nothing with no error. `test/lifecycle-source.test.mjs` parses the declared range and fails when its minimum drops below 3.18.4.

## Validation

From this package directory run:

```powershell
npm test
npm run check
npm pack --dry-run
```

Optional DSH white-box guards (compatibility.test.mjs) need `DSH_CHECKOUT` pointing at the DSH install root (e.g. `C:\Users\CarryWho\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`); they skip when absent.

After bundle or manifest changes, refresh workspace metadata from the parent workspace and reconcile this package into the real Web profile (`dsh plugin --profile web add .`). Verify the existing `http://127.0.0.1:3080`; do not start a replacement server. Client changes need the user to restart the existing `dsh web`, then inspect the real Slot-rendered UI and computed behavior: the composer seat left of the main model, and the card on the seat that host declares — ≤ 0.1.5 under Settings → Plugins, ≥ 0.1.7-rc.2 on the `subagent-conductor` bundle row's configuration page in the Plugins panel. After any settings-surface change also run `node scripts/settings-portability-check.mjs` from the workspace root: it executes the real client bundle against the four host shapes and fails when the card misses its `<package>#<row id>` ledger key or stays on a removed seat.

## Change Checklist

- Contract change (precedence, official-layer detection, effort rules): update `docs/design.md`, `README.md`, and the matching guards in all three test files together.
- Manifest or bundle change: run the workspace metadata generator with `--write` and `--check` from the parent workspace.
- Client change: test cleanup structurally, then verify real Slot-rendered UI and behavior on port 3080 after a user restart.
- Version/release: bump `package.json`, commit, tag `vX.Y.Z`, push (GitHub Actions publishes with Trusted Publishing); verify the npm registry before reconciling the profile.
- Install-surface change: `README.md` is the only user-facing install surface, so keep its recommended `dsh plugin --profile web add dsh-subagent-conductor` command and the required DSH Web restart current.

## Pitfalls

- Registering the Settings namespace is async (`ctx.inject(['settings'])`): the request listener must treat "no settings yet" as empty settings, never as an error.
- The Client remote gate requires dotted inject declarations: keep `'remote'`, `'remote.session'`, `'remote.settings'` in `exports.inject`; dropping them fails the loader fiber exactly like other plugins.
- `remote.session.modelCatalog()` resolves `{ ok, value }`; do not wrap it twice or expect `result.ok` from the raw call.
- v0.1 namespace values persist after upgrade: normalization must ignore dropped keys silently (validate throws only on v2 shape violations).
- `conversation.input.right` is a session-scoped list slot: the component receives session standard props (`sessionId`, `useSessions`, …) directly; do not re-add the removed `inject(sessionId)` registration shape.
- A settings card fails silently: an undeclared seat renders nothing and logs nothing, and the rc.2 configure control keys off the exact `<package name>#<row id>` string. Renaming the package or the patch row without updating `ROW_CONFIG_KEY` (guarded in `test/lifecycle-source.test.mjs`) therefore removes the card with no error — confirm the seat before debugging the card's own code.
