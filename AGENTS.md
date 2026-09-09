# 项目协作规则

## 适用范围

本文件适用于整个仓库。修改前先阅读 [`docs/PROJECT-CONTEXT.md`](./docs/PROJECT-CONTEXT.md) 与任务相关文档；当前工作树优先于历史记录，不覆盖、回退或提交来源不明的修改。

## 项目边界

- 主入口：`douban-marginalia.user.js`。
- 针对性测试：`tests/douban-marginalia.test.js`。
- 产品行为说明的权威来源：[`README.md`](./README.md)。
- `douban-data/` 保存用户导出的个人数据和验证样例；除非用户明确指定文件与范围，不得移动、覆盖或删除。
- 本脚本只负责从豆瓣读取并保存原始收藏数据；第三方平台转换、评分换算、数据清洗和账户导入不在范围内。

## 实现与验证

- IMDb 与 ISBN 仅在用户勾选相应字段后才访问详情页；保持列表请求随机 2.0–2.8 秒间隔、详情请求固定 2 秒间隔。
- 遇到 403、429 或安全验证时必须暂停，等待用户完成验证后再继续；不得绕过验证码。
- 更改脚本后至少运行：

  ```sh
  node --check douban-marginalia.user.js
  node --test tests/douban-marginalia.test.js
  git diff --check
  ```

- 真实豆瓣页面、验证码与真实账号导出属于人工验证；未实际运行时不得声称已验证。

## 文档与版本

- 稳定背景、数据边界和文档地图写入 `docs/PROJECT-CONTEXT.md`；README 面向使用者，不复制协作流水账。
- 仓库已公开（GitHub：`simoplums-byte/douban-marginalia`），公开版本线为 `1.0.4`；发布、提交、推送、创建仓库或上架市场均需用户明确授权。
- 上架前应将用户脚本元数据中的作者、项目主页、`@source` 和 `@namespace` 与公开项目资料统一；保留 ming / byJming 的 MIT 版权与改造来源。
- 未经用户明确授权，不提交、推送、发布、部署或向第三方账户写入数据。
