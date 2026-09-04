# dsh-subagent-conductor 完整交接计划

> ## 状态：已被 v0.2 取代（历史档案）
> 本文件记录 0.1.x（自有 `subagent_direct` 工具 + 私有 AgentOptions marker + rc.8 契约束）的交接与验收计划，仅作历史保留。
> v0.2 已实现并发布：面向官方 subagent 工具的**设置与默认路由层**（契约见 `docs/design.md`、`README.md`、`AGENTS.md`）。0.1.x 语义（调用期角色、marker、冷恢复降级、persona/toolFilter 运行时注入、传输/深度/后台设置）不再成立，请勿按本文件实现。

## 0. 交接状态

- 目标目录：`D:\Resources\DSH_PRJ\DevPlugins\dsh-subagent-conductor`
- 当前状态：**Host/Client、bundle patch、可视化角色管理、测试和 Web profile 集成均已实现；正在完成根会话 selector、默认角色冷恢复语义、行为测试与真实 3080/热拔插终验。**
- 当前会话已创建 active goal，目标是完成设计、contract probe、实现、测试、安装和真实 Web 验证。
- 旧调研子代理及其完整嵌套 descendants 树均已停止；不要等待或复用旧结果。
- 当前工作目录已确认：`D:\Resources\DSH_PRJ\DevPlugins`
- DSH 实现 checkout：`C:\Users\CarryWho\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`
- 已核对 DSH 版本：`0.1.0-rc.8`。
- 权威 Web GUI：`http://127.0.0.1:3080`
- 不要启动替代 Web 服务器；客户端改动只有在同一 DSH checkout 正运行 `pnpm run dev:web` 时才会 HMR 自动重建，否则必须按 DSH 规则重建/重启现有 Host，并刷新 3080 页面。
- 本插件必须作为 **Host composition 的单实例 bundle row** 安装，不得放进 agent preset；重复实例会导致 settings namespace 或 Tool 冲突。

## 1. 用户已确认的产品决策

### 1.1 包名

`dsh-subagent-conductor`

### 1.2 v1 范围

用户选择了“全量对齐”，必须包括：

1. 会话级子代理 provider/model/reasoning effort 选择器。
2. 对 stock `subagent` / `subagent_fork` 以及其他进程内子代理路径生效的默认子代理路由。
3. 角色模板：角色 id、显示名、描述、persona、provider、model、reasoning effort、可选 tool filter。
4. 主代理的角色/分工 guidance。
5. 自有委派工具，支持按角色和按调用覆盖 provider/model/reasoning effort。
6. Web 设置区，管理全局默认路由和角色模板。
7. 自有 Settings 命名空间；会话选择和设置卡均通过官方 revision-aware Settings API 读写，不发布 Remote/HTTP bridge。
8. 生命周期完整：监听器、Slot、Remote、工具、提示段、样式均可销毁；卸载不得留下额外 marker 文件、复制 preset 或修改其他插件的命名空间。

### 1.3 核心机制

用户明确选择：**全部走请求期官方 `agent/request` waterfall，不包装 `ctx.subagents.start` / `startContinuable`，不替换/补丁上游 DSH 包。**

必须坚持的非妥协设计：

- 不修改 DSH checkout 内任何源文件或 node_modules 包。
- 不安装 patched fork。
- 不通过 `Symbol.for("cordis.original")` 获取裸服务对象。
- 不禁用 stock `tool-subagent` / `tool-subagent-fork` rows。
- 不复制或改写 agent preset。
- 不往 `llm-pi-ai` 等其他插件命名空间塞私有字段。
- 单一权威决策点：所有子代理 provider/model/effort 的最终覆盖必须由一个纯函数 + 一个 `agent/request` listener 完成。

## 2. 已完成的事实取证

### 2.1 DSH 原生为什么没有 SubagentStartRequest effort

DSH 官方 `AgentOptions` 只有：

```ts
interface AgentOptions {
  provider?: string
  model?: string
  maxTokens?: number
}
```

证据：

- `C:\Users\CarryWho\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-agent\lib\types\runtime-types.d.ts`

官方 `resolveChildAgentOptions()` 只继承 provider/model/maxTokens，并添加 `subagentDepth`：

- `...\@deepseek-ai\dsh-subagent\lib\types\child-agent.js`
- `...\@deepseek-ai\dsh-subagent\lib\index.js`

