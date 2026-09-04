# dsh-subagent-conductor

Lifecycle-safe subagent routing for DeepSeek Harness: per-session provider/model/reasoning-effort selection, role templates, main-agent guidance, and a dedicated delegation Tool.

The package uses the official `agent/request` waterfall and does not patch DSH or replace stock `subagent` / `subagent_fork` tools.

## Routing precedence

Provider, model, and reasoning effort are resolved independently at every subagent request boundary in this order:

```text
per-call subagent_direct override
> selected role
> root-session composer selection
> global Settings default
> native DSH inheritance
```

The composer selector is therefore a per-root-session override of the Settings default, while a selected role overrides the composer for every field the role explicitly defines. A per-call `subagent_direct` argument has the highest priority. `defaultRole` applies to fresh stock/direct children, but is deliberately suppressed on continuable cold resume so a lost private marker cannot silently switch an existing child to a different role. The final provider/model pair is validated as one exact route, and reasoning effort is applied only when that exact model publishes the requested entry in `reasoning.efforts`.

The composer selector resolves its Settings key through the official session summary lineage, so root and child views display and mutate the same root-session selection. Its popup labels whether each effective value comes from the default role, root-session selection, global default, or native inheritance; an incomplete/cyclic lineage fails closed instead of writing a child-only key.

The Settings card provides a visual role manager for creating, editing, copying, deleting, and choosing a default role. Role provider/model values are selected as a pair from the main model directory; effort is enabled only for models that publish effort metadata. JSON import/export remains available as an advanced bulk-edit and backup path and validates every role before it enters the renderable draft. Advanced controls expose the direct-tool `maxDepth` and background-run kill switch.

When both `toolFilter.allow` and `toolFilter.deny` are empty, the role contributes no tool filter: the child keeps every tool it would normally see. This does not bypass the selected agent preset, inherited parent filtering, permission policy, or runtime capability checks. A non-empty allow/deny list narrows that existing tool surface; it cannot grant a tool that was otherwise unavailable.

A role applies only to the directly created child. Nested children re-resolve their own marker and the root-session composer selection; they do not automatically inherit an ancestor's role.

## Compatibility note

Per-call and role reasoning effort is carried for a freshly created child and its current live residency. A continuable child that is cold-resumed cannot restore that private marker, so it suppresses `defaultRole` and falls back to the root-session selection, global default, or its recorded inherited route. Persona and toolFilter are different: DSH persists and restores those two start-time fields in the continuable descriptor. This limitation is deliberate and tested; the package does not modify the upstream descriptor format.

## Development

```powershell
npm test
npm run check
npm pack --dry-run
```

See `docs/design.md` and `HANDOFF.md` for the reviewed contract and acceptance gates.

## Acknowledgements

Design research reviewed the MIT-licensed projects [dsh-subagent-model-picker](https://github.com/ringoage/dsh-subagent-model-picker) and [dsh-plugin-subagent-director](https://github.com/SeverusZh/dsh-plugin-subagent-director). This package keeps its own implementation and lifecycle contract.

## License

MIT
