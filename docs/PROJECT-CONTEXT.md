# 项目背景：Douban Marginalia

Document updated at: 2026-09-09

Last verified against: `370a0b1`（Douban Marginalia 首次入库提交）

Working tree state: 已提交并推送至 GitHub 私有仓库 `simoplums-byte/douban-marginalia`（`main`）

## 定位

Douban Marginalia 是一个 Tampermonkey 兼容的豆瓣收藏导出脚本，基于 [byJming/douban-movie-exporter](https://github.com/byJming/douban-movie-exporter) 改造，由 Shawn 与 Codex 共创。它面向个人长期留存和后续迁移，保留原作者 ming 的 MIT 许可证与署名。

脚本的职责是导出豆瓣电影、读书、音乐和游戏收藏的原始字段；它不执行 IMDb、Goodreads、Letterboxd 等平台的字段转换、评分换算或账户导入。

## 关键结构

| 项目 | 位置 | 说明 |
| --- | --- | --- |
| 用户脚本 | `douban-marginalia.user.js` | 唯一运行入口；包含页面解析、分页、详情获取、导出与界面。 |
| 单元测试 | `tests/douban-marginalia.test.js` | 以 Node `vm` 装载脚本，覆盖字段映射、清洗与验证检测等纯逻辑。 |
| 用户说明 | `README.md` | 当前功能、安装和使用方式的权威来源。 |
| 用户数据 | `douban-data/` | 本地导出结果与验证样例；非源码，不得擅自清理。 |

## 数据与运行方式

- 四类收藏均按状态分别导出：`wish`、`do`、`collect`；电影对应想看／在看／看过，图书对应想读／在读／读过。
- 自定义字段为默认且唯一的导出模板。电影可按需取得 `imdb_id`，图书可按需取得 `isbn`；详情值本地缓存，避免重复请求。
- JSON 是带元数据的权威导出；CSV 使用机器字段名（如 `imdb_id`），Excel 使用展示标题（如 `IMDb`），两者字段值应一致。
- 抓取状态、当次数据和字段选择保存在浏览器 `localStorage`；详情缓存使用分类加豆瓣条目 ID 作为键。它们不是跨浏览器或跨设备的备份机制。
- 列表请求使用 2.0–2.8 秒随机间隔，详情请求使用固定 2 秒间隔。检测到 403、429 或验证码后暂停，由用户人工完成验证。

## 验证与已知限制

```sh
node --check douban-marginalia.user.js
node --test tests/douban-marginalia.test.js
git diff --check
```

单元测试不替代真实页面验证。豆瓣 DOM 变化、登录状态、验证码出现与真实账户的大量导出仍需在浏览器中进行小范围人工验证。并非所有电影均具有 IMDb ID，且详情读取失败或豆瓣页面本身缺失时字段会为空，并在缺失报告中显示。

## 文档地图

- `README.md`：使用者说明和当前产品行为。
- `AGENTS.md`：长期协作、验证与授权边界。
- 本文件：稳定背景、结构、数据边界和验证状态。

未建立 PRD、ADR、`.ai-sync/` 或 `CHANGELOG.md`：当前功能边界由 README 足以表达，暂无并行任务或公开发布记录。首次公开发布前再创建更新日志，并同步公开元数据。