因此 effort 不能通过 stock `SubagentStartRequest.agentOptions` 原生携带。

### 2.2 `agent/request` 是官方可用的请求期 seam

DSH 自己在 model selection 中通过：

```js
agentCtx.on('agent/request', async (_payload, next) => {
  const resolved = await next()
  // 原子替换 provider/model/reasoningEffort
})
```

证据：

- `...\@deepseek-ai\dsh-agent\lib\types\model-selection.js`
- `...\@deepseek-ai\dsh-agent\lib\index.js`

官方实现会在模型选择改变时先移除旧的 `reasoningEffort`，再从新选择记录中添加 effort。这说明 effort 与 provider/model 选择绑定，插件也必须进行原子替换，避免把旧模型的 effort 带到新模型导致 `UNSUPPORTED_REASONING_EFFORT`。

### 2.3 两个参考插件的核心事实

#### dsh-subagent-model-picker

本地克隆：

`C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-model-picker`

可借鉴：

- Host 用单个 `agent/request` listener 识别 `agent.options.subagentDepth >= 1`。
- 每会话 selection 放在自己的 settings namespace。
- Typert Remote 提供 `get/set/clear`。
- Client Slot：`conversation.input.right`，位于主模型 seat 左侧。
- Client inject：`slots`, `connection`, `remote`, `locale`。
- 模型目录：`connection.api.llm.models({})`，读取 `result.value.groups`。
- Remote client 通过 `$mount(CONTRIBUTION)` 后获取 `remote.<namespace>`。
- selection 必须包含 provider/model；reasoningEffort 可选。
- 切换模型但未选择 effort 时要删除旧 effort。

需要修正的原版问题：

- 原版模块级全局 `scope` 不利于多 fiber/重载；新实现必须把状态限定在 apply 生命周期内。
- 只依赖 `subagentDepth` 较脆弱；新实现必须使用双判定：fresh child 使用 `subagentDepth >= 1`，continuable cold resume 可能缺少该字段，必须用 `session.header.origin === 'subagent'` 识别；后者不是可选优化。

#### dsh-plugin-subagent-director

本地克隆：

`C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-director`

可借鉴：

- 路由优先级：call > role > default > inherit。
- 字段独立解析：provider/model/effort 各自取最高优先级。
- role persona/toolFilter 仅来自角色层。
- 角色 guidance 的 prompt order 约为 117。
- 工具跟随 transport provider 的 added/removed 生命周期注册与卸载。
- 工具执行使用 `ctx.subagents.start` / `startContinuable`，而不是自己重实现 driver。

不能照搬：

- `default-route.ts` 包装 `ctx.subagents.start/startContinuable`；本项目禁止。
- 原版 effort 只能 advisory/logged，未真正进入请求；本项目必须在 `agent/request` seam 真正注入。
- 原版 Web settings 依赖单独 bridge row；本项目优先采用一个 bundle row + 官方 Remote/Slots，避免额外 bridge 条目。

### 2.4 明确淘汰的参考实现

- `dsh-routed-subagent`：要求 patched `@deepseek-ai/dsh-subagent` fork，直接违反不修改上游。
- `dsh-subagent-tools`：安装脚本复制 preset、改 settings.yaml 默认 preset，卸载有残留。
- `dsh-thinking-effort`：向 `llm-pi-ai` 命名空间写私有字段并留下 marker 文件。
- `dsh-plugin-subagent-manager`：不是标准 bundle，路由硬编码。

## 3. 推荐总体架构

### 3.1 单包、单 bundle row

计划 package 结构：

```text
dsh-subagent-conductor/
├─ AGENTS.md                  # 稳定包级约束，创建前先加载 agents-md-maintainer skill
├─ HANDOFF.md                 # 本文件
├─ LICENSE                    # MIT；若复制/改写参考代码必须保留相关版权声明
├─ README.md
├─ package.json
├─ cordis.patch.yml
├─ lib/
│  ├─ index.js                # Host composition entry
│  ├─ config.js               # schema、normalize、validate、纯路由解析
│  └─ client.js               # __ModuleLoader__ Web bundle；官方 Settings scope + session summaries
└─ test/
   ├─ config.test.mjs
   ├─ routing.test.mjs
   ├─ effort.test.mjs
   ├─ lifecycle.test.mjs
   ├─ compatibility.test.mjs
   └─ client-source.test.mjs
```

