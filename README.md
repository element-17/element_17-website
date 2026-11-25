<div align="center">

# element_17 · Personal Website

**3D 交互式全栈个人网站（Full-Stack & Agent Engineer）**

*基于 React 19 + Three.js + Spring Boot 4 构建的个人站点，整合 WebGL 3D 交互场景、技术博客、开源作品展示与访客留言系统。*

[![Build & Deploy](https://img.shields.io/github/actions/workflow/status/element-17/element_17-website/deploy.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=Build%20%26%20Deploy)](https://github.com/element-17/element_17-website/actions/workflows/deploy.yml)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-WebGL%203D-000000?style=flat-square&logo=threedotjs&logoColor=white)
![GSAP](https://img.shields.io/badge/GSAP-Animation-88CE02?style=flat-square&logo=greensock&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1-6DB33F?style=flat-square&logo=springboot&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.4-DC382D?style=flat-square&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-F7DF1E?style=flat-square)](LICENSE)

</div>

---

## 站内模块

站点通过一块实时渲染的 **Three.js 3D 场景** 串联起五个页面，切换模块时由 GSAP 驱动镜头平滑过渡，所有文章、项目与留言内容均由后端 API 实时提供：

| 模块 | 锚点 | 说明 |
| :--- | :--- | :--- |
| `00` **首页** | `#home` | 3D 交互主场景、个人简介与站点总览 |
| `01` **随笔** | `#blog` | 技术文章列表与弹窗阅读（Markdown 安全渲染 + 实时阅读量） |
| `02` **作品** | `#projects` | 开源项目与全栈 / Agent 代表作品展示 |
| `03` **关于** | `#about` | 个人履历、技术栈与方向介绍 |
| `04` **联系** | `#contact` | 访客留言板与外部联系方式 |

---

## 核心特性

### 3D 场景与前端体验
- **程序化 WebGL 场景**：基于 Three.js 搭建实时 3D 夜景环境与自定义 GLSL 水面倒影着色器，配合 GSAP 实现多机位镜头切换与鼠标视差。
- **渲染性能与兼容**：`three` 独立异步拆包降低首屏阻塞；支持 **低 / 中 / 高** 三档自适应画质、页面切后台自动暂停渲染、`prefers-reduced-motion` 减动效适配、WebGL 不可用纯 CSS 降级以及明暗主题切换。
- **便捷交互**：支持底部导航、键盘 `←` / `→` 切换、数字键 `1`～`5` 直达与 URL Hash 定位分享。

### 全栈后端与工程实践
- **缓存与阅读量缓冲**：采用 Redis Cache-Aside 策略（随机抖动 TTL 防雪崩、空值占位防穿透、Redis 异常自动降级直连 MySQL）；文章阅读量经 Redis IP 10 分钟 UV 去重与 Hash 缓冲后，由 `@Scheduled` 定时批量回写 MySQL。
- **鉴权与安全防护**：后台管理基于 JWT（HMAC-SHA256）+ BCrypt，支持 `jti` 黑名单即时登出与 `tokenVersion` 改密全端失效；访客留言与登录接口均配置 Redis IP 限流防刷。
- **按需 CI/CD 部署**：GitHub Actions 自动检测 `frontend/` 与 `backend/` 路径变更，按需执行构建检查与 SSH 原子替换发布。

---

## 系统架构

```mermaid
flowchart LR
    FE["前端 · React 19 + TypeScript<br/>Three.js 3D 场景 + GSAP 动效"] -->|HTTPS / REST /api/v1| API["Spring Boot 4.1 · Java 21<br/>Public & Admin Controllers"]
    API -->|JWT + jti 黑名单 + IP 限流| SVC["Service 业务层"]
    SVC <-->|Cache-Aside / 阅读量缓冲 / 限流| REDIS[("Redis 7.4")]
    SVC <-->|MyBatis Mapper| MYSQL[("MySQL 8.4")]
    JOB["@Scheduled 定时回写"] <--> REDIS
    JOB -->|批量回写 view_count| MYSQL
```

---

## 本地运行

```bash
# 1. 启动本地 MySQL 8.4 + Redis 7.4（自动初始化建表与种子数据）
docker compose up -d

# 2. 启动 Spring Boot 后端（默认端口 8080）
cd backend && ./mvnw spring-boot:run

# 3. 启动前端开发服务器（默认端口 5173）
cd frontend && npm install && npm run dev
```

---

## 延伸文档

完整的接口契约、数据库表结构与生产部署指南请参阅 [`docs/`](docs/README.md)：

- [架构与开发规范](docs/architecture.md) · [数据库与 Redis 设计](docs/database.md) · [RESTful 接口文档](docs/api.md) · [开发联调与部署指南](docs/deployment.md)

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
