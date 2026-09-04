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
- `lib/client.js`: official Client bundle — composer selector (`conversation.input.right`), role/settings card (`settings.plugin.item`), lifecycle-owned styles/listeners.
- `test/config.test.mjs`, `test/compatibility.test.mjs`, `test/lifecycle-source.test.mjs`: v2 guards.
- `README.md`: user-facing EN/ZH semantics incl. migration notes from 0.1.x.

## Invariants

- Routing precedence is fixed: **root-session selection > default role > global default > official tool selection > native inheritance**. Conductor layers win over the official choice when they define a field; empty conductor layers leave the official/inherited request untouched.
- The official layer is read from the child's creation-time `AgentOptions` snapshot (`agent.options.provider/model/reasoningEffort`) — never from prompt text or tool names. No private marker, no fresh/cold-resume special case.
- A single `agent/request` listener is the only Host decision point. It must never wrap `ctx.subagents.start` / `startContinuable`, never register tools, and never touch other plugins' settings namespaces.
- Provider/model changes atomically clear inherited effort; conductor effort applies only after `ctx.llm.resolveModelInfo` confirms the exact model publishes it. Invalid configured routes degrade with a Host warning and keep the official request — stock delegation must never break.
- The composer selector writes one revision-aware path under the resolved non-subagent root session id (`origin`/`parentId` lineage, cycle-safe, fail closed). Client and Host must agree on the root key.
- Role entries are route presets + display metadata only (id/displayName/description/provider/model/reasoningEffort). v0.1 persona/toolFilter/transport/maxDepth/background fields are dropped and must not be reintroduced as runtime claims; the official tool rows own those start-time fields.
- Every listener, Settings registration, Slot, style node, and DOM listener needs a lifecycle-owned disposer. Runtime code must not import DSH/Cordis peer packages from the linked package path; obtain capabilities from injected `ctx` services.

## Validation

From this package directory run:

```powershell
npm test
npm run check
npm pack --dry-run
```

Optional DSH white-box guards (compatibility.test.mjs) need `DSH_CHECKOUT` pointing at the DSH install root (e.g. `C:\Users\CarryWho\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`); they skip when absent.

After bundle or manifest changes, refresh workspace metadata from the parent workspace and reconcile this package into the real Web profile (`dsh plugin --profile web add .`). Verify the existing `http://127.0.0.1:3080`; do not start a replacement server. Client changes need the user to restart the existing `dsh web`, then inspect the real Slot-rendered UI (composer seat left of the main model, Settings → Plugins card) and computed behavior.

## Change Checklist

- Contract change (precedence, official-layer detection, effort rules): update `docs/design.md`, `README.md`, and the matching guards in all three test files together.
- Manifest or bundle change: run the workspace metadata generator with `--write` and `--check` from the parent workspace.
- Client change: test cleanup structurally, then verify real Slot-rendered UI and behavior on port 3080 after a user restart.
- Version/release: bump `package.json`, commit, tag `vX.Y.Z`, push (GitHub Actions publishes with Trusted Publishing); verify the npm registry before reconciling the profile.

## Pitfalls

- Registering the Settings namespace is async (`ctx.inject(['settings'])`): the request listener must treat "no settings yet" as empty settings, never as an error.
- The Client remote gate requires dotted inject declarations: keep `'remote'`, `'remote.session'`, `'remote.settings'` in `exports.inject`; dropping them fails the loader fiber exactly like other plugins.
- `remote.session.modelCatalog()` resolves `{ ok, value }`; do not wrap it twice or expect `result.ok` from the raw call.
- v0.1 namespace values persist after upgrade: normalization must ignore dropped keys silently (validate throws only on v2 shape violations).
- `conversation.input.right` is a session-scoped list slot: the component receives session standard props (`sessionId`, `useSessions`, …) directly; do not re-add the removed `inject(sessionId)` registration shape.
