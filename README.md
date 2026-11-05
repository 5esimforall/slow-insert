# Slow Insert

独立开发项目，当前模块版本 **0.6.24**。基于 Quick Insert 与 Truesight 的常驻右侧检索面板，支持来源徽标、中英文本地化和 5e 速查筛选。

项目根目录：`/Users/arctic/Arc/fvtt/projects/slow-insert`。

## 目录职责

- [模块源码与使用说明](/Users/arctic/Arc/fvtt/projects/slow-insert/module/README.md)：可安装模块内容，包括清单、脚本、样式、本地化和分类数据。
- [测试](/Users/arctic/Arc/fvtt/projects/slow-insert/tests)：单元测试和模拟 Foundry 的浏览器页面。
- [开发工具](/Users/arctic/Arc/fvtt/projects/slow-insert/tools)：发行打包和本地分类事实提取。
- [发行包](/Users/arctic/Arc/fvtt/projects/slow-insert/dist)：保留历史 ZIP，并输出新版本发行包；生成文件不纳入 Git。
- [测试产物](/Users/arctic/Arc/fvtt/projects/slow-insert/output)：历史截图与验证记录；不纳入 Git。
- `/Users/arctic/Arc/fvtt/projects/slow-insert/.playwright-cli`：历史浏览器调试记录；不纳入 Git。

## 开发命令

需要 Node.js 22 或以上、npm、系统 `zip`；预览和分类提取使用 Python 3。不需要安装运行时 npm 依赖。

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
npm test
npm run check
npm run package
```

开发与测试需要同级的 `truesight` 项目，其中 `module/` 是共享基座源码。测试加载器只映射基座公开的 `api-v1.mjs`，不会复制聚类算法。浏览器预览服务器也挂载该目录；生产代码按 Foundry 的模块目录布局导入公共入口。

`npm run package` 只打包模块源码，输出到项目内的发行目录。ZIP 顶层目录始终为 `slow-insert`，不会包含测试、工具或 Git 历史，也不会自动部署到 Foundry。

浏览器预览：

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
npm run preview
```

