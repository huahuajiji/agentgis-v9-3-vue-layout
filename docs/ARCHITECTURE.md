# 架构说明

## 项目目标

这个项目是地图文档编辑器的前端原型。它的目标不是做完整后端系统，而是在引入服务端之前，先验证 AgentGIS 工作台的信息架构、状态模型和地图编辑交互。

## 应用结构

应用围绕 Vue Router 组织：

- `src/App.vue`：渲染当前路由。
- `src/router.ts`：定义主工作区路由和 demo 路由。
- `src/layouts/AppLayout.vue`：同时挂载桌面端和移动端 shell。
- `src/components/DesktopShell.vue`：桌面端主工作台组合。
- `src/components/mobile/MobileShell.vue`：移动端工作台。

桌面端偏向多面板同时展示：左侧工作区、中间地图、右侧检查器。移动端把同一套任务拆成四个 tab：地图、项目、数据、我的。两端共用同一套 Pinia store 和地图文档模型。

## 状态管理

状态由 Pinia 管理：

- `src/stores/mapDocumentStore.ts`
  - 当前草稿/已保存地图
  - 图层和要素
  - 地图视口
  - 本地操作历史
  - 撤销/重做栈
  - 外部操作记录
  - GeoJSON 导入/导出动作

- `src/stores/settingsStore.ts`
  - BYOK 开关
  - 高德底图凭据
  - 高德 POI Key
  - LLM endpoint/model/API key 占位配置

所有状态都是浏览器本地状态。这个仓库没有服务端同步。

## 地图文档模型

核心 schema 位于 `src/schemas/mapDocumentSchema.ts`，使用 Zod 做运行时校验。模型包含：

- workspace
- 草稿地图和已保存地图
- 图层
- 基于 GeoJSON 的要素
- 图层图片资源
- 当前选中图层/要素
- 本地操作
- 本地提交
- 外部操作审核记录

地图文档的具体变更逻辑拆在 `src/shared/mapDocument/*` 中。这样 store 更像编排层，而不是把所有数据转换逻辑堆在一个文件里。

## 地图集成

高德地图集成被隔离在几个模块里：

- `src/shared/amap/amapLoader.ts`
- `src/components/AmapBaseMap.vue`
- `src/shared/amap/amapDrawingSession.ts`
- `src/shared/amap/amapEditSession.ts`
- `src/shared/map/amapFeatureAdapter.ts`

应用只有在开启 BYOK，并且 JS API Key / Security Code 都存在时，才会尝试加载高德底图。

## 几何编辑目标

`src/shared/map/useGeometryEditTarget.ts` 负责根据当前地图模式、工具和选中要素计算几何编辑目标。这个逻辑被抽出来后，桌面端和移动端可以复用同一套“何时进入几何编辑”的判断。

## 外部操作

项目把外部操作建模成结构化记录，可以和本地操作历史进行匹配。这为后续 AI 或后端集成留出了接口：外部建议先被表示为 typed map operation，再决定是否应用到当前地图。

当前这仍然只是本地前端模型。项目不会真正调用 LLM，也没有后端执行链路。

## 边界

已经包含：

- 本地状态模型
- 本地地图文档编辑
- 高德地图绘制/编辑集成
- GeoJSON 导入/导出
- 桌面端指挥台 UI
- 移动端地图/项目/数据/账户工作流

暂未包含：

- 后端持久化
- 用户登录
- 多人协作
- 生产级密钥存储
- 服务端地图处理
- 自动化测试套件
- CI/CD 流程
