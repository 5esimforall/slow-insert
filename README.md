# Slow Insert

独立开发项目，当前模块版本 **0.5.1**。基于 Quick Insert 的常驻右侧检索面板，支持来源徽标、中英文本地化和 5e 速查筛选。

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

打开 [英文预览](http://127.0.0.1:4178/tests/fixture.html) 或 [中文预览](http://127.0.0.1:4178/tests/fixture.html?lang=cn)。这只是模拟环境，并非真实 Foundry 世界。浏览器测试脚本位于上述测试目录。

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

分析输出包括严格负载候选、保守包对白名单、法术家族候选、年代证据冲突与法术字段差异的 JSON/CSV。这些审计产物在 `output/` 下，不纳入 Git，也不会被运行模块直接加载；v0.1.0 使用由已审阅名单生成并随版本发布的元数据注册表。

## 部署与保存边界

- 开发源码以本仓库为准，不直接在 Foundry 安装目录中开发。
- 发布前提交 Git 并标记版本，再打包部署；不额外复制旧安装目录作为备份。世界数据与素材不在本仓库的版本控制范围内。
- 安装时使用发行 ZIP 中的 `slow-insert` 文件夹；开发源码文件夹名 `module` 不能直接作为 Foundry 模块安装目录名。
- `/Users/arctic/Library/Application Support/FoundryVTT/Data/modules/slow-insert` 是独立的运行副本，不是符号链接。本次整理没有更新该副本。
- 本仓库不包含 FVTT 总目录中的其他模块、配套包、世界数据或旧项目。
- 既有 ZIP、截图、日志及分类数据溯源记录原样迁移；其中的旧路径和日期是历史记录，不是当前执行路径。

## v0.1.0 归并界面

加入可展开的审计白名单副本组与同版法术家族；支持客户端首选、拆分/恢复、全部副本视图。冲突或审计失效的成员自动保持独立。具体范围与失效检查见模块说明。

归并专用浏览器夹具：`http://127.0.0.1:4178/tests/fixture.html?grouping=1&lang=cn`。
运行时注册表由 `node tools/build-grouping-registry.mjs` 生成，只含身份、别名和校验元数据，不含规则正文。


## v0.2.0 规范来源书目

书目数据、引用／版次判定和 UI 分层；复用系统／模块声明并支持可选导入器字典与声明式扩展。页码只保留在提示，模块／实现版本不再进入书目；冲突和未知单列，不改原始文档。只迁移来源筛选，其余偏好保留。

完整扩展契约与元数据判定边界见模块说明。只读重放已有审计：`node tools/audit-sources.mjs output/dedup-audit-2026-11-01 output/source-classification-v0.2.0`。
