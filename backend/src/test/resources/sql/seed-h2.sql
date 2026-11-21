INSERT INTO site_config (config_key, config_value, description) VALUES
('site.name', '孤剑夜行', '站点中文名'),
('site.nameEn', 'LONE BLADE', '站点英文名'),
('site.subtitle', 'A Developer''s World', '副标题'),
('site.tagline', '十年磨一剑，霜刃未曾试。', '题词'),
('blog.desc', '夜读千卷，落笔成锋。', '藏卷简介'),
('projects.desc', '每一个作品，都是亲手锻打的一柄剑。', '铸剑简介'),
('about.desc', '一名前端开发者。', '来历简介'),
('contact.desc', '山高路远，飞鸽可达。', '传书简介');

INSERT INTO profile_item (section, label, meta, copy_value, href, sort_order, visible) VALUES
('about', '所在', '江湖 · 远程', NULL, NULL, 1, 1),
('contact', 'Email', 'hello@example.com', 'hello@example.com', NULL, 1, 1),
('contact', 'GitHub', 'github.com/chenglei6-arch', NULL, 'https://github.com/chenglei6-arch', 2, 1);

INSERT INTO article (slug, title, tag, summary, content, status, pinned, view_count, published_at) VALUES
('css-3d-camera', '用 CSS matrix3d 把 DOM 贴进三维世界', '图形交互', '摘要一', '正文内容一', 'PUBLISHED', 1, 42, '2026-10-18 21:00:00'),
('ts-type-craft', 'TypeScript 类型心法十二式', '类型体操', '摘要二', '正文内容二', 'PUBLISHED', 0, 31, '2026-08-22 20:30:00'),
('draft-only-note', '未公开草稿', '随笔', '草稿摘要', '草稿正文', 'DRAFT', 0, 0, NULL);

INSERT INTO project (name, meta, description, repo_url, sort_order, visible) VALUES
('孤剑夜行 · 3D 个人站', 'Three.js / React / Spring Boot', '个人网站项目', 'https://github.com/chenglei6-arch/my-website', 1, 1),
('内部实验项目', 'Internal', '隐藏项目', NULL, 2, 0);

INSERT INTO skill_tag (name, sort_order) VALUES
('React', 1),
('Spring Boot', 2),
('MySQL', 3),
('Redis', 4);