`cordis.patch.yml` 只插入自身：

```yaml
- insert:
    - id: subagent-conductor
      name: 'dsh-subagent-conductor'
```

不得 disable、replace 或 patch 任何 stock row。

### 3.2 自有 settings namespace

命名空间：`subagent-conductor`

推荐 schema：

```js
{
  defaultRoute: {
    provider?: string,
    model?: string,
    reasoningEffort?: string,
  },
  defaultRole?: string,
  subagentProvider?: string,        // 默认 spawn
  maxDepth?: number,                // 默认 3
  enableRunInBackground?: boolean,  // 默认 true
  backgroundMode?: 'one-shot' | 'continuable',
  roles: {
    [roleId]: {
      displayName: string,
      description: string,
      persona?: string,
      provider?: string,
      model?: string,
      reasoningEffort?: string,
      toolFilter?: {
        allow?: string[],
        deny?: string[],
      },
    }
  },
  sessionSelections: {
    [rootSessionId]: {
      provider: string,
      model: string,
      reasoningEffort?: string,
    }
  }
}
```

注意：

- `sessionSelections` 与用户编辑的默认/角色配置同命名空间，但客户端设置卡不应直接渲染内部 map。
- 所有写入必须通过官方 revision-aware Settings mutate API，并由 Host Settings Schema/validate 权威校验。
- 不使用模块级全局 scope；scope 绑定 apply 生命周期。
- settings watch 必须通过 `ctx.effect(() => scope.watch(...))` 管理。
- 建议 `applies: 'live'`，下一次请求边界即时生效。

### 3.3 唯一路由优先级

建议纯函数：

```text
per-call conductor marker
  > selected role
  > per-session selection
  > global default route
  > inherit resolved config unchanged
```

需要明确两类行为：

1. **stock subagent / subagent_fork**：没有 conductor marker，使用 per-session selection；无 selection 则使用 global default；都没有则 inherit。
2. **自有委派工具**：call/role route 必须优先于 per-session selection，否则 picker 会覆盖角色模型。effort 同样按 call > role > session > default 解析。

每个字段可独立取值，但最终应用时必须形成原子 route：

- provider/model 任一变化时，先删除 resolved config 的旧 `reasoningEffort`。
- 只有新 route 明确提供并验证 effort 后才重新写入。
- 未切换 provider/model、只设置 effort 时可保留原 config 路由。
- 字段可独立解析，但最终 `{provider, model}` 必须作为精确组合通过 `llm.resolveModelInfo()` 或等价契约验证；不能只验证 provider 是否存在。
- 显式 per-call/role route 无效时自有工具报错；普通 request listener 遇到无效配置时记录 warning 并保持上游 base config，stock 子代理不得因陈旧配置中断。
- `llm.resolveModelInfo(provider, model, signal)` 在 provider 未注册或 metadata 无效时会 throw；必须捕获并按调用路径的降级规则处理。
- listener 返回的 LLM config 只包含 DSH LLM call config 字段，不得携带私有 conductor marker。

### 3.4 子代理识别

推荐函数：

```js
function isSubagent(agent) {
  const depth = agent?.options?.subagentDepth
  if (Number.isInteger(depth) && depth >= 1) return true
  return agent?.session?.header?.origin === 'subagent'
}
```

不要只靠 prompt 文本或工具名称判断。

嵌套子代理正式语义：

- 任意深度 child 都沿 parentSession chain 解析到同一 root session selection。
- 自有工具的 call/role marker 只属于本次创建的 child，不默认传播给孙级子代理。
- child 再调用 stock `subagent` / `subagent_fork` 时，孙级使用 root session selection > global default > inherit。
- child 再调用自有工具时，由新的 call/role marker 决定优先级。
- 测试至少覆盖 depth 1、2、3，以及 cold-resumed child 再委派的路径。

### 3.5 root session 解析

沿用 picker 的 parent chain，但增强：

- 从当前 agent 开始。
- `session.header.parentSession` 向上查 `ctx.get('agents').get(parentId)`。
- Set 防循环。
- 遇到 `header.origin !== 'subagent'` 返回该 id。
- live registry 缺失时：当前 Web Remote 请求可回退传入 sessionId；请求期 listener 若无法解析 root，不应报错，应优雅使用 global default 或 inherit。

### 3.6 effort 合法性

必须有一个纯函数负责：

```js
normalizeReasoningEffort(modelInfo, requestedEffort)
```

