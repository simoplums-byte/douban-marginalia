# Douban Marginalia

![License](https://img.shields.io/badge/license-MIT-green) ![Version](https://img.shields.io/badge/version-1.0.4-blue) ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)

> 按需导出豆瓣电影、读书、音乐和游戏收藏：自定义字段、JSON / Excel / CSV，可选 IMDb / ISBN 与封面资源包。

基于 [byJming/douban-movie-exporter](https://github.com/byJming/douban-movie-exporter) 的本地改造项目。原项目由 ming 创建并以 MIT 许可证发布；Douban Marginalia 由 **Shawn 与 Codex 共创**，在其基础上调整为面向长期留存与后续迁移的数据导出工具，并保留原作者署名与许可证。

它用于备份豆瓣电影、读书、音乐和游戏收藏，支持自定义字段、按需详情抓取、JSON、Excel、CSV，以及可选的封面资源包。

## 功能特性

- 支持电影、读书、音乐、游戏四类收藏，按收藏状态分别导出：电影对应想看／在看／看过，图书对应想读／在读／读过，状态保存为 `wish`、`do`、`collect`。
- 默认使用「自定义字段」模板，只抓取勾选字段；不勾选 IMDb / ISBN 时仅读取列表页。
- 电影可按需取得 `imdb_id`，图书可按需取得 `isbn`；仅在勾选时才逐条访问对应详情页，结果缓存在浏览器本地，重复导出不会重复请求。
- JSON 是带元数据的权威导出；Excel / CSV 是便于检查的平铺副本，两者字段值一致（CSV 使用机器字段名 `imdb_id` / `isbn`，Excel 使用展示标题 `IMDb` / `ISBN`）。
- 支持从个人主页「书影音游戏汇总」入口导航到具体分类；支持指定页码范围，默认导出全部页面，即使从第 2 页打开也不会漏掉前面的记录。
- 可选导出封面并打包 ZIP，显示下载数量、空间估算和生成进度；封面选项默认关闭。
- 慢速安全模式：列表请求随机 2.0–2.8 秒间隔，详情请求固定 2 秒间隔；遇到 403、429 或验证码时自动暂停，等待人工完成验证后继续。
- 常驻任务控制条：停止并导出 / 终止并清理 / 重新开始；缺失 IMDb / ISBN 的条目可单独下载缺失报告（CSV）。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或其他兼容的用户脚本管理器。
2. 获取脚本（二选一）：
   - 打开本仓库的 [`douban-marginalia.user.js`](./douban-marginalia.user.js)，在 Tampermonkey 管理面板中导入；
   - 或复制脚本内容，在 Tampermonkey 中新建脚本并粘贴保存。
3. 确认安装或更新后，脚本版本为 `1.0.4`。

> 本仓库是 Douban Marginalia 的发布仓库；原项目地址 [byJming/douban-movie-exporter](https://github.com/byJming/douban-movie-exporter) 保留为上游来源，两者是不同脚本。

## 使用

登录豆瓣电脑版后，进入个人主页或以下任一收藏页：

- 电影：<https://movie.douban.com/mine?status=collect>
- 读书：<https://book.douban.com/mine?status=collect>
- 音乐：<https://music.douban.com/mine?status=collect>
- 游戏：`https://www.douban.com/people/<你的豆瓣ID>/games?action=collect`

点击右上角「书影音游戏汇总」，选择分类后配置字段。

### 收藏状态

从汇总页进入电影、读书、音乐或游戏后，脚本会先让你选择收藏状态。电影可分别导出想看／在看／看过；图书可分别导出想读／在读／读过。每次导出只对应一种状态，数据中的 `status` 分别保存为 `wish`、`do` 或 `collect`；文件名、JSON 元数据和 Excel 工作表名称会标明该状态。

导出面板只提供自定义字段。不勾选 IMDb 或 ISBN 时只读取列表页；勾选后才会逐条访问对应详情页。详情结果会缓存在浏览器本地，重复导出时不会重复请求。抓取失败的条目会留空，不会进行猜测或平台格式转换。

### 慢速安全模式与验证

自定义字段中勾选 IMDb 或 ISBN 时采用慢速安全模式：列表页请求间隔至少 2 秒，详情页请求间隔固定为 2 秒。遇到 403、429 或豆瓣安全验证页面时，任务会暂停并尝试打开验证页；完成滑块或图形验证后，回到导出页点击「我已完成验证，继续导出」。

短评导出为 `comment`，仅去除末尾「（x 有用）」计数，便于后续处理。

### 页码范围

页码范围默认不启用；勾选「仅导出指定页码范围」后，填写起始页和结束页即可。页码从 1 开始，范围包含首尾页。

### 任务控制条

导出开始后，页面右侧会显示常驻任务控制条：

- **停止并导出**：停止后续抓取，并下载目前已经完成的部分；当前正在读取的条目不会写入。
- **终止并清理**：立即停止本次任务，并删除本次已暂存的数据；不会修改豆瓣收藏。
- **重新开始**：删除本次已暂存的数据，返回字段选择后重新抓取。

勾选 IMDb 或 ISBN 时，控制条还会显示当前页、详情抓取完成数、缓存命中数及剩余时间估算。导出完成后，如有未取得 IMDb / ISBN 的条目，可单独下载缺失报告（CSV），其中包含豆瓣链接与抓取失败原因。字段配置面板还提供详情缓存数量和清空操作。

### 导出结果

任务完成后，下载选项分为两组：

- **单独导出 JSON / Excel / CSV**：只下载数据文件；长期留存请以 JSON 为准。
- **下载完整资源包 ZIP**：仅在选择封面时出现，包含：

  ```text
  covers/                 封面图片
  data/*.json             主数据 JSON
  data/*.xlsx             主数据 Excel
  data/*.csv              主数据 CSV
  cover-manifest.json     封面与条目的关联清单
  ```

## 封面说明

豆瓣图片 CDN 存在防盗链。选择下载封面后，脚本会在豆瓣页面上下文中下载实际图片并打包到 ZIP。`cover_file` 是 ZIP 内的本地相对路径；清单中的条目 ID、标题、评分、日期和豆瓣链接用于关联记录。

封面选项默认关闭；不勾选时不会发起图片请求。封面下载最多并发 2 张，超过 200 张会再次确认。

## 数据边界

Douban Marginalia 只负责抓取和保存豆瓣原始数据。IMDb、Goodreads、Letterboxd 等目标平台所需的字段改名、评分换算、数据清洗和账户写入应由独立转换／导入工具完成，避免备份格式与某个平台的临时规则耦合。

CSV 使用适合程序处理的字段名，例如 `imdb_id` 和 `isbn`；Excel 使用展示标题 `IMDb` 和 `ISBN`。同一次导出中，两种格式的字段值一致。

## 项目结构

```text
douban-marginalia.user.js   用户脚本（唯一运行入口）
README.md                   本说明，使用者文档的权威来源
AGENTS.md                   项目协作规则（面向协作者与 AI）
docs/PROJECT-CONTEXT.md     稳定背景、数据边界与文档地图
tests/                      单元测试（以 Node vm 装载脚本）
archive/                    改造前历史截图，仅供追溯，不代表当前行为
```

## 开发与验证

更改脚本后至少运行：

```sh
node --check douban-marginalia.user.js
node --test tests/douban-marginalia.test.js
git diff --check
```

单元测试覆盖字段映射、清洗与验证检测等纯逻辑；真实豆瓣页面、验证码与真实账号导出属于人工验证，未实际运行时不得声称已验证。

## 注意事项

- 本脚本仅用于个人备份、迁移和学习，请勿高频或商业化抓取。
- 抓取期间不要手动修改收藏状态、排序方式或分页参数。
- 豆瓣页面结构可能调整；如果按钮消失或字段为空，请附页面类型和控制台错误反馈。
- 发布封面或条目内容到个人网站前，请确认用途合规。

## 历史资料

旧版界面截图已移至 [`archive/2026-09-pre-marginalia/`](./archive/2026-09-pre-marginalia/)，仅供追溯改造来源，不代表当前功能或界面。

## License

原项目版权归 ming 所有；修改与维护由 Shawn 与 Codex 共创，继续遵循原项目的 MIT License。原项目地址：<https://github.com/byJming/douban-movie-exporter>。
