# RESTful 接口文档（v1）

- **Base URL**：`http://localhost:8080/api/v1`
- **编码与格式**：统一 `application/json; charset=UTF-8`
- **在线调试**：启动后端后访问 `http://localhost:8080/swagger-ui.html`
- **管理端鉴权**：除 `POST /api/v1/admin/auth/login` 外，所有 `/api/v1/admin/**` 接口需携带请求头：
  ```http
  Authorization: Bearer <JWT_TOKEN>
  ```

---

## 1. 统一响应规范

### 1.1 标准响应包装 `ApiResponse<T>`

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "timestamp": 1795251600000
}
```

### 1.2 分页结构 `PageResult<T>`

```json
{
  "records": [],
  "total": 12,
  "page": 1,
  "size": 10,
  "pages": 2
}
```

### 1.3 业务错误码

| 业务码 `code` | HTTP Status | 含义 |
| --- | --- | --- |
| `0` | 200 | 成功 |
| `40001` | 400 | 请求参数校验失败（`message` 含具体字段提示） |
| `40002` | 400 | 业务状态冲突（如 `slug` 已存在、标签重复） |
| `40101` | 401 | 未登录 / Token 缺失、无效、过期或已被注销 |
| `40102` | 401 | 用户名或密码错误 |
| `40401` | 404 | 请求的资源不存在（文章、作品、留言） |
| `42901` | 429 | 触发频率限制（传书留言过于频繁 / 登录错误次数过多被锁定） |
| `50000` | 500 | 服务器内部异常 |

---

## 2. 公开接口（前台站点）

### 2.1 健康检查

- **GET** `/api/v1/health`
- 返回当前服务、MySQL、Redis 连通状态。

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "UP",
    "mysql": "UP",
    "redis": "UP"
  },
  "timestamp": 1795251600000
}
```

---

### 2.2 站点总览配置（归处 / 来历 / 传书基础信息 / 技能标签）

- **GET** `/api/v1/site`
- **缓存**：Redis `loneblade:site:overview`（TTL 30m）

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "site": {
      "name": "孤剑夜行",
      "nameEn": "LONE BLADE",
      "subtitle": "A Developer's World",
      "tagline": "十年磨一剑，霜刃未曾试。"
    },
    "descriptions": {
      "blog": "夜读千卷，落笔成锋。围炉展卷，记下技术思考与踩过的每一个坑。",
      "projects": "每一个作品，都是亲手锻打的一柄剑。",
      "about": "一名前端开发者。信奉少即是多，偏爱干净的代码与克制的设计。白天写码，夜里看星。",
      "contact": "山高路远，飞鸽可达。欢迎交流技术、合作或闲聊江湖二三事。"
    },
    "aboutItems": [
      { "id": 1, "label": "所在", "meta": "江湖 · 远程", "copyValue": null, "href": null },
      { "id": 2, "label": "所长", "meta": "前端交互 / 动效 / 图形与工程化", "copyValue": null, "href": null }
    ],
    "contactItems": [
      { "id": 4, "label": "Email", "meta": "hello@example.com", "copyValue": "hello@example.com", "href": null },
      { "id": 5, "label": "GitHub", "meta": "github.com/yourname", "copyValue": null, "href": "https://github.com/yourname" }
    ],
    "skills": ["React", "TypeScript", "Three.js", "SCSS", "GSAP", "Vite"]
  },
  "timestamp": 1795251600000
}
```

---

### 2.3 藏卷：公开文章列表

- **GET** `/api/v1/articles`
- 仅返回 `status = PUBLISHED`，按 `pinned DESC, published_at DESC` 排序。

**Query 参数**：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | int | `1` | 页码（≥ 1） |
| `size` | int | `10` | 每页条数（1 ~ 50） |
| `tag` | string | 可选 | 按标签精确筛选 |
| `keyword` | string | 可选 | 按标题/摘要模糊搜索 |

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "records": [
      {
        "id": 1,
        "slug": "css-3d-camera",
        "title": "用 CSS matrix3d 把 DOM 贴进三维世界",
        "tag": "图形交互",
        "summary": "不往 WebGL 里塞文字网格，借单应矩阵把普通 HTML 严丝合缝铺到 3D 卷面上。",
        "pinned": true,
        "viewCount": 128,
        "publishedAt": "2026-10-18 21:00:00"
      }
    ],
    "total": 3,
    "page": 1,
    "size": 10,
    "pages": 1
  },
  "timestamp": 1795251600000
}
```