规则：

1. requestedEffort 为空：不注入。
2. 目标 model info 提供 reasoning levels：只允许已声明 level id；若传的是 wire value，可安全反查时映射为 level id。
3. model info 无 reasoning metadata：默认不猜，不注入 effort，并记录一次低噪声 warning/debug。
4. 自有工具对显式 route 使用严格校验并报明确错误；普通 stock request listener 遇到陈旧/无效 effort 时不注入并保持上游 base config。
5. stock 子代理请求不能因用户设置里的陈旧 effort 使整条请求失败；应优雅降级。

模型目录/元数据 API 需要在实现前再确认：

- Client 已确认：`connection.api.llm.models({})` 返回 groups，model 节点包含 reasoning metadata。
- Host 可先检查 `ctx.llm.resolveModelInfo(provider, model)` 的返回结构；不要假设字段名，必须读当前 checkout 的 d.ts/实现后再定。

## 4. 自有委派工具设计

建议工具名：`subagent_direct`（可通过 composition config 覆盖）。不要占用 stock `subagent` 名称。

参数：

```text
description        必填，3-5 词展示名
prompt             必填，自包含任务
role               可选，role id（允许 displayName 兼容映射，但 warning）
provider           可选，按调用 LLM provider
model              可选，按调用模型
reasoning_effort   可选，按调用 effort
run_in_background  可选
```

角色提供 persona/toolFilter 时，启动前检查 transport provider capabilities。

执行路线：

- 继续使用官方 `ctx.subagents.start` / `startContinuable`。
- 不自己重实现 in-process driver。
- 前台 run 必须先 settle result，再 dispose，避免 dispose 把结果变成 aborted。
- one-shot background 走 jobs service；continuable 走 `startContinuable`。
- provider added/removed 时动态挂载/卸载工具，保留 disposer。

### 4.1 rc.8 carrier 结论：fresh/resident 可携带，cold resume 必须显式降级

该问题已在 DSH `0.1.0-rc.8` 上完成取证。约束仍然是：

- `AgentOptions` 官方字段没有 effort。
- `SubagentStartRequest` 没有 custom metadata。
- 禁止包装 start。
- 禁止重实现 driver。
- 禁止修改 descriptor 版本或 patch 上游。

已确认事实：

1. **官方 descriptor/custom session metadata 不可用。** Continuable descriptor 是封闭、版本化 schema，只接受 `version/mode/provider/label/agentProvider/agentModel/persona/toolFilter`；未知字段由 `assertKnownKeys` 拒绝。证据：
   - `@deepseek-ai/dsh-subagent/lib/types/descriptor.d.ts:63-76`
   - `@deepseek-ai/dsh-subagent/lib/index.js:336-352`
2. **fresh/resident child 的首选 carrier 是命名空间化私有 `request.agentOptions` 字段。** `resolveChildAgentOptions()` 会 spread requested 字段，child 创建时 marker 已进入 live `agent.options`，早于首次请求，因此没有“start 返回后再绑定”的首请求竞态。证据：
   - `@deepseek-ai/dsh-subagent/lib/types/child-agent.js:51-61`
3. 该 marker 属于**非公开兼容层**，只能读取自己的最小字段，禁止序列化整个 `agent.options`，并必须由兼容性测试守卫。listener 返回的 LLM config 不得泄漏该 marker。
4. **continuable cold resume 不会恢复私有 marker。** 冷恢复只从 descriptor 重建 provider/model/persona/toolFilter。证据：
   - `@deepseek-ai/dsh-subagent/lib/types/continuation.js:619-653`
5. 因此 v1 正式语义为：
   - fresh child 与当前 residency：支持 per-call/role provider/model/effort；
   - continuable cold resume：per-call/role marker 丢失，回退到 per-session selection > global default > 已记录 route/inherit；
   - UI/README 必须明确该限制，不得假装冷恢复仍保持 per-call effort。
6. 不采用进程内 child-id Map：既存在首请求竞态，也无法跨进程或冷恢复。
7. 暂不采用 request-config 私有 marker 持久化方案：它依赖上游保留未知 config 字段，会写入持久日志。若未来启用，必须作为单独的显式兼容模式并增加 request-header 兼容测试。

进入大规模 UI 实现前，必须先用 contract probe 验证 fresh 首请求、当前 residency、嵌套子代理和 cold-resume 降级行为。

