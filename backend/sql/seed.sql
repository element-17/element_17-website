-- 孤剑夜行 · 初始种子数据（幂等，与前端初始文案对齐）

INSERT IGNORE INTO site_config (config_key, config_value, description) VALUES
('site.name', '孤剑夜行', '站点中文名'),
('site.nameEn', 'LONE BLADE', '站点英文名'),
('site.subtitle', 'A Developer''s World', '站点副标题'),
('site.tagline', '十年磨一剑，霜刃未曾试。', '首页题词'),
('blog.desc', '夜读千卷，落笔成锋。围炉展卷，记下技术思考与踩过的每一个坑。', '藏卷简介'),
('projects.desc', '每一个作品，都是亲手锻打的一柄剑。', '铸剑简介'),
('about.desc', '一名前端开发者。信奉少即是多，偏爱干净的代码与克制的设计。白天写码，夜里看星。', '来历简介'),
('contact.desc', '山高路远，飞鸽可达。欢迎交流技术、合作或闲聊江湖二三事。', '传书简介');

INSERT IGNORE INTO profile_item (id, section, label, meta, copy_value, href, sort_order, visible) VALUES
(1, 'about', '所在', '江湖 · 远程', NULL, NULL, 1, 1),
(2, 'about', '所长', '前端交互 / 动效 / 图形与工程化', NULL, NULL, 2, 1),
(3, 'about', '近况', '打磨个人作品与技术随笔', NULL, NULL, 3, 1),
(4, 'contact', 'Email', 'hello@example.com', 'hello@example.com', NULL, 1, 1),
(5, 'contact', 'GitHub', 'github.com/chenglei6-arch', NULL, 'https://github.com/chenglei6-arch', 2, 1);

INSERT IGNORE INTO article (id, slug, title, tag, summary, content, external_url, status, pinned, view_count, published_at) VALUES
(1, 'css-3d-camera', '用 CSS matrix3d 把 DOM 贴进三维世界', '图形交互',
 '不往 WebGL 里塞文字网格，借单应矩阵把普通 HTML 严丝合缝铺到 3D 卷面上。',
 '在 Three.js 场景里渲染可读的中文长列表往往左右为难：3D 文字几何体顶点数暴涨，高分 CanvasTexture 占显存且缩放发糊，还天然丢失了浏览器原生的排版、选中与无障碍能力。\n\n更轻巧的做法是让 3D 物体只保留纯粹的纸纹和光影，把真正的文字留在 HTML 层：每帧将卷面四个角投影到屏幕空间，解出平面单应矩阵（Homography），通过一条 GPU 合成的 CSS matrix3d 变换铺到卷面上。\n\n这样既零 WebGL 文字开销，又保留清晰锐利的字体渲染和完整交互——镜头一到，墨字自显；镜头一离，悄然隐去。',
 NULL, 'PUBLISHED', 1, 42, '2026-10-18 21:00:00'),
(2, 'ts-type-craft', 'TypeScript 类型心法十二式', '类型体操',
 '从判别联合到模板字面量，让类型系统替你挡住九成运行期隐患。',
 '好的类型定义不是为了炫技，而是把业务约束写进编译器里：让非法状态根本无法被构造出来。\n\n优先用判别联合替代一堆可选布尔字段，用 const 断言收窄配置表，把边界校验收敛到数据入口，内部逻辑就能彻底摆脱层层空值判断。\n\n写久了你会发现，清晰的数据建模本身就是最好的文档。',
 NULL, 'PUBLISHED', 0, 31, '2026-08-22 20:30:00'),
(3, 'frontend-perf-notes', '写给自己的 WebGL 前端性能手记', '性能调优',
 '如何把 500+ draw call 压到两位数，让核显和手机也能稳稳跑满帧。',
 'WebGL 卡顿往往不是因为三角形太多，而是因为重复渲染和状态切换：实时平面倒影会让整个场景多画一遍，实时阴影又多画一遍，再加上满场景的点光源，每个像素都要跑一轮完整的 PBR 循环。\n\n按材质合并静态几何体、为远景灯光改用轻量光晕、在低画质档位关闭二次反射 pass 并切到程序化解析倒影，往往能带来数倍帧率提升，同时几乎不损夜景氛围。\n\n性能优化的核心是把算力花在人眼真正盯着的地方。',
 NULL, 'PUBLISHED', 0, 27, '2026-06-15 19:45:00');

INSERT IGNORE INTO project (id, name, meta, description, url, repo_url, sort_order, visible) VALUES
(1, '孤剑夜行 · 3D 个人站', 'Three.js / React / Spring Boot',
 '暮色河畔的一方营地，低开销 WebGL 场景、古卷投影交互与全栈后台。',
 NULL, 'https://github.com/chenglei6-arch/my-website', 1, 1),
(2, '墨韵 · 轻量动效工具集', 'TypeScript / Motion',
 '面向交互细节的缓动与视差封装，默认遵循减少动态偏好。',
 NULL, NULL, 2, 1),
(3, '星槎 · 前端工程脚手架', 'Vite / Engineering',
 '开箱即用的模块划分、规范校验与构建分析模板。',
 NULL, NULL, 3, 1);

INSERT IGNORE INTO skill_tag (id, name, sort_order) VALUES
(1, 'React', 1),
(2, 'TypeScript', 2),
(3, 'Three.js', 3),
(4, 'Spring Boot', 4),
(5, 'MySQL', 5),
(6, 'Redis', 6);