---

### 2.4 藏卷：公开文章标签统计

- **GET** `/api/v1/articles/tags`
- **缓存**：Redis `loneblade:article:tags`（TTL 30m）

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "tag": "图形交互", "count": 1 },
    { "tag": "类型体操", "count": 1 },
    { "tag": "性能调优", "count": 1 }
  ],
  "timestamp": 1795251600000
}
```

---

### 2.5 藏卷：文章详情（含 Redis 阅读量计数）

- **GET** `/api/v1/articles/{slug}`
- **缓存与计数**：详情主体走 Redis `loneblade:article:detail:{slug}`，阅读量叠加 `loneblade:article:views` 增量；同 IP 10 分钟内防刷去重。

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": 1,
    "slug": "css-3d-camera",
    "title": "用 CSS matrix3d 把 DOM 贴进三维世界",
    "tag": "图形交互",
    "summary": "不往 WebGL 里塞文字网格，借单应矩阵把普通 HTML 严丝合缝铺到 3D 卷面上。",
    "content": "在 Three.js 场景里渲染可读的中文长列表往往左右为难...\n\n更轻巧的做法是...",
    "externalUrl": null,
    "pinned": true,
    "viewCount": 129,
    "publishedAt": "2026-10-18 21:00:00",
    "updatedAt": "2026-10-18 21:00:00"
  },
  "timestamp": 1795251600000
}
```

---

### 2.6 铸剑：公开作品列表

