# AgentGIS V9.3 Vue Layout

AgentGIS V9.3 Vue Layout 是一个基于 Vue 3 的 GIS 地图文档工作台原型。它重点探索一件事：地图画布、图层/文档管理、要素检查、操作历史、AI/外部操作审核，怎样被组织进一个足够清晰、可继续扩展的产品界面里。

这个仓库只包含 V9.3 探索里的 `vue-layout` 项目。它是纯前端原型：没有后端服务、没有托管数据库，也不会内置任何地图 API Key。

## 包含内容

- Vue 3 + TypeScript + Vite 应用骨架。
- 桌面端指挥台布局：地图工作区、左侧文档/图层面板、右侧检查器、账户/设置弹窗。
- 移动端工作台：地图、项目、数据、我的四个 tab，覆盖主要移动工作流。
- Pinia 本地状态：地图文档状态、账户设置、BYOK 配置。
- 地图文档模型：图层、要素、已保存地图、草稿地图、本地提交、撤销/重做、外部操作记录。
- GeoJSON 导入/导出能力。
- 可选的高德地图底图集成，使用用户自己提供的 JS API Key 和 Security Code。
- MouseTool 绘制/编辑 demo，用于验证高德地图绘制流程。

## 快速开始

```powershell
npm install
npm run dev
```

打开 Vite 输出的本地地址即可。默认入口会跳转到 `/map`。

构建检查：

```powershell
npm run build
```

这个项目已经用全新 clone 流程验证过：`npm install` 和 `npm run build` 可以通过。

## 地图 Key 配置

仓库不包含任何地图 API Key。要加载高德底图，需要在应用里配置：

1. 打开账户/设置弹窗。
2. 开启 BYOK。
3. 填写高德 JS API Key 和 Security Code。
4. 保存设置。

当前原型会把这些配置保存在浏览器 `localStorage`。这适合原型验证，不是生产环境的凭据管理方案。

## 路由

- `/map`：主地图工作区。
- `/project`：项目区壳。
- `/data`：数据区壳。
- `/ai`：AI 区壳。
- `/history`：历史区壳。
- `/settings`：设置区壳。
- `/mousetool-vue-demo`：独立 MouseTool 绘制 demo。
- `/mousetool-transition-demo`：MouseTool 状态切换/操作 demo。

## 移动端体验

移动端现在不是占位壳，而是接入了同一套地图文档工作流：

- 地图：实时地图区域、当前文档摘要、保存动作、地图模式选择、绘制/编辑控件。
- 项目：地图列表和图层图片资源。
- 数据：正式图层、参考图层、GeoJSON 导入导出、操作历史。
- 我的：当前地图摘要和账户/BYOK 设置。

## 文档

- [使用说明](docs/USAGE.md)
- [架构说明](docs/ARCHITECTURE.md)
- [项目评价](docs/PROJECT_REVIEW.md)

## 当前状态

这是一个原型，不是生产级 GIS 平台。它比较强的部分是交互模型、地图文档状态设计和本地编辑工作流。主要缺口是后端持久化、登录鉴权、自动化测试、部署配置和生产级凭据管理。

## 技术栈

- Vue 3.5
- TypeScript 5.7
- Vite 6
- Pinia 3
- Vue Router 4
- Zod 4
- `@amap/amap-jsapi-loader`
