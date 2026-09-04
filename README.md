# dsh-subagent-conductor

## English

**Current release: 0.2.0** — A settings and default-route layer over the OFFICIAL DeepSeek Harness subagent tools. DSH 0.1.2+ fine-grained Remotes are used on the Client; no legacy connection fallback remains.

Lifecycle-safe subagent routing settings for DeepSeek Harness Web: per-root-session provider/model/reasoning-effort selection in the composer, role templates with a visual editor, and a global default route. It does not patch DSH, does not replace or wrap the stock `subagent` / `subagent_fork` tools, and does not register its own delegation tool.

## 中文

面向 DeepSeek Harness Web 官方子代理工具（`subagent` / `subagent_fork`）的设置与默认路由层：输入框根会话选择、角色模板与全局默认路由。不修改 DSH、不替换官方工具、不注册自有委派工具、不使用私有 marker。

## How it works

Delegation and explicit model selection belong to the official tools. Conductor only provides layers that run **before** the official choice at every subagent request boundary:

```text
root-session composer selection
> default role route
> global Settings default
> official tool selection (explicit tool arguments / tool-instance defaults)
> native DSH inheritance
```

Provider, model, and reasoning effort resolve independently through those layers. The final provider/model pair is validated as one exact route through `llm.resolveModelInfo`; a conductor reasoning effort is applied only when that exact model publishes it in `reasoning.efforts`. When every conductor layer is empty the request is left exactly as the official flow produced it, so pure official/inherit delegation never changes. Invalid configured routes degrade with a Host warning and keep the official/inherited request intact — stock delegation never breaks.

The official layer is read from the child's creation-time `AgentOptions` snapshot (`provider` / `model` / `reasoningEffort`). That snapshot already contains explicit model-facing tool arguments, tool-instance config defaults, or the parent route copied at creation, so the listener needs no private marker and has no cold-resume special case: the same deterministic precedence applies to fresh, nested, and cold-resumed children.

## Composer selector

The selector renders on the left of the main model seat (`conversation.input.right`). It picks one provider/model (and optionally a reasoning effort) **per root session**: root and child views resolve the same key through the official session-summary lineage (`origin` / `parentId`) and fail closed instead of writing a child-only key. It labels the effective source of each value (default role / root-session / global default / official-or-native) and writes through the revision-aware official Settings API.

## Settings card

Settings → Plugins → Subagent Conductor manages:

- global default route (provider/model pair plus optional effort),
- the default role (applied only when no root-session selection exists),
- visual role CRUD (id, display name, description, provider/model pair, effort), with JSON import/export as an advanced bulk-edit and backup path.

Roles are route presets with display metadata. They do not carry persona or tool filters: those are start-time fields owned by the official tool rows, and conductor does not claim a runtime channel for them in v0.2.

## Migration from 0.1.x

v0.1's private `AgentOptions` marker, the `subagent_direct` delegation tool, and the runtime persona/toolFilter/transport/maxDepth/background controls are removed: the official tool rows own delegation, persona/toolFilter config, depth and background policy now. Existing `subagent-conductor` namespace values are normalized on read — dropped v1 keys are ignored and never resurrected. Behavior change is deliberate: routing precedence is now session > default role > global default > official choice (v0.1 put an explicit role marker above the session selection).

## Development

From this directory run:

```powershell
npm test
npm run check
npm pack --dry-run
```

See `docs/design.md` for the v0.2 contract. `HANDOFF.md` records the superseded v0.1 review and is kept for history.

## Acknowledgements

Design research reviewed the MIT-licensed projects [dsh-subagent-model-picker](https://github.com/ringoage/dsh-subagent-model-picker) and [dsh-plugin-subagent-director](https://github.com/SeverusZh/dsh-plugin-subagent-director). This package keeps its own settings/lifecycle contract and does not copy their delegation implementation.

## License

MIT