## 5. Web Client 设计

### 5.1 Client bundle 契约

使用：

```js
window.__ModuleLoader__.load({
  id: 'dsh-subagent-conductor',
  factory: (require) => {
    // ...
    return { name, inject, apply }
  }
})
```

package dsh.client 推荐 inject：

```json
[
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-conversation",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-api-remotes"
]
```

实际 bundle 内 `inject` 采用运行时服务短名：`slots`, `connection`, `settingsScope`；会话标准 props 提供 `sessionId/useSessions`。Settings 卡使用 `settings.plugin.item`，不发布 Remote。

### 5.2 会话选择器

已确认的官方 Slot：

- Slot 名：`conversation.input.right`
- selector 位于主模型 seat `conversation.input.model` 左边。
- `inject(sessionId) => ({ sessionId, ... })`
- 通过 `slots.inject(slotName, () => slots.register(...))` 挂载。

必须使用正常 z-index（例如 30 的菜单层，避免极端值），所有 DOM listener 和 style node 有 disposer。

功能：

- Inherit/default 选项。
- Model 子菜单。
- Effort 子菜单，仅在当前模型提供 reasoning metadata 时显示。
- 选择模型时原子清理旧 effort。
- 通过官方 Settings scope 对解析后的根会话 key 做 revision-aware set/unset。
- 使用标准 `useSessions().byId` 沿 `origin/parentId` 回溯根会话；显示、写入和清除使用同一根 key。
- Escape/外部点击关闭菜单，effect cleanup 完整。

### 5.3 Settings 卡

Slot：`settings.plugin.item`

管理：

- global default route（provider/model/effort）。
- defaultRole。
- roles CRUD。
- role persona/provider/model/effort/toolFilter。
- transport/background/maxDepth 高级设置。

建议先复用 workspace `dsh-tool-adapt/lib/client.js` 的生命周期和卡片结构，不复制其业务 CSS。保持 selector 狭窄、语义化 `data-*`、ARIA/role、官方 Slot。

### 5.4 rc.8 官方 Settings 单一边界

DSH `0.1.0-rc.8` 已不再使用第三方 namespace allowlist：当前 checkout 中无 `exposedNamespaces` / `settings-not-exposed`，官方 `settings.describe/update/replace/mutate` 对所有已注册 namespace 生效。证据：

- `@deepseek-ai/dsh-host-apiproxy/lib/index.js:2379-2384`
- `@deepseek-ai/dsh-host-apiproxy/lib/index.js:3394`

因此边界固定为：

1. **全局默认、角色模板、高级设置和每会话 selection 全部使用官方 Settings scope。** Settings UI 直接绑定 `subagent-conductor` namespace，使用 revision-aware mutate/replace。
2. 会话选择器只对 `sessionSelections.<sessionId>` 做单一路径 set/unset；Settings 卡不渲染内部 map。
3. Host 的 Settings schema/validate 是最终写入边界，不信任 browser 参数。
4. 不发布 Typert Remote Service，不创建第二个 bridge row，不注册裸 HTTP endpoint。
5. 该收敛也避免 link 包直接 import DSH/Cordis peer 后产生重复 runtime 副本；发布代码只普通依赖 Schemastery，其他能力均从已注入的 `ctx` 服务取得。

## 6. 包骨架建议

### 6.1 package.json

建议初始：

```json
{
  "name": "dsh-subagent-conductor",
  "version": "0.1.0",
  "description": "Configurable subagent provider/model/reasoning-effort routing with per-session controls, role templates, and a lifecycle-safe delegation tool for DeepSeek Harness.",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": [
    "lib/",
    "cordis.patch.yml",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "check": "node --check lib/index.js && node --check lib/config.js && node --check lib/client.js",
    "test": "node --test"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-ui-slots",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-api-remotes"
      ]
    }
  },
  "license": "MIT"
}
```

依赖/peerDependencies 不要凭猜测填写。先读取当前 profile/checkout 的实际版本，再按参考插件最小化声明。

## 7. 测试计划

### 7.1 纯函数单测

必须覆盖：

