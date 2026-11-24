INSERT INTO site_config (config_key, config_value, description) VALUES
('site.name', 'element_17', '站点名称'),
('site.nameEn', 'ELEMENT_17', '站点英文标识'),
('site.subtitle', 'Full-Stack & Agent Engineer', '副标题'),
('site.tagline', '与有肝胆人共事 从无字句处读书。', '格言'),
('blog.desc', '记录开发实践与随笔。', '随笔简介'),
('projects.desc', '开源与个人项目。', '作品简介'),
('about.desc', '全栈 + Agent 工程师。', '关于简介'),
('contact.desc', '欢迎交流与留言。', '联系简介');

INSERT INTO profile_item (section, label, meta, copy_value, href, sort_order, visible) VALUES
('about', '定位', '全栈 + Agent 工程师', NULL, NULL, 1, 1),
('contact', 'Email', '6cheng6lei6@gmail.com', '6cheng6lei6@gmail.com', NULL, 1, 1),
('contact', 'GitHub', 'github.com/element-17', NULL, 'https://github.com/element-17', 2, 1);

INSERT INTO article (slug, title, tag, summary, content, status, pinned, view_count, published_at) VALUES
('hello-world', '站点上线手记', '随笔', '摘要一', '正文内容一', 'PUBLISHED', 1, 42, '2026-11-22 20:30:00'),
('agent-notes', 'LangGraph 实践笔记', 'Agent', '摘要二', '正文内容二', 'PUBLISHED', 0, 31, '2026-11-20 20:30:00'),
('draft-only-note', '未公开草稿', '随笔', '草稿摘要', '草稿正文', 'DRAFT', 0, 0, NULL);

INSERT INTO project (name, meta, description, repo_url, sort_order, visible) VALUES
('element_17-website', 'GitHub', '', 'https://github.com/element-17/element_17-website', 1, 1),
('Sight', 'GitHub', '', 'https://github.com/element-17/Sight', 2, 1),
('内部实验项目', 'Internal', '隐藏项目', NULL, 3, 0);

INSERT INTO skill_tag (name, sort_order) VALUES
('React', 1),
('TypeScript', 2),
('Spring Boot', 3),
('MySQL', 4),
('Redis', 5),
('LangGraph', 6);
