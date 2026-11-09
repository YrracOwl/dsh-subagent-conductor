# 模型选择时序修复与验证

## 已部署行为

当前 Harness 0.2.2-rc.1 会在请求准备阶段固定模型。旧版本在 agent/request 返回另一 provider/model，导致准备后的模型与请求模型不一致。

本地修复在可等待的 agent/created 初始化阶段读取配置、校验精确模型及 reasoning effort，然后通过 agent.model.select 写入模型选择。当前宿主的 agent/request 路径原样返回已准备配置；没有 model.select 的旧宿主保留原路径。

优先级仍是根会话 > 默认角色 > 全局默认 > 官方工具参数 > 原生继承。配置直接从 Loader 提供的 Config 读取，不依赖可选 settings 服务的注入回调先执行。配置变更作用于之后新建或重新加载的子代理，已经加载的子代理继续使用已选路由。初始化期间异步校验采用进入时的配置快照。

## 验证

- npm test：66 项，64 通过，2 项可选宿主源码检查跳过，0 失败。
- npm run check、npm pack --dry-run、git diff --check 通过。
- 工作区 settings-host-portability-check：4 个 Host 插件 × 2 个 schemastery 版本通过。
- 新增模型选择测试涵盖等待初始化、配置优先级、配置更新读取、延迟 settings 注入、无初始模型、空配置、主会话不受影响、无效路由、effort 清理与取消。
- 另一全新上下文子代理做了只读复核，指出 settings 初始化竞态，修复后增加相应回归。

## 真实运行证据

通过 plugin_manager 移除旧安装、链接安装本工作区源码，再启用 include:subagent-conductor，返回 application: applied、warnings 为空。原 profile 的 defaultRoute/sessionSelections 保留。

真实子代理：6e07f2cb-1b87-4e97-9ff0-0d266253d952。
工具显式请求 jojo-code/gpt-6-astra/high；运行时 session_projcache 中 modelSelection.lastUsed 为 open-design-go/deepseek-v4.1-flash/max，与既有 conductor 默认配置一致。pending 为 null，一步完成，响应为“conductor 路由验证任务完成”。说明本次配置覆盖与跨模型请求都实际成功。

摘要保留于 ../artifacts/route-verification-summary.json。最初解码压缩会话文件只取得 session header，因此没有用该文件声称完整事件时序；实际路由证据来自宿主持久化投影与子代理完成通知。

## 范围

本次只修改 Host 路由、测试和说明，没有改变 Client UI。未执行浏览器视觉验收；现有 metadata 和图标未更改。没有发布 npm 或 Git 提交，package version 仍为 0.2.9；当前 profile 链接本地修复源码，需保留工作区目录。发布前应独立安排版本号和仓库维护。

两个可选源码检查未执行；新旧接口行为由回归和本次真实新宿主任务验证，不据此宣称所有历史宿主或所有 provider 均经过实际运行。

## 2026-11-09 增量（不改写上面的历史记录）

- 兼容测试不再断言旧宿主的实现形状，也不再按版本号猜边界（manifest 起点是 0.1.2-rc.1，“哪个版本首次提供 `model.select`”未验证）。现在按**已安装宿主自身的能力词汇**分支，并把识别到的版本写进测试名与 diagnostic：
  - 具备持久模型选择（`session.append('model/selection')`）：断言创建时 AgentOptions 快照、`agent/created` 串行等待、准备后拒绝换模型、`agent/request` 仍是 waterfall。
  - 不具备：断言 `agent/request` waterfall 与 `next()` 解析，且确认没有持久模型选择。
  普通 `npm test` 无 `DSH_CHECKOUT` 时仍跳过这两项。
- 已实际执行：`ELECTRON_RUN_AS_NODE=1` + 宿主 exe 对已安装的 0.2.2-rc.1 asar（8 pass / 1 skip，0 fail），普通 Node 对 0.1.7-rc.2 npm 安装（8 pass / 1 skip，0 fail）。把 0.2.2 宿主源码复制到临时目录后删除全部持久选择词汇，兼容检查会转入 legacy 分支并失败（7 pass / 1 fail），证明检查非空转；0.2.0-rc.2 本地只有 `dsh-subagent` 包、没有 `dsh-agent`，因此没有据此断言任何版本边界。
- `package-lock.json` 根元数据与 `package.json` 对齐（0.2.9、`^3.18.4`、`engines.dsh`），未升级任何依赖。
- 修复显式角色绑定的 effort 继承：路由相同且角色未指定 effort 时保留当前选择的 effort，路由变化时清除；与普通路由、官方 `resolveChildAgentOptions` 及角色编辑器“继承”文案一致，并补了回归。
- 当前全量 `npm test`：81 项，79 通过，0 失败，2 项可选白盒跳过。
