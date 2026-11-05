# Slow Insert

独立开发项目，当前模块版本 **0.6.7**。基于 Quick Insert 的常驻右侧检索面板，支持来源徽标、中英文本地化和 5e 速查筛选。

项目根目录：`/Users/arctic/Arc/fvtt/projects/slow-insert`。

## 目录职责

- [模块源码与使用说明](/Users/arctic/Arc/fvtt/projects/slow-insert/module/README.md)：可安装模块内容，包括清单、脚本、样式、本地化和分类数据。
- [测试](/Users/arctic/Arc/fvtt/projects/slow-insert/tests)：单元测试和模拟 Foundry 的浏览器页面。
- [开发工具](/Users/arctic/Arc/fvtt/projects/slow-insert/tools)：发行打包和本地分类事实提取。
- [发行包](/Users/arctic/Arc/fvtt/projects/slow-insert/dist)：保留历史 ZIP，并输出新版本发行包；生成文件不纳入 Git。
- [测试产物](/Users/arctic/Arc/fvtt/projects/slow-insert/output)：历史截图与验证记录；不纳入 Git。
- `/Users/arctic/Arc/fvtt/projects/slow-insert/.playwright-cli`：历史浏览器调试记录；不纳入 Git。

## 开发命令

需要 Node.js、npm、系统 `zip`；预览和分类提取使用 Python 3。不需要安装运行时 npm 依赖。

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
npm test
npm run check
npm run package
```

`npm run package` 只打包模块源码，输出到项目内的发行目录。ZIP 顶层目录始终为 `slow-insert`，不会包含测试、工具或 Git 历史，也不会自动部署到 Foundry。

浏览器预览：

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
npm run preview
```

打开 [英文预览](http://127.0.0.1:4178/tests/fixture.html) 或 [中文预览](http://127.0.0.1:4178/tests/fixture.html?lang=cn)。夹具执行实际 `init → setup → ready` 入口，由生产 `registerSidebar()` 注册侧栏，再使用 `tests/sidebar-fixture.mjs` 提供最小 Foundry v13 宿主契约。宿主模拟标签切换、展开／收起、重渲染和原生弹出窗口，不直接实例化搜索面板。

面板必须接收宿主；旧浮层的入口、定位、宽度设置和控件已移除。旧客户端存储中遗留的 `width` 值不再读取，无需迁移或清除其他偏好。

从新加载的夹具点击 **Run browser checks** 执行 `tests/browser-checks.js` 与 `tests/filter-browser-checks.js`，页面显示逐项通过结果或失败原因。用例使用合成 DOM 事件验证应用接线；真实点击、键盘焦点和窗口尺寸另用 MCP 验证。夹具不是真实 Foundry 世界，不能替代实机观察；结束后重载夹具以恢复测试查询和筛选。

## 非破坏性归并审计

审计工具只读取已启用的 Item/NPC 合集与世界顶层集合，不部署归并、不修改文档或索引设置。它先将数据库校验克隆到临时目录，仅在副本上打开 LevelDB，完成后清理副本。输出目录必须在 Foundry Data 之外。

```sh
cd /Users/arctic/Arc/fvtt/projects/slow-insert
node tools/audit-dedup.mjs \
  --data-root '/Users/arctic/Library/Application Support/FoundryVTT/Data' \
  --world arenae \
  --out output/dedup-audit-2026-11-01 \
  --level-module '/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/node_modules/classic-level/index.js'
node tools/analyze-dedup-audit.mjs output/dedup-audit-2026-11-01
```

当前克隆命令使用 macOS `cp -cR`。离线审计不执行运行时系统迁移、Babele 优先级或模组钩子；结果不能直接当作实时索引。相同名称、identifier、来源指针乃至无上下文的内容指纹，都不能单独证明可归并。

分析输出包括严格负载候选、保守包对、法术家族候选、来源后缀候选、年代证据冲突与法术字段差异的 JSON/CSV。这些输出只供离线研究，不参与运行时归组，也不会生成可发布的逐条归组名单。v0.6.5 已删除旧静态注册表、审批文件与生成器；当前归组行为见模块说明。

## 部署与保存边界

- 开发源码以本仓库为准，不直接在 Foundry 安装目录中开发。
- 发布前提交 Git 并标记版本，再打包部署；不额外复制旧安装目录作为备份。世界数据与素材不在本仓库的版本控制范围内。
- 安装时使用发行 ZIP 中的 `slow-insert` 文件夹；开发源码文件夹名 `module` 不能直接作为 Foundry 模块安装目录名。
- `/Users/arctic/Library/Application Support/FoundryVTT/Data/modules/slow-insert` 是独立的运行副本，不是符号链接。
- 本仓库不包含 FVTT 总目录中的其他模块、配套包、世界数据或旧项目。
- 既有 ZIP、截图、日志及分类数据溯源记录原样迁移；其中的旧路径和日期是历史记录，不是当前执行路径。

## 面板内部职责

面板将检索、浏览计算和结果渲染分开，使索引更新与界面操作可以独立验证。所有文件仍随同一个 Foundry 模组发布：

| 文件（位于 `module/scripts/`） | 职责与状态归属 |
| --- | --- |
| `panel.mjs` | 装配控件与宿主，协调刷新、客户端偏好、打开和拖放 |
| `quick-insert-index.mjs` | 适配 Foundry／Quick Insert，管理索引钩子、启动、超时、恢复与清理 |
| `browse-session.mjs` | 管理派生目录缓存和分页，执行筛选、别名补全、归组及整体排序 |
| `results-view.mjs` | 渲染结果与成员，管理行映射、选中和展开状态；接收明确的渲染上下文 |

索引完成以 Quick Insert 完成事件为准；文档更新在其索引钩子结束后合并刷新。查询先筛选成员，再选择组代表、整体排序，最后分批渲染。结果视图不重选代表，打开和拖放使用视图所记录的原条目。归组控件通过状态读取与提交回调连接面板，不直接访问面板内部字段或 Quick Insert。

`tests/index-lifecycle.test.mjs`、`tests/browse-session.test.mjs` 和 `tests/results-view.test.mjs` 分别覆盖这些边界；分页与宿主行为仍由对应测试覆盖。界面验证继续使用上文浏览器夹具，并与实机观察分开记录。

## 通用归组开发

`scripts/grouping.mjs` 负责当前索引身份、显式计算和已应用结果展示；`grouping-state.mjs` 负责世界／客户端持久化结构、校验与撤销；`grouping-controls.mjs` 提供预览确认流程。修改身份规则时递增规则版本，并验证失效缓存不会隐式重算。

`tests/grouping-fixture.mjs` 使用合成元数据，不依赖本机合集；单元测试覆盖拒绝证据、身份变化、权限过滤、风险开关、首选迁移和撤销。浏览器夹具入口为 `http://127.0.0.1:4178/tests/fixture.html?grouping=1&lang=cn`。实际界面验收优先通过 MCP 操作运行中的 Foundry；每次发布的观察记录保存在 `output/`。

## v0.2.0 规范来源书目

书目数据、引用／版次判定和 UI 分层；复用系统／模块声明并支持可选导入器字典与声明式扩展。页码只保留在提示，模块／实现版本不再进入书目；冲突和未知单列，不改原始文档。只迁移来源筛选，其余偏好保留。

完整扩展契约与元数据判定边界见模块说明。只读重放已有审计：`node tools/audit-sources.mjs output/dedup-audit-2026-11-01 output/source-classification-v0.2.0`。
