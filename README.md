# dsh-subagent-conductor

## English

**Portable settings transport** — the plugin now resolves its settings scope on both the `settingsScope` (≤ 0.1.5) and `configForms` (≥ 0.1.7-rc.1) hosts, so the composer selector and Settings card keep working across the rename.

Lifecycle-safe subagent routing settings for DeepSeek Harness Web: per-root-session provider/model/reasoning-effort selection in the composer, role templates with a visual editor, and a global default route. It does not patch DSH, does not replace or wrap the stock `subagent` / `subagent_fork` tools, and adds explicit role delegation through `subagent_role` using the official managed activation service.

## 中文

面向 DeepSeek Harness Web 官方子代理工具（`subagent` / `subagent_fork`）的设置与默认路由层：输入框根会话选择、角色模板与全局默认路由。新增 `subagent_role` 显式角色委派：使用角色模型与预置提示词，并接受当前任务和补充要求。复用官方子代理生命周期，不修改或替换官方工具。

## How it works

For ordinary `subagent` and `subagent_fork` calls, the official tools own delegation and Conductor applies its default routing layers. On current hosts, Conductor validates and records the route with `agent.model.select()` during awaited `agent/created` initialization, before model, tools and prompt preparation. The prepared request is never rerouted. Legacy hosts without this API retain their request listener.

设置变更对之后新建或重新加载的子代理生效；已加载子代理继续使用已选路由。不会在请求准备完成后切换模型。优先级保持不变：

```text
root-session composer selection
> default role route
> global Settings default
> official tool selection (explicit tool arguments / tool-instance defaults)
> native DSH inheritance
```

Provider, model, and reasoning effort resolve independently through those layers. The final provider/model pair is validated as one exact route through `llm.resolveModelInfo`; a conductor reasoning effort is applied only when that exact model publishes it in `reasoning.efforts`. When every conductor layer is empty the request is left exactly as the official flow produced it, so pure official/inherit delegation never changes. Invalid configured routes degrade with a Host warning and keep the official/inherited request intact — stock delegation never breaks.

The official layer is read from the child's creation-time `AgentOptions` snapshot (`provider` / `model` / `reasoningEffort`). That snapshot already contains explicit model-facing tool arguments, tool-instance config defaults, or the parent route copied at creation, so the routing decision needs no private marker and has no cold-resume special case: the same deterministic precedence applies to fresh, nested, and cold-resumed children.

### Relationship to the official subagent settings page

DSH ships `@deepseek-ai/dsh-client-ui-settings-subagent` (since 0.1.7-alpha.1, unchanged through 0.2.1-rc.2), which edits the agent loop's **limits**: `maxDepth` (how deep delegation may recurse) and `maxActiveSubagents` (how many children may run at once). That is a different question from this bundle's:

| | official subagent page | this bundle |
|---|---|---|
| question | how much delegation is allowed | which route a child gets |
| scope | one value for the deployment | per root session / role / global |
| fields | `maxDepth`, `maxActiveSubagents` | `provider`, `model`, `reasoningEffort` |
| surface | Settings page | Settings page + composer selector |

Both may be installed together; neither shadows the other. This bundle deliberately declares **no** depth or concurrency fields — duplicating a limit would create two sources of truth for one value.

## Explicit role delegation / 显式角色委派

On current Hosts with managed spawn activations and JSON storage, `list_subagent_roles` lists role ids, purposes and model routes. Supply `role_id` to inspect its preset guidance. `subagent_role` starts a fresh child:

```json
{
  "role_id": "code-reviewer",
  "task": "Review the settings changes and their callers.",
  "additional_instructions": "Report confirmed issues with file locations.",
  "description": "Review settings changes"
}
```

Configure the role's `displayName`, short `description`, full `provider`/`model`, optional supported `reasoningEffort`, and multiline `instructions`. Description is discovery text; instructions are delivered as role guidance alongside the task and optional additional requirements. An omitted `reasoningEffort` means inherit: an unchanged provider/model keeps the current selection's effort, and a route change clears it. Existing roles receive empty instructions; selecting a default role for ordinary delegation only selects its route.

显式调用使用角色的完整模型配置，不再参与根会话/默认角色/全局默认优先级竞争。角色不存在、模型不可用、思考强度不支持或模型不在宿主会话授权范围时明确失败。该入口仍遵循宿主委派限制，要求调用 scope 可用官方 `subagent`，并复用官方 `list_agents`、`send_message` 和中断管理。