打开 [英文预览](http://127.0.0.1:4178/tests/fixture.html) 或 [中文预览](http://127.0.0.1:4178/tests/fixture.html?lang=cn)。夹具执行实际 `init → setup → ready` 入口，由生产 `registerSidebar()` 注册侧栏，再使用 `tests/sidebar-fixture.mjs` 提供最小 Foundry v13 宿主契约。宿主模拟标签切换、展开／收起、重渲染和原生弹出窗口，不直接实例化搜索面板。

预览默认使用浅色主题，URL 加 `theme=dark` 可检查深色主题。共享主题检查覆盖两个模块的四种全局／窗口明暗组合，验证窗口、原生菜单和主按钮配色、尺寸稳定及样式隔离；原生弹出菜单与鼠标悬停的实际外观仍需交互检查。

面板必须接收宿主。

从新加载的夹具点击 **Run browser checks** 执行 `tests/browser-checks.js`、`tests/filter-browser-checks.js`、`tests/theme-browser-checks.js` 与 `tests/diagnostics-browser-checks.js`，页面显示逐项通过结果或失败原因。用例使用合成 DOM 事件验证应用接线；真实点击、键盘焦点和窗口尺寸另用 MCP 验证。夹具不是真实 Foundry 世界，不能替代实机观察；结束后重载夹具以恢复测试查询和筛选。

## 非破坏性归并审计

审计工具只读取已启用的 Item/NPC 合集与世界顶层集合，不部署归并、不修改文档或索引设置。它先将数据库校验克隆到临时目录，仅在副本上打开 LevelDB，完成后清理副本。输出目录必须在 Foundry Data 之外。

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
node tools/audit-dedup.mjs \
  --data-root '/Users/arctic/Library/Application Support/FoundryVTT/Data' \
  --world arenae \
  --out output/dedup-audit-2026-11-01 \
  --level-module '/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/node_modules/classic-level/index.js'
node --import ./tools/register-dependencies.mjs tools/analyze-dedup-audit.mjs output/dedup-audit-2026-11-01
```

当前克隆命令使用 macOS `cp -cR`。离线审计不执行运行时系统迁移、Babele 优先级或模组钩子；结果不能直接当作实时索引。相同名称、identifier、来源指针乃至无上下文的内容指纹，都不能单独证明可归并。

分析输出包括严格负载候选、保守包对、法术家族候选、来源后缀候选、年代证据冲突与法术字段差异的 JSON/CSV。这些输出只供离线研究，不参与运行时归组，也不会生成可发布的逐条归组名单。当前归组行为见[模块说明](module/README.md)。

## 部署与保存边界

- 开发源码以本仓库为准，不直接在 Foundry 安装目录中开发。
- 开发后默认在提交到仓库后部署到 FVTT 时直接部署，但把验收交给用户。如果用户要求验收，优先使用MCP并告知用户；不要使用Computer Use。
- 发布前提交 Git 并标记版本，再打包部署；不额外复制旧安装目录作为备份。世界数据与素材不在本仓库的版本控制范围内。
- 安装时使用发行 ZIP 中的 `slow-insert` 文件夹；开发源码文件夹名 `module` 不能直接作为 Foundry 模块安装目录名。
- `/Users/arctic/Library/Application Support/FoundryVTT/Data/modules/slow-insert` 是独立的运行副本，不是符号链接。
- 本仓库不包含 FVTT 总目录中的其他模块、配套包、世界数据或旧项目。

## 面板内部职责

面板将检索、浏览计算和结果渲染分开，使索引更新与界面操作可以独立验证。搜索界面代码随 Slow Insert 发布，共享聚类与来源代码另由 Truesight 发布：

| 文件（位于 `module/scripts/`） | 职责与状态归属 |
| --- | --- |
| `panel.mjs` | 装配控件与宿主，协调刷新、客户端偏好、打开和拖放 |
| `quick-insert-index.mjs` | 适配 Foundry／Quick Insert，管理索引钩子、启动、超时、恢复与清理 |
| `browse-session.mjs` | 管理派生目录缓存和分页，执行筛选、别名补全、共享成员映射及整体排序 |
| `results-view.mjs` | 渲染结果与成员，管理行映射、选中和展开状态；接收明确的渲染上下文 |

索引完成以 Quick Insert 完成事件为准；文档更新在其索引钩子结束后合并刷新。查询先筛选成员，再选择组代表、整体排序；开启诊断折叠时按已筛选成员的诊断状态分区，两部分分别分批渲染。结果视图不重选代表，打开和拖放使用视图所记录的原条目。归组控件通过 Truesight 公共 API 打开管理窗口并定位成员所在的完整归组，不访问面板内部审核状态。

`tests/index-lifecycle.test.mjs`、`tests/browse-session.test.mjs` 和 `tests/results-view.test.mjs` 分别覆盖这些边界；分页与宿主行为仍由对应测试覆盖。界面验证继续使用上文浏览器夹具，并与实机观察分开记录。

## 共享目录接入

`catalog-api.mjs` 通过 Truesight 的公开 `api-v1.mjs` 获取来源 API 与有效成员关系，再将纯元数据接回 Quick Insert 原始结果。`grouping.mjs` 只保留展示与首选逻辑；`grouping-link.mjs` 打开基座的管理界面，不自行计算或写入审核。`grouping-state.mjs` 定义按世界和用户隔离的浏览偏好键。

聚类算法、书目数据与名称解析源码唯一归属于同级 `truesight` 项目的 `module/`。更改公共 API 时同步更新这里的消费者及测试。审核通知 `truesightChanged` 使浏览缓存失效，来源扩展也统一注册到基座。

离线来源审计需要加载公开依赖：`node --import ./tools/register-dependencies.mjs tools/audit-sources.mjs ...`，其他导入运行时来源解析的工具同理。单元测试通过 `npm test` 自动配置。

## 来源书目与审计重放

来源解析区分书目数据、引用／版次判定和 UI 展示，复用系统／模块声明并支持可选导入器字典与声明式扩展。页码只保留在提示，模块／实现版本不作为书目；冲突和未知单列，不改原始文档。筛选仅接受当前存储格式。

完整扩展契约与元数据判定边界见模块说明。只读重放已有审计：`node --import ./tools/register-dependencies.mjs tools/audit-sources.mjs output/dedup-audit-2026-11-01 output/source-classification-v0.2.0`。

### 刷新生命周期浏览器回归

访问 `tests/fixture.html?grouping`（中文加 `&lang=cn`）并点击 **Run browser checks**，额外执行 `tests/truesight-refresh-browser-checks.js`。覆盖状态查询零扫描、缓存复用、无关更新保留预览、普通改名与焦点保留、风险改名及身份更新作废预览、权限撤回和旧预览拒绝。此测试只运行在合成夹具，结束后恢复修改过的名称、学派及可见性并关闭审核窗口。

### 归组检查浏览器回归

`tests/fixture.html?grouping` 的浏览器检查同时执行 `tests/grouping-inspection-browser-checks.js`，覆盖组级入口、完整成员定位、只读打开、排除／恢复预览、明确应用、取消和玩家隐藏入口。用例只操作合成世界，结束后恢复审核内容、查询、筛选与展开状态；刷新夹具可恢复初始测试修订。真实 Foundry 中的原生窗口行为仍需单独验收。
