# dsh-subagent-conductor — v0.2 Design

## Decision Summary

v0.2 provides ordinary default routing plus explicit role delegation. `list_subagent_roles` discovers roles; `subagent_role` starts an official managed spawn activation with a frozen role route and guidance. It does not patch DSH, write private `AgentOptions` markers, wrap stock methods, or replace the official delegation tools.

On hosts with `agent.model.select`, an awaited `agent/created` listener validates and durably selects the route before step preparation. The request listener is inert for these agents. On legacy hosts without that API, the root `agent/request` waterfall retains the old implementation. This supersedes the older single-request-listener instruction in the package guide.

For ordinary children without an explicit role binding, both paths apply the conductor layers first:

```text
root-session selection > default role > global default > official choice > native inheritance
```

Provider, model, and effort resolve independently through the first three layers. The final provider/model pair is validated as one exact route via `ctx.llm.resolveModelInfo`; a conductor reasoning effort is applied only when that exact model publishes it in `reasoning.efforts`. Invalid configured routes degrade with a Host warning and leave the official/inherited request intact. When every conductor layer is empty nothing is decided: the creation-time path records no selection, and the legacy listener returns `next()`'s config untouched.

## Explicit roles

A role adds optional `instructions` to its display metadata and route. `description` remains discovery text. Default-role routing does not inject instructions. Explicit invocation requires a complete provider/model pair and validates its exact effort and the Session's first recorded model-selection policy before activation. It also requires the official spawn provider and ordinary delegation availability in the calling scope. An omitted role effort means inherit, resolved exactly like a configured ordinary route: an unchanged provider/model keeps the current selection's effort and a route change clears it.

Before `startActivation`, reserve a UUID and durably store the role snapshot keyed by that child id in the JSON storage unit `subagent_conductor_roles`. Awaited child initialization reads that binding before ordinary routing. The initial official inbox message carries role guidance, revision, task, and additional requirements. Each activation is independent, and the official service owns depth, concurrency, cancellation and message delivery. No per-call route override exists.

The binding unit is authoritative plugin state, not a Session projection. Keep it when moving or backing up role sessions. Role edits/deletion affect new children only. Recovery tests reload bindings using a fresh plugin instance. Existing children retain the recorded snapshot when the unit is available; missing/corrupt storage is a degraded condition: tools are withdrawn, a Host warning is emitted, and ordinary routing continues. Importing a Session alone cannot reconstruct the binding. Failed starts retain their binding because partial acceptance may have occurred. Uninstall leaves data dormant.

Initialization failures unwind partial tool registration and close the storage unit. Disposal removes tools and drains pending writes before closing. Older hosts without the required services retain ordinary routing but do not expose role tools.

## Official Choice Detection

The official layer is the child's creation-time `AgentOptions` snapshot (`provider`, `model`, `reasoningEffort`). DSH's `resolveChildAgentOptions()` merges the requested route (explicit model-facing tool arguments or tool-instance `agentOptions` defaults) over the parent's route at creation, so at child initialization — and at the first `agent/request` on legacy hosts — the options already carry the effective official route. The routing decision therefore needs no marker and has no cold-resume special case: fresh, nested, and cold-resumed children all follow the same deterministic precedence.

Rationale for the ordering: the user's explicit product decision is that conductor-configured policy governs; official tool model-facing selection is a lower layer, applied only when conductor layers are silent. This supersedes the v0.1 rule where an explicit role marker outranked the composer selection.

## Child Detection and Root Lineage

A live agent is a subagent when either `options.subagentDepth >= 1` or `session.header.origin === "subagent"` (the latter covers continuable cold resume). Every child walks `session.header.parentSession` through the live Agent registry to the first non-subagent root; the walk detects cycles. A missing root degrades to conductor global layers (or official behavior), never breaking a stock delegation.

## Effort Atomicity

Changing the effective route removes any inherited reasoning effort first (`applyResolvedRoute`). An effort is re-added only when the conductor requested one and the exact model publishes it. A same-route effort-only replacement keeps the route and swaps the effort after the same validation. Invalid effort on an unchanged route keeps the official request and logs a warning.

## Settings and Client Boundary

Global defaults, roles, and per-root-session selections live in the official `subagent-conductor` Settings namespace, registered with the revision-aware Host settings API and validated by a pure normalize/validate layer. v0.1 keys (`subagentProvider`, `maxDepth`, `enableRunInBackground`, `backgroundMode`, role `persona`/`toolFilter`) are dropped: the official tool rows own transport, persona/tool-filter config, depth, and background policy. Old values are ignored on read and never resurrected.

The composer selector binds the same Settings scope and applies one revision-aware path mutation under the resolved non-subagent root session id. It obtains the official `useSessions` snapshot from the session-scoped `conversation.input.right` slot and walks `SessionSummary.origin/parentId` with cycle and missing-chain fail-soft behavior; it never writes a child-only dead key. Model discovery uses the official `remote.session.modelCatalog()` client API. The Settings card does not render the internal map. No Typert Remote or HTTP bridge is published.

## Lifecycle

Every Host and Client contribution belongs to the mounting Fiber: the initialization listener, guarded legacy request listener, Settings namespace registration, and Client registrations. No per-agent listeners or timers are introduced. User settings data may remain dormant after uninstall; no marker files, preset copies, or foreign namespace values are created.

## Initialization and settings changes

Current hosts read a detached configuration decision at creation/resume initialization. `resolveModelInfo` is awaited before `model.select`, and cancellation prevents selection. A configured complete route can initialize an agent with no current route. Loader Config is readable before optional Settings presentation injection; that injection must not determine routing readiness. Changes made during model validation apply to subsequent initialization, not the in-flight decision.

Settings edits apply to subsequently created or reloaded children; already loaded children keep their selected route. In particular, no callback rewrites the model after tools and prompts have been prepared. This differs from legacy per-request routing and is an explicit compatibility boundary. Unloading the plugin does not erase already recorded model selections.