- call > role > session > default > inherit。
- provider/model/effort 字段独立解析。
- role id 与 displayName 映射、重复 displayName warning。
- invalid role 降级。
- 换模型时旧 effort 被删除。
- 只改 effort 时保持 provider/model。
- 无 reasoning metadata 时优雅不注入。
- strict direct-tool validation 与非严格 stock-listener 降级行为。
- root session parent chain、循环、registry 缺失。
- subagentDepth 与 header.origin 双判定。
- nested depth 1/2/3 的 root selection 与“不传播父 role marker”。
- fresh/resident 私有 AgentOptions marker 可读且不泄漏进返回 config。
- continuable cold resume marker 丢失并按正式语义回退。
- 清除 session selection 只影响新委派；不承诺改写在途 child 的已记录 route。

### 7.2 lifecycle 测试

模拟 ctx，确保：

- settings watch disposer 被 effect 管理。
- tool provider removed 后 tool disposer 被调用。
- systemPrompt section 可销毁。
- agent/request listener 随 fiber 销毁。
- Client Slot、locale、style、document listener 清理。

### 7.3 DSH 兼容性守卫

针对当前安装版本：

- 导入/检查 `resolveChildAgentOptions` 返回 `subagentDepth`。
- 确认 `AgentOptions` 官方字段仍不支持 effort；私有 marker 只能作为命名空间化兼容层。
- 行为测试确认 fresh child 首次 `agent/request` 可读取 marker，且不存在 start-return 后绑定竞态。
- 行为测试确认 `agent/request` listener 返回的 provider/model/reasoningEffort 被最终 `prepareCall` 采用。
- 明确测试 cold resume 只恢复 provider/model/persona/toolFilter，私有 marker 丢失并回退。
- 明确测试 cold-resumed child 缺少 `options.subagentDepth` 时仍由 `header.origin === 'subagent'` 命中。
- 模型目录/metadata 返回结构发生变化时测试明确失败。
- 测试插件 unload 后 listener 不再改变请求，并验证重挂载不产生双 listener。

### 7.4 Client 结构守卫

- 只使用 `window.__ModuleLoader__.load`。
- Slot 名精确：`conversation.input.right`、`settings.plugin.item`。
- 不存在 `document.body.appendChild` 作为 UI 主挂载。
- 不存在 `214748...` 极端 z-index。
- 外部点击/Escape listener 有 cleanup。
- style 节点由插件 id 标识并在卸载移除。

## 8. 实施阶段与验收门

### Phase A：契约取证

1. 读取当前 checkout 中：
   - `@deepseek-ai/dsh-subagent` request/provider 类型与实现。
   - `@deepseek-ai/dsh-agent` session header/meta/event 类型。
   - `@deepseek-ai/dsh-llm` model info/reasoning metadata 类型。
   - `@deepseek-ai/dsh-client-ui-slots` Slot 契约。
   - `@deepseek-ai/dsh-client-ui-settings` Settings 插槽/服务。
   - `@deepseek-ai/dsh-typert-protocol` Remote 注册与 disposer。
2. 解决第 4.1 节 carrier 问题。
3. 写一页设计说明到 README 或 `docs/design.md`，再进入实现。

验收门：能明确说明 per-call effort 在首请求与 continuable 冷恢复中的行为；不能含糊。

### Phase B：Host 最小闭环

1. `config.js` schema/normalize/route resolver。
2. settings namespace + scope lifecycle。
3. session selection Settings scope + root-session lineage。
4. 单个 `agent/request` listener。
5. 单测先通过。

验收门：用 mock agent/request 证明 stock 子代理能获得 per-session/default effort，main agent 不受影响。

### Phase C：委派工具与角色

1. role guidance。
2. provider added/removed 动态工具挂载。
3. persona/toolFilter capability checks。
4. 前台/one-shot background/continuable 路径。
5. carrier/fallback 行为测试。

验收门：不包装 start、不重实现 driver，代码 grep 可证明。

### Phase D：Client

1. 官方 Settings scope 与 session standard props。
2. 根会话 selector。
3. Settings 卡与 role CRUD。
4. locale/CSS/lifecycle。
5. Client 结构测试。

验收门：真实 3080 页面渲染，不只做源码断言。

### Phase E：打包与 workspace 集成

从 `D:\Resources\DSH_PRJ\DevPlugins\dsh-subagent-conductor` 运行：

```powershell
npm test
npm run check
npm pack --dry-run
```

创建/更新 package-local `AGENTS.md` 前必须加载 `agents-md-maintainer` skill。

manifest/bundle patch 完成后，从 workspace root 运行：

