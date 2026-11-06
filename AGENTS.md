# AGENTS

本文件指导自动化助手在 Slow Insert 项目中工作。

开始任务前，必须先阅读并遵循工作区公共规则 [../../AGENTS.md](../../AGENTS.md)，再阅读本文件。以下仅列出项目专属要求。

## 项目入口

- `README.md`：项目结构、开发命令、打包与部署流程。
- `module/README.md`：模块使用说明、行为语义与版本记录。
- `module/scripts/`：运行时代码；`module/styles/`：样式；`module/lang/`：本地化。
- `module/data/`：分类、书目与归并数据。
- `tests/`：单元测试与浏览器夹具；`tools/`：数据处理与发行工具。

## 语言与术语

区分出版物、书籍版次、规则代际、实现来源和引用依据。命名与文案沿用各自含义，避免用“版本”同时指代多个概念。

## 验证与部署

受影响测试示例：`node --test tests/source.test.mjs`。完整测试与检查命令为 `npm test` 与 `npm run check`；发行时按 README 执行 `npm run package`。

重点检查筛选、归并、排序、权限范围和打开／拖放目标之间的一致性。

交互检查结束后恢复临时查询和筛选。开发源码、运行副本与世界数据各按 README 中的职责管理。