A versioned snapshot is saved under the reserved child id before activation, using the Host JSON storage backend. It includes the role guidance and route hash. Concurrent calls have independent bindings. Editing or deleting a role affects future children only; continuation and cold resume retain the bound route. Initial guidance and task are persisted by the official activation inbox. Unloading this plugin removes its tools; keep it enabled when resuming role-bound children. Storage migration and session export must retain the plugin binding unit as well as the Session log. If binding storage cannot load, role tools are withdrawn with a Host warning; ordinary routing remains available, and role-bound recovery is degraded until storage is restored. A failed start may leave a dormant binding deliberately, because partial acceptance can be recoverable.

Role guidance is task context, not an elevated permission or a tool restriction. A request such as “read only” describes the task; enforce actual tool restrictions through the Host/preset when required. No Gate-specific rules are built into the plugin.

## Composer selector

The selector renders on the left of the main model seat (`conversation.input.right`). It picks one provider/model (and optionally a reasoning effort) **per root session**: root and child views resolve the same key through the official session-summary lineage (`origin` / `parentId`) and fail closed instead of writing a child-only key. It labels the effective source of each value (default role / root-session / global default / official-or-native) and writes through the revision-aware official Settings API.

## Settings card

The card registers on both settings seats, because DSH moved it: on ≤ 0.1.5 it is a card under **Settings → Plugins** (`settings.plugin.item`), and on 0.1.7-rc.2 — which removed that slot — it is the configuration page of the `subagent-conductor` bundle row in the **插件** panel (the first sidebar panel icon) (`plugins.row.config`, keyed `<package name>#<row id>`). On 0.1.7-rc.2 the same card is also a first-class page one click deep in 设置 (`settings.section`, id `yotk-subagent-conductor`, order 62), so it stays reachable from the settings list as well as from its bundle row, and on that page and on the row's configuration page it starts expanded instead of collapsed (the Plugins-list card on ≤ 0.1.5 keeps its collapsed default). Both seats manage:

- global default route (provider/model pair plus optional effort),
- the default role (applied only when no root-session selection exists),
- visual role CRUD (id, display name, description, provider/model pair, effort), with JSON import/export as an advanced bulk-edit and backup path.

`@deepseek-ai/schemastery` is a private `dependencies` entry whose floor must be ≥ 3.18.4 (`^3.18.4`): the profile hoists an older line (3.18.2) that satisfies a lower floor, and an entry whose Config exposes no volatile field is dropped from `SettingsForms.describe()` — the card then renders nothing with no error.

Roles are route presets with display metadata. They do not carry persona or tool filters: those are start-time fields owned by the official tool rows, and conductor does not claim a runtime channel for them in v0.2.

## Migration from 0.1.x

v0.1's private `AgentOptions` marker, the `subagent_direct` delegation tool, and the runtime persona/toolFilter/transport/maxDepth/background controls are removed: the official tool rows own delegation, persona/toolFilter config, depth and background policy now. Existing `subagent-conductor` namespace values are normalized on read — dropped v1 keys are ignored and never resurrected. Behavior change is deliberate: routing precedence is now session > default role > global default > official choice (v0.1 put an explicit role marker above the session selection).

**On DSH ≥ 0.1.7 a v0.1 section needs one manual step.** That release removed the settings document: on the first launch the host renames `settings.yaml` to `settings.yaml.imported` and imports each section into its entry's `Config`, one section at a time. Because a v0.1 section still carries keys v0.2 dropped (`subagentProvider`, `backgroundMode`, `maxDepth`, `enableRunInBackground`), and the import refuses any path the entry's `Config` does not declare, the **whole section** is rejected — including `defaultRoute` and every `sessionSelections` entry, so the plugin starts from defaults (the composer selector reads `inherit`). The host only logs a warning; this plugin additionally reports it once per launch, naming the file and the offending keys. To carry the values over, put the part you want to keep on the `subagent-conductor` row of the profile patch:

```yaml
- id: subagent-conductor
  config:
    defaultRoute:
      provider: <provider>
      model: <model>
      reasoningEffort: <effort>
    sessionSelections:
      <session-id>: { provider: <provider>, model: <model> }
```

Only keys this version's `Config` declares are accepted; `subagentProvider`, `backgroundMode`, `maxDepth` and `enableRunInBackground` cannot be represented any more and are ignored by design.

## Install

```powershell
dsh plugin --profile web add dsh-subagent-conductor
```

Restart the existing DSH Web process afterwards: the Host scans the browser plugin roster at startup, so the composer selector and the Settings card appear only after that restart. Then open the Subagent Conductor settings — on ≤ 0.1.5 **Settings → Plugins → Subagent Conductor**, on 0.1.7-rc.2 the `subagent-conductor` row's configuration page in the **插件** panel (the first sidebar panel icon) — to manage the global default route and the default role.

Local development, from this package directory:

```powershell
dsh plugin --profile web add .
```

Either form records the package in the profile's `dsh.profile.bundles`, which is what mounts the Host routing listeners and serves the client bundle.

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
