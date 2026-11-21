export type ModuleId = 'home' | 'blog' | 'projects' | 'about' | 'contact'

export interface ArticleItem {
  id: string
  title: string
  date: string
  tag: string
  summary: string
  body: string[]
  /** 如果有外链博客地址，填在这里即可在阅读弹窗中直达全文 */
  url?: string
}

export interface ProjectItem {
  name: string
  meta: string
  desc: string
  url?: string
}

export interface InfoItem {
  label: string
  meta?: string
  /** 点击复制的原始文本（例如邮箱） */
  copyValue?: string
  /** 点击跳转的外部链接 */
  href?: string
}

export interface ModuleDef {
  id: ModuleId
  index: string
  /** 武侠风中文名 */
  label: string
  en: string
  /** 信息面板所在一侧（主体陈设在另一侧） */
  side: 'left' | 'right'
  desc: string
  items?: InfoItem[]
  articles?: ArticleItem[]
  projects?: ProjectItem[]
  tags?: string[]
}

/** 站点文案：改这里即可替换成你自己的信息 */
export const SITE = {
  name: '孤剑夜行',
  nameEn: 'LONE BLADE',
  subtitle: "A Developer's World",
  tagline: '十年磨一剑，霜刃未曾试。',
}

export const MODULES: ModuleDef[] = [
  {
    id: 'home',
    index: '00',
    label: '归处',
    en: 'Home',
    side: 'left',
    desc: SITE.tagline,
  },
  {
    id: 'blog',
    index: '01',
    label: '藏卷',
    en: 'Blog',
    side: 'left',
    desc: '夜读千卷，落笔成锋。围炉展卷，记下技术思考与踩过的每一个坑。',
    articles: [
      {
        id: 'css-3d-camera',
        title: '用 CSS matrix3d 把 DOM 贴进三维世界',
        date: '2026.10',
        tag: '图形交互',
        summary: '不往 WebGL 里塞文字网格，借单应矩阵把普通 HTML 严丝合缝铺到 3D 卷面上。',
        body: [
          '在 Three.js 场景里渲染可读的中文长列表往往左右为难：3D 文字几何体顶点数暴涨，高分 CanvasTexture 占显存且缩放发糊，还天然丢失了浏览器原生的排版、选中与无障碍能力。',
          '更轻巧的做法是让 3D 物体只保留纯粹的纸纹和光影，把真正的文字留在 HTML 层：每帧将卷面四个角投影到屏幕空间，解出平面单应矩阵（Homography），通过一条 GPU 合成的 CSS matrix3d 变换铺到卷面上。',
          '这样既零 WebGL 文字开销，又保留清晰锐利的字体渲染和完整交互——镜头一到，墨字自显；镜头一离，悄然隐去。',
        ],
      },
      {
        id: 'ts-type-craft',
        title: 'TypeScript 类型心法十二式',
        date: '2026.08',
        tag: '类型体操',
        summary: '从判别联合到模板字面量，让类型系统替你挡住九成运行期隐患。',
        body: [
          '好的类型定义不是为了炫技，而是把业务约束写进编译器里：让非法状态根本无法被构造出来。',
          '优先用判别联合替代一堆可选布尔字段，用 const 断言收窄配置表，把边界校验收敛到数据入口，内部逻辑就能彻底摆脱层层空值判断。',
          '写久了你会发现，清晰的数据建模本身就是最好的文档。',
        ],
      },
      {
        id: 'frontend-perf-notes',
        title: '写给自己的 WebGL 前端性能手记',
        date: '2026.06',
        tag: '性能调优',
        summary: '如何把 500+ draw call 压到两位数，让核显和手机也能稳稳跑满帧。',
        body: [
          'WebGL 卡顿往往不是因为三角形太多，而是因为重复渲染和状态切换：实时平面倒影会让整个场景多画一遍，实时阴影又多画一遍，再加上满场景的点光源，每个像素都要跑一轮完整的 PBR 循环。',
          '按材质合并静态几何体、为远景灯光改用轻量光晕、在低画质档位关闭二次反射 pass 并切到程序化解析倒影，往往能带来数倍帧率提升，同时几乎不损夜景氛围。',
          '性能优化的核心是把算力花在人眼真正盯着的地方。',
        ],
      },
    ],
  },
  {
    id: 'projects',
    index: '02',
    label: '铸剑',
    en: 'Projects',
    side: 'right',
    desc: '每一个作品，都是亲手锻打的一柄剑。',
    projects: [
      {
        name: '孤剑夜行 · 3D 个人站',
        meta: 'Three.js / React',
        desc: '暮色河畔的一方营地，低开销 WebGL 场景与古卷投影交互。',
      },
      {
        name: '墨韵 · 轻量动效工具集',
        meta: 'TypeScript / Motion',
        desc: '面向交互细节的缓动与视差封装，默认遵循减少动态偏好。',
      },
      {
        name: '星槎 · 前端工程脚手架',
        meta: 'Vite / Engineering',
        desc: '开箱即用的模块划分、规范校验与构建分析模板。',
      },
    ],
    tags: ['React', 'TypeScript', 'Three.js', 'SCSS', 'GSAP', 'Vite'],
  },
  {
    id: 'about',
    index: '03',
    label: '来历',
    en: 'About',
    side: 'right',
    desc: '一名前端开发者。信奉少即是多，偏爱干净的代码与克制的设计。白天写码，夜里看星。',
    items: [
      { label: '所在', meta: '江湖 · 远程' },
      { label: '所长', meta: '前端交互 / 动效 / 图形与工程化' },
      { label: '近况', meta: '打磨个人作品与技术随笔' },
    ],
  },
  {
    id: 'contact',
    index: '04',
    label: '传书',
    en: 'Contact',
    side: 'left',
    desc: '山高路远，飞鸽可达。欢迎交流技术、合作或闲聊江湖二三事。',
    items: [
      { label: 'Email', meta: 'hello@example.com', copyValue: 'hello@example.com' },
      { label: 'GitHub', meta: 'github.com/yourname', href: 'https://github.com/yourname' },
    ],
  },
]

export const MODULE_IDS = MODULES.map((m) => m.id)

export const moduleIndex = (id: ModuleId) => MODULE_IDS.indexOf(id)

export const isModuleId = (v: string): v is ModuleId =>
  (MODULE_IDS as string[]).includes(v)
