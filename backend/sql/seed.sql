-- element_17 个人网站 · 初始种子数据（幂等）
SET NAMES utf8mb4;

INSERT IGNORE INTO site_config (config_key, config_value, description) VALUES
('site.name', 'element_17', '站点名称'),
('site.nameEn', 'ELEMENT_17', '站点英文标识'),
('site.subtitle', 'Full-Stack & Agent Engineer', '站点副标题'),
('site.tagline', '与有肝胆人共事 从无字句处读书。', '首页格言'),
('blog.desc', '记录开发实践、技术思考与日常随笔。', '随笔简介'),
('projects.desc', '开源与个人项目，点击直达 GitHub 仓库。', '作品简介'),
('about.desc', '全栈 + Agent 工程师，关注 Web 全栈架构与智能体工程实践。', '关于简介'),
('contact.desc', '欢迎交流技术、探讨合作，或直接给我留言。', '联系简介');

INSERT IGNORE INTO profile_item (id, section, label, meta, copy_value, href, sort_order, visible) VALUES
(1, 'about', '定位', '全栈 + Agent 工程师', NULL, NULL, 1, 1),
(2, 'about', '方向', 'Web 全栈 / AI Agent 工程', NULL, NULL, 2, 1),
(3, 'contact', 'Email', '6cheng6lei6@gmail.com', '6cheng6lei6@gmail.com', NULL, 1, 1),
(4, 'contact', 'GitHub', 'github.com/element-17', NULL, 'https://github.com/element-17', 2, 1);

INSERT IGNORE INTO article (id, slug, title, tag, summary, content, external_url, status, pinned, view_count, published_at) VALUES
(1, 'hello-world', '站点上线手记', '随笔',
 '把个人站从本地搬到线上，留一块属于自己的记录空间。',
 '折腾了一阵，这个个人网站终于正式上线了。\n\n## 技术架构\n\n前后端完全拆开来做，整体尽量保持轻量：\n\n- **前端**：`React` + `TypeScript` + `Three.js`，支持昼夜（黑夜 / 黎明）切换与交互式 3D 场景。\n- **后端**：`Spring Boot` + `MyBatis` + `MySQL` + `Redis`，承接站点配置、Markdown 随笔与访客留言。\n\n## 后面打算写些什么\n\n平时主要围绕 **全栈开发** 与 **AI Agent 工程（LangGraph 等）** 折腾项目，后续会把踩过的坑、做的开源小工具和阶段性思考慢慢记在这里。\n\n> 与有肝胆人共事，从无字句处读书。\n\n欢迎常来看看，也欢迎通过邮箱或留言板联系。',
 NULL, 'PUBLISHED', 1, 1, '2026-11-22 20:30:00');

INSERT IGNORE INTO project (id, name, meta, description, url, repo_url, sort_order, visible) VALUES
(1, 'element_17-website', 'GitHub', '', NULL, 'https://github.com/element-17/element_17-website', 1, 1),
(2, 'Sight', 'GitHub', '', NULL, 'https://github.com/element-17/Sight', 2, 1);

INSERT IGNORE INTO skill_tag (id, name, sort_order) VALUES
(1, 'React', 1),
(2, 'TypeScript', 2),
(3, 'Spring Boot', 3),
(4, 'MySQL', 4),
(5, 'Redis', 5),
(6, 'LangGraph', 6);