```powershell
node scripts/dsh-plugin-agents-metadata.mjs --write
node scripts/dsh-plugin-agents-metadata.mjs --check
```

### Phase F：安装与真实 Web 验证

从包根：

```powershell
dsh plugin --profile web add .
```

然后：

1. `dsh --profile web --dump-config` 确认出现独立 `# == dsh-subagent-conductor` bundle layer。
2. 不启动第二个服务器；复用现有 3080 Host。
3. 若 package location/ClientModuleRegistry 发生变化，重启现有 `dsh web` 进程。
4. 刷新 `http://127.0.0.1:3080`。
5. 验证 Settings → Plugins 出现 Conductor 卡。
6. 验证 composer 模型 seat 左侧出现子代理选择器。
7. 用至少两种模型和两个 effort 档位实测。
8. 派 stock `subagent`，检查 request/header 或可观察请求配置是否为选择的 provider/model/effort。
9. 派自有工具，检查 call/role 优先级。
10. 清除会话 selection，确认恢复 default/inherit。
11. 卸载/禁用插件，确认 UI、listener、tool、prompt section 全消失且 settings 外无残留文件。

## 9. 安全与许可证清单

- 两个参考仓库均为 MIT。
- 若直接复制代码片段，不得删除原版权/许可证声明；建议在 README 的 Acknowledgements 列出：
  - `ringoage/dsh-subagent-model-picker`
  - `SeverusZh/dsh-plugin-subagent-director`
- 不引入 install/prepare/postinstall 生命周期脚本。
- 不读凭据、不出网、不运行 subprocess。
- Web mutation 必须走 Remote 或 loopback/same-origin fenced route。
- 不记录 provider key、headers 或完整 prompt。
- 日志仅记录 route id/role/layer/降级原因，不记录用户 prompt/persona 全文。

## 10. 推荐的稳定包级不变量（未来 AGENTS.md）

1. 单一 `agent/request` listener 是 provider/model/effort 最终决策点。
2. 永不包装 `ctx.subagents.start/startContinuable`。
3. 永不替换 stock subagent tools；自有工具使用独立名字。
4. effort 与 provider/model 原子应用；换模型必须清理旧 effort。
5. 所有状态写入 `subagent-conductor` 自有命名空间。
6. per-call effort carrier 无官方契约时必须优雅降级，禁止 patch 上游。
7. 每个 route/listener/tool/Remote/Slot/locale/style/DOM listener 都要有 disposer；style 节点必须由插件自己的 effect 移除，不能假设 Client HMR 自动清理。
8. 默认行为是 zero intrusion：无 session/default/role/call 配置时返回 `await next()` 的原 config。
9. 仅允许 Host composition 单实例挂载，禁止放入 agent preset。
10. 私有 AgentOptions marker 不得进入 listener 返回的 LLM config；cold resume 丢失 marker 是 v1 明确定义的降级行为。
11. 清除 session selection 只保证影响新委派，不改写在途 child 的已记录 request route。

## 11. 下一位执行者的第一组动作

1. `Get-Location` 确认 cwd 为 `D:\Resources\DSH_PRJ\DevPlugins`。
2. 读取根 `AGENTS.md` 和本 `HANDOFF.md`。
3. 确认可用 skills；如有 `editing-cordis-compositions` / `cordis-plugin-development` 必须先加载。当前会话 catalog 未提供这两个 skill，因此本轮没有调用。
4. 优先解决第 4.1 节 carrier，先不要写大量 UI。
5. 读取参考包：
   - `D:\Resources\DSH_PRJ\DevPlugins\dsh-tool-adapt\package.json`
   - `D:\Resources\DSH_PRJ\DevPlugins\dsh-tool-adapt\cordis.patch.yml`
   - `D:\Resources\DSH_PRJ\DevPlugins\dsh-tool-adapt\lib\client.js`
   - `C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-model-picker\lib\index.js`
   - `C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-model-picker\lib\client.js`
   - `C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-director\src\route-resolver.ts`
   - `C:\Users\CarryWho\AppData\Local\Temp\dsh-subagent-audit\subagent-director\src\delegation-tool.ts`
6. 写 `docs/design.md` 或在 README 固化 carrier 结论。
7. 再创建 package skeleton 与测试。

---

这份计划的最高优先级不是“功能看起来齐全”，而是：**不碰 DSH 上游、热拔插干净、effort 真正生效、上游升级时通过测试显式失败而非静默错路由。**
