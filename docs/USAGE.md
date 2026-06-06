# 使用说明

## 安装依赖

```powershell
npm install
```

## 本地运行

```powershell
npm run dev
```

Vite 默认会监听 `127.0.0.1`。打开终端里输出的本地地址即可。

## 构建

```powershell
npm run build
```

构建命令会先执行 `vue-tsc --noEmit` 做 TypeScript/Vue 类型检查，再用 Vite 生成生产构建。

## 预览生产构建

```powershell
npm run preview
```

请先运行 `npm run build`，再启动 preview。

## 使用高德地图

底图是可选能力。没有配置 Key 时，地图区域会显示未配置提示。

开启底图：

1. 打开账户/设置弹窗。
2. 开启 BYOK。
3. 填写高德 JS API Key 和 Security Code。
4. 保存。

当前原型会把设置保存在浏览器 `localStorage` 的 `agentgis:v9_3:settings` key 下。地图文档状态也是本地存储，不会同步到服务器。

## 主流程

1. 打开 `/map`。
2. 在左侧工作区创建或切换地图文档。
3. 创建正式图层或参考图层。
4. 导入 GeoJSON，或在地图上绘制要素。
5. 选择图层/要素，在检查器中查看和编辑。
6. 在历史/检查器区域查看本地操作、撤销/重做和提交记录。
7. 需要时导出 GeoJSON。

## 移动端流程

在低于桌面断点的视口里，应用会切换成四个 tab 的移动工作台：

- `地图`：实时地图、当前地图摘要、保存按钮、模式/工具控制。
- `项目`：切换已保存地图，管理图片资源。
- `数据`：正式图层、参考图层、GeoJSON、操作历史。
- `我的`：当前地图统计和账户/BYOK 设置入口。

移动端地图使用和桌面端相同的文档状态、高德地图集成、绘制/编辑逻辑。绘制和几何编辑仍然需要选中正式图层，并配置有效的高德地图凭据。

## Demo 路由

以下路由把高德 MouseTool 行为从主应用中拆出来，方便单独验证绘制和编辑流程：

- `/mousetool-vue-demo`
- `/mousetool-transition-demo`

## 重置本地状态

可以使用应用内的重置动作，或者清空当前站点的浏览器 localStorage。

重要 localStorage key：

- `agentgis:v9_3:settings`
- 地图文档状态 key 定义在 `src/shared/mapDocument/mapDocumentPersistence.ts`
