# 显式角色委派实现与验证 — 2026-11-06

已在 Desktop 0.2.2-rc.1 / desktop profile 安装本地链接版本（包版本仍为 0.2.9，未发布、未提交）。

## 行为

- `list_subagent_roles` 列目录；带 `role_id` 返回角色预置指引。
- `subagent_role` 接收 `role_id`、`task`、`description`，可选 `additional_instructions`、`cwd`。
- 角色 `instructions` 与用途 `description` 分离；旧角色默认空指引。
- 显式调用使用角色完整模型配置，优先于 Conductor 根会话/默认角色/全局路由。仍校验宿主模型授权，使用官方 spawn activation 与深度/并发管理。
- 普通 subagent/subagent_fork 保持既有优先级。默认角色只贡献路由，不注入指引。
- 保存 reserved child id 对应的角色快照；编辑/删除角色不改变已有绑定。提示词经官方 activation inbox 持久化，续聊走 send_message。
- UI 支持多行编辑、复制、预览和 JSON 往返。

## 已执行证据

`npm test`：80 个测试，78 pass，0 fail，2 skipped。跳过的是需要 DSH_CHECKOUT 的旧宿主源码白盒检查，不能算已验证。新增行为测试涵盖角色优先级、并发身份隔离、快照恢复、角色删除、无效角色/努力强度、取消、写入失败、激活失败、卸载以及可选存储失败不阻断普通委派。

`npm run check`、单独 roles.js 语法检查、`npm pack --dry-run` 均成功。包内含 roles.js，临时夹具不在发布清单。客户端 portability：6 bundles × 4 host shapes；Host portability：4 halves × 2 schemastery lines，均成功。

真实子代理：

| 调用 | child id | Host projection 的 lastUsed |
|---|---|---|
| Alpha 显式角色 | 134db0f6-df46-4c92-97ad-18a4850cff28 | jojo-code / gpt-6-astra / high |
| Beta 显式角色 | 133c4e9f-da21-48de-8f06-851c7edc114a | open-design-go / deepseek-v4.1-flash / max |
| 普通 subagent | b782b6b8-7a24-43a2-befb-b1b3cb876cde | open-design-go / deepseek-v4.1-flash / max |

Alpha 回传 `PRESET_ALPHA_1106 EXTRA_ALPHA_1106`；Beta 回传两个对应标记。Alpha 在临时角色删除与插件重新加载后通过 send_message 续聊，回传 `CONTINUATION_AFTER_ROLE_DELETE_OK PRESET_ALPHA_1106`，其第三轮实际模型仍为 jojo-code/gpt-6-astra/high。普通调用回传 `ORDINARY_DELEGATION_OK`。

原始摘要保存在 `artifacts/role-verification-summary.json`，来源是实际 Host session projection cache，不能据此声称拥有完整事件时间线。冷启动恢复由新插件实例读取旧存储的测试验证；本轮没有重启 Desktop 进程进行完整冷启动实测。

独立只读复核由 Alpha 子代理执行，发现可选存储初始化失败会传播到普通创建的问题。已修复并新增定向回归；另修复部分注册失败的清理与重复 close。此前另一复核子代理两次运行失败，没有结论，未计作审查成功。

## 清理与边界

临时角色已删除，profile 恢复 `roles: {}`；默认模型和会话选项保留。临时 `dsh-local-conductor-role-fixture` bundle 已移除。最终 Conductor 重装结果 applied，无插件警告；包管理器仍有既存 peer-dependency 提示。

当前 GUI `http://127.0.0.1:4054` 的 Client Inspect 确认 `settings.section` 中 `yotk-subagent-conductor` 活动、order=62。编辑器交互通过真实 client bundle 的 hook host 测试；没有完成浏览器中的目视点击验证，不声称页面视觉验收完成。

角色绑定是 Host JSON storage 的插件状态，Session 单独导出不能重建；备份迁移需要一起保留 `subagent_conductor_roles` unit。存储不可用时退出角色工具并警告，普通路由继续，已有角色的绑定恢复降级。失败激活保留 dormant binding，避免丢失部分接受的任务。未执行任何 Gate 9 审核或登记回执。
