# dsh-subagent-conductor Design

## Decision Summary

The package is one Host-plane Cordis bundle with a Web client. It does not patch DSH, replace stock delegation tools, wrap `ctx.subagents.start`, or modify an agent preset.

One root `agent/request` waterfall listener is the final request-routing point. Its precedence is:

```text
per-call marker > selected role > root-session selection > global default > inherit
```

Provider, model, and effort resolve independently, but the final provider/model pair is validated as one exact route before an effort is accepted. Switching provider or model always removes inherited effort first. `defaultRole` participates for fresh stock/direct children; an explicit role marker overrides it. A continuable cold resume has neither fresh depth nor marker, so it deliberately suppresses `defaultRole` and resolves session > global default > inherited/base instead.

## Child Detection and Nested Lineage

A live agent is a subagent when either `options.subagentDepth >= 1` or `session.header.origin === "subagent"`. The second condition is required for continuable cold resume.

Every child walks `session.header.parentSession` through the live Agent registry to the first non-subagent root. The walk detects cycles. A missing live ancestor degrades to global default or inherit; it never breaks a stock delegation.

A role marker belongs only to the directly created child. Grandchildren do not inherit it. Stock nested delegation re-resolves the root session selection; a nested call to the conductor Tool creates a new marker.

## Fresh/Resident Carrier

DSH has no custom `SubagentStartRequest` metadata and its continuable descriptor rejects unknown fields. The conductor therefore uses one namespaced private field in `request.agentOptions` for the directly created child. `resolveChildAgentOptions()` spreads requested options before Agent creation, so the marker exists before the first request and throughout that live residency.

This is a compatibility layer, not a public DSH field. Code reads only its owned scalar leaves, never serializes `agent.options`, and strips the marker by constructing a clean LLM config result.

## Continuable Cold Resume

The continuable descriptor persists provider, model, persona, and toolFilter, but not the private marker or per-call effort. On cold resume the listener therefore resolves:

```text
root-session selection > global default > request-header/inherit
```

The UI and README disclose that per-call/role effort is fresh/resident-only. The package does not patch the descriptor version or persist private request-config keys.

## Settings and Client Boundary

Global defaults, roles, and advanced options use the official `subagent-conductor` Settings namespace. DSH exposes registered namespaces through its official settings describe/mutate/replace APIs.

The session selector binds the same official Settings scope and applies one revision-aware path mutation under the resolved non-subagent root session id. The Client obtains the official `useSessions` snapshot from the session-scoped Slot and walks `SessionSummary.origin/parentId` with cycle and missing-chain fail-soft behavior; it never writes a child-only dead key. The Settings card does not render the internal map. No Typert Remote or HTTP bridge is published, which avoids an unnecessary Host Service and keeps linked-package runtime imports free of duplicate Cordis copies.

## Lifecycle

Every Host and Client contribution belongs to the mounting Fiber. Style insertion uses an explicit effect disposer because Client module invalidation does not remove arbitrary style nodes. User settings data may remain dormant after uninstall; no marker files, preset copies, or foreign namespace values are created.
