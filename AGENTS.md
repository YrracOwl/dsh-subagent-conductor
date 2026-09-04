# dsh-subagent-conductor Agent Guide

## Scope and Purpose

- This package is an independently published Host+Web Cordis bundle for subagent routing, role templates, and per-session controls.
- It mounts once in the Host composition. Never copy its row into an agent preset: settings and Tool registrations are single-instance Host capabilities.

## Key Files

- `HANDOFF.md`: reviewed product scope, rc.8 contract evidence, and phased acceptance gates.
- `docs/design.md`: implemented routing and carrier contract; update it when those semantics change.
- `lib/config.js`: pure normalization, routing, effort, nested-lineage, and marker helpers.
- `lib/index.js`: Host settings, `agent/request`, guidance, and delegation Tool wiring.
- `lib/client.js`: official Client bundle, root-session selector, visual role editor, Settings card, and lifecycle-owned styles/listeners.
- `test/config.test.mjs`: guards routing precedence, fresh/default-role policy, cold-resume suppression, and effort application.
- `test/compatibility.test.mjs`: guards the private rc.8 AgentOptions carrier, descriptor closure, and cold-resume degradation.
- `test/lifecycle-source.test.mjs`: structural guards for one-listener ownership, Client cleanup, root-session Settings keys, role import validation, and UI contracts.

## Invariants

- A single `agent/request` listener is the final provider/model/effort decision point. Never wrap or replace `ctx.subagents.start` or `startContinuable`.
- Do not patch DSH, disable stock subagent tools, copy presets, or write another plugin's settings namespace.
- The private AgentOptions marker is fresh/resident-only and must not leak into returned LLM config. `defaultRole` applies to fresh stock/direct children, but a marker-less continuable cold resume suppresses it and falls back to root-session/default/inherit.
- Resolve nested children to their non-subagent root. Host walks live `parentSession`; Client walks official `useSessions().byId` summaries via `origin/parentId`. Client display, set, and unset must use the same root key; an incomplete or cyclic lineage fails closed and never writes a child-only key.
- A role marker applies only to the child it created and is not inherited by grandchildren. Persona/toolFilter are start-time fields and may persist through the upstream descriptor; per-call/role effort does not persist through cold resume.
- Provider/model changes atomically remove inherited effort; only a validated effort for the final exact route may be restored. Do not reintroduce the removed `fallbackOnInvalid` setting: direct Tool routes are strict, while the stock request listener preserves upstream base config on invalid settings.
- Every listener, watcher, Tool, prompt section, Slot, locale registration, style node, and DOM listener needs a lifecycle-owned disposer.
- Runtime code must not import DSH/Cordis peer packages from the linked package path; obtain those capabilities from injected `ctx` services to avoid duplicate Cordis symbol realms.

## Validation

From this package directory run:

```powershell
npm test
npm run check
npm pack --dry-run
```

After bundle or manifest changes, refresh workspace metadata from the parent workspace and reconcile this package into the real Web profile. Verify the existing `http://127.0.0.1:3080`; do not start a replacement server. A link install does not reload the running Host when no Client watcher exists: let the user restart the existing `dsh web`, then inspect real DOM/computed styles.

For a release-level lifecycle check, use a reversible Web-profile unplug/restore: remove the package, restart, confirm Tool/prompt/Slots/style/DOM contributions disappear while its Settings namespace remains dormant, re-add the link, restart, and confirm all contributions recover. Always restore the profile before finishing.

## Change Checklist

- Carrier or DSH contract change: update `docs/design.md`, `HANDOFF.md`, and `test/compatibility.test.mjs` together.
- Manifest or bundle change: run the workspace metadata generator with `--write` and `--check`.
- Client change: test cleanup structurally, then verify the real Slot-rendered UI and computed behavior on port 3080.