- **GET** `/api/v1/projects`
- **缓存**：Redis `loneblade:projects:public`（TTL 30m）

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 1,
      "name": "孤剑夜行 · 3D 个人站",
      "meta": "Three.js / React",
      "description": "暮色河畔的一方营地，低开销 WebGL 场景与古卷投影交互。",
      "url": null,
      "repoUrl": "https://github.com/element-17/element_17-website",
      "sortOrder": 1
    }
  ],
  "timestamp": 1795251600000
}
```

---

### 2.7 传书：访客提交留言（飞鸽传书）

- **POST** `/api/v1/messages`
- **限流**：同 IP 30 秒内最多 1 次，10 分钟内最多 5 次（超限返回 HTTP `429` / `code: 42901`）。

**请求体**：
```json
{
  "nickname": "过客青衫",
  "email": "guest@example.com",
  "content": "篝火旁那卷古卷的交互很有意境，特来传书致意。"
}
```

**字段校验**：
- `nickname`：必填，1 ~ 64 字符
- `email`：可选，若填写需符合邮箱格式且 ≤ 128 字符
- `content`：必填，2 ~ 1000 字符

**响应示例**：
```json
{
  "code": 0,
  "message": "飞鸽已启程",
  "data": { "id": 101 },
  "timestamp": 1795251600000
}
```

---

## 3. 后台管理接口（`/api/v1/admin/**`）

### 3.1 认证模块

#### 登录
- **POST** `/api/v1/admin/auth/login`（无需 Token；连续错误 5 次锁定 15 分钟）

**请求体**：
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**响应示例**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "tokenType": "Bearer",
    "expiresInSeconds": 86400,
    "admin": {
      "id": 1,
      "username": "admin",
      "nickname": "孤剑"
    }
  },
  "timestamp": 1795251600000
}
```

#### 退出登录
- **POST** `/api/v1/admin/auth/logout`（需 Token）
- 将当前 JWT 的 `jti` 写入 Redis 黑名单直至原过期时间。

#### 获取当前管理员
- **GET** `/api/v1/admin/auth/me`（需 Token）

#### 修改密码
- **PUT** `/api/v1/admin/auth/password`（需 Token）

```json
{
  "oldPassword": "current-password",
  "newPassword": "new-strong-password-123"
}
```
修改成功后自增 `token_version`，历史所有 Token 立即失效，需重新登录。

---

### 3.2 藏卷文章管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/articles` | 分页列表（参数：`page`, `size`, `status`, `tag`, `keyword`） |
| `GET` | `/api/v1/admin/articles/{id}` | 按 ID 获取编辑态详情（含实时阅读量） |
| `POST` | `/api/v1/admin/articles` | 创建文章（自动清缓存） |
| `PUT` | `/api/v1/admin/articles/{id}` | 更新文章（自动清旧/新 slug 缓存） |
| `PATCH` | `/api/v1/admin/articles/{id}/status` | 修改发布状态或置顶状态 |
| `DELETE` | `/api/v1/admin/articles/{id}` | 删除文章（同步清理缓存与未落库计数） |

**创建/更新请求体**：
```json
{
  "slug": "webgl-perf-notes",
  "title": "写给自己的 WebGL 前端性能手记",
  "tag": "性能调优",
  "summary": "如何把 500+ draw call 压到两位数。",
  "content": "正文支持 Markdown 或纯文本段落...",
  "externalUrl": null,
  "status": "PUBLISHED",
  "pinned": false
}
```

**修改状态请求体（`PATCH /status`）**：
```json
{
  "status": "PUBLISHED",
  "pinned": true
}
```

---

### 3.3 铸剑作品与技能管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/projects` | 获取全部作品（含隐藏项） |
| `POST` | `/api/v1/admin/projects` | 新增作品（清缓存） |
| `PUT` | `/api/v1/admin/projects/{id}` | 更新作品（清缓存） |
| `DELETE` | `/api/v1/admin/projects/{id}` | 删除作品（清缓存） |
| `PUT` | `/api/v1/admin/skills` | 整体替换技能标签列表（按数组顺序排序，清缓存） |

**新增/更新作品请求体**：
```json
{
  "name": "孤剑夜行 · 3D 个人站",
  "meta": "Three.js / React",
  "description": "暮色河畔的一方营地，低开销 WebGL 场景与古卷投影交互。",
  "url": "https://example.com",
  "repoUrl": "https://github.com/element-17/element_17-website",
  "sortOrder": 1,
  "visible": true
}
```

**批量更新技能标签请求体**：
```json
{
  "skills": ["React", "TypeScript", "Three.js", "Spring Boot", "MySQL", "Redis"]
}
```

---

### 3.4 站点配置 & 来历/传书条目管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/site` | 获取完整配置与全部条目（含隐藏条目） |
| `PUT` | `/api/v1/admin/site` | 更新站点键值与来历/传书条目列表（事务更新并清缓存） |

**更新请求体示例**：
```json
{
  "configs": {
    "site.name": "孤剑夜行",
    "site.nameEn": "LONE BLADE",
    "site.subtitle": "A Developer's World",
    "site.tagline": "十年磨一剑，霜刃未曾试。",
    "blog.desc": "夜读千卷，落笔成锋。",
    "projects.desc": "每一个作品，都是亲手锻打的一柄剑。",
    "about.desc": "一名前端开发者，白天写码，夜里看星。",
    "contact.desc": "山高路远，飞鸽可达。"
  },
  "profileItems": [
    { "section": "about", "label": "所在", "meta": "江湖 · 远程", "sortOrder": 1, "visible": true },
    { "section": "contact", "label": "Email", "meta": "hello@example.com", "copyValue": "hello@example.com", "sortOrder": 1, "visible": true },
    { "section": "contact", "label": "GitHub", "meta": "github.com/element-17", "href": "https://github.com/element-17", "sortOrder": 2, "visible": true }
  ]
}
```

---

### 3.5 传书留言箱管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/messages` | 分页列表（参数：`page`, `size`, `isRead`；附带 `unreadCount`） |
| `PATCH` | `/api/v1/admin/messages/{id}/read` | 标记已读/未读（请求体 `{"read": true}`） |
| `DELETE` | `/api/v1/admin/messages/{id}` | 删除留言 |
