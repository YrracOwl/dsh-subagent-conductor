# dsh-subagent-conductor — v0.2 Design

## Decision Summary

v0.2 is a **settings and default-route layer over the official subagent tools**. It does not patch DSH, does not register a delegation tool, does not read or write a private `AgentOptions` marker, and never wraps `ctx.subagents.start` / `startContinuable`.

One root `agent/request` waterfall listener applies the conductor layers first:

```text
root-session selection > default role > global default > official choice > native inheritance
```

Provider, model, and effort resolve independently through the first three layers. The final provider/model pair is validated as one exact route via `ctx.llm.resolveModelInfo`; a conductor reasoning effort is applied only when that exact model publishes it in `reasoning.efforts`. Invalid configured routes degrade with a Host warning and leave the official/inherited request intact. When every conductor layer is empty the listener returns `next()`'s config untouched.

## Official Choice Detection

The official layer is the child's creation-time `AgentOptions` snapshot (`provider`, `model`, `reasoningEffort`). DSH's `resolveChildAgentOptions()` merges the requested route (explicit model-facing tool arguments or tool-instance `agentOptions` defaults) over the parent's route at creation, so by the first `agent/request` the options already carry the effective official route. The listener therefore needs no marker and has no cold-resume special case: fresh, nested, and cold-resumed children all follow the same deterministic precedence.

Rationale for the ordering: the user's explicit product decision is that conductor-configured policy governs; official tool model-facing selection is a lower layer, applied only when conductor layers are silent. This supersedes the v0.1 rule where an explicit role marker outranked the composer selection.

## Child Detection and Root Lineage

A live agent is a subagent when either `options.subagentDepth >= 1` or `session.header.origin === "subagent"` (the latter covers continuable cold resume). Every child walks `session.header.parentSession` through the live Agent registry to the first non-subagent root; the walk detects cycles. A missing root degrades to conductor global layers (or official behavior), never breaking a stock delegation.

## Effort Atomicity

Changing the effective route removes any inherited reasoning effort first (`applyResolvedRoute`). An effort is re-added only when the conductor requested one and the exact model publishes it. A same-route effort-only replacement keeps the route and swaps the effort after the same validation. Invalid effort on an unchanged route keeps the official request and logs a warning.

## Settings and Client Boundary

Global defaults, roles, and per-root-session selections live in the official `subagent-conductor` Settings namespace, registered with the revision-aware Host settings API and validated by a pure normalize/validate layer. v0.1 keys (`subagentProvider`, `maxDepth`, `enableRunInBackground`, `backgroundMode`, role `persona`/`toolFilter`) are dropped: the official tool rows own transport, persona/tool-filter config, depth, and background policy. Old values are ignored on read and never resurrected.

The composer selector binds the same Settings scope and applies one revision-aware path mutation under the resolved non-subagent root session id. It obtains the official `useSessions` snapshot from the session-scoped `conversation.input.right` slot and walks `SessionSummary.origin/parentId` with cycle and missing-chain fail-soft behavior; it never writes a child-only dead key. Model discovery uses the official `remote.session.modelCatalog()` client API. The Settings card does not render the internal map. No Typert Remote or HTTP bridge is published.

## Lifecycle

Every Host and Client contribution belongs to the mounting Fiber: the single `agent/request` listener, the Settings namespace registration, and the Client slot registrations and style node all have explicit disposers. User settings data may remain dormant after uninstall; no marker files, preset copies, or foreign namespace values are created.
