# element_17 · 个人网站前端

3D 交互个人站前端：一块 WebGL 暮色河景（three.js）承载五个「页面」（首页 / 随笔 / 作品 / 关于 / 联系），页面之间用镜头切换；文字面板与菜单叠在画布之上。仓库根目录的 `backend/` 是配套后端服务，本目录只包含前端。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器（Vite，默认 http://localhost:5173）
npm run build      # 类型检查 + 产物构建（输出 dist/）
npm run preview    # 本地预览构建产物
npm run lint       # ESLint
```

要求 Node 20+。无网络字体依赖，全部使用系统字体。

## 目录结构

```
frontend/
├── index.html                  # 页面入口（title / description / favicon）
├── public/
│   └── favicon.svg             # 朱红印章 + 白剑
└── src/
    ├── main.tsx                # React 挂载入口
    ├── App.tsx
    ├── config/
    │   ├── modules.ts          # ★ 站点文案：站名、邮箱、GitHub、文章列表，改这里
    │   ├── shots.ts            # 各站点机位（位置 / 视场 / 曝光 / 构图偏移）
    │   ├── poses.ts            # 主角姿态（只有 home 一套）
    │   └── quality.ts          # 画质档位：低 / 中 / 高 的预设与自动选择
    ├── scene3d/                # 3D 世界（场景、光影、机位运动归作者维护）
    │   ├── World.ts            # 渲染器 + 场景装配 + 帧循环 + 画质/可见性调度
    │   ├── Environment.ts      # 两岸地形、碎石、野草、芦苇、枯树、远山、水雾、月光与残霞
    │   ├── River.ts            # 河：两条水线的解析式、地形网格、带真实倒影的水面着色器
    │   ├── Boat.ts             # 乌篷船（浮动摇晃）、对岸码头、近岸枯木与系船桩
    │   ├── StationProps.ts     # 四处空站点的陈设（石碑 / 铁砧 / 枯树 / 灯杆）
    │   ├── Village.ts          # 远处村落：房屋、窗灯、烟囱炊烟、篝火、枯树
    │   ├── StickmanSwordsman.ts# 火柴人剑客（主角）
    │   ├── Campfire.ts / StarryBackground.ts / textures.ts / textureLoader.ts
    ├── animation/
    │   └── SceneTransitionController.ts  # 切站镜头：升起 → 横移 → 落定；鼠标视差
    ├── components/
    │   ├── Scene/              # 画布生命周期、WebGL 兜底画面、电影遮幅
    │   ├── ModulePanel/        # 各站点信息面板（左右交替避让人物）
    │   └── ModuleMenu/         # 底部章节菜单（滑动光带指示器）
    ├── pages/HomePage/         # 页面骨架：键盘切换、加载「入夜」提示、画质开关
    └── styles/                 # 全局样式、变量（色板/字体断点）、mixins
```

## 行为说明

- **站点切换**：底部菜单点击、键盘 `←` `→` 循环切换、数字键 `1`~`5` 直达；当前站点记录在 URL hash 上（如 `/#blog`），可直接分享定位。
- **加载提示**：three.js 场景是独立异步 chunk，首帧渲染前显示「入夜」占位，就绪后淡出。
- **画质开关**：右上角低 / 中 / 高，控制像素比、阴影贴图尺寸、草叶与浮尘数量；选择存入 `localStorage`（键 `element17.quality`），首次访问按设备性能自动选档。
- **减少动态效果**：系统开启 `prefers-reduced-motion` 时，切站镜头退化为 0.4s 直达补间，鼠标视差关闭。
- **后台节流**：页面不可见（`document.hidden`）时暂停渲染循环，回到前台恢复。
- **WebGL 兜底**：WebGL 不可用时显示纯 CSS 暮色河景与一行提示，文字内容不受影响。

## 改文案

站点名、副标题、每章的标题 / 描述 / 列表项都在 `src/config/modules.ts` 顶部的 `SITE` 与 `MODULES` 里，照注释替换即可。
