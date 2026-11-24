# 孤剑夜行 · 开发文档总览

本目录存放 **「孤剑夜行（Lone Blade）」个人网站** 的全套开发与接口文档，覆盖系统架构、MySQL/Redis 数据设计、RESTful 接口契约与本地/生产部署方案。

## 文档导航

| 文档 | 内容说明 |
| --- | --- |
| [架构与开发规范](./architecture.md) | 系统分层、包目录结构、缓存策略、JWT 鉴权、限流与统一异常处理规范 |
| [数据库与 Redis 设计](./database.md) | MySQL 8 ER 图、全部表 DDL 字段与索引说明、Redis Key 命名与 TTL 策略 |
| [RESTful 接口文档（v1）](./api.md) | 前台公开接口 + 后台管理接口的完整路径、校验规则、请求/响应 JSON 示例与错误码 |
| [开发联调与部署指南](./deployment.md) | Docker Compose 一键启 MySQL/Redis、Maven 启停、环境变量与上线安全清单 |

## 技术栈一览

- **前端（`frontend/`，分支 `frontend`）**：React 19 + TypeScript + Vite 8 + Three.js + GSAP + SCSS
- **后端（`backend/`，分支 `backend`）**：Java 21 + Spring Boot 4.1.2 + MyBatis 4.1.0 + MySQL 8.4 + Redis 7 + JJWT + SpringDoc OpenAPI
- **本地基础设施**：根目录 `docker-compose.yml`（MySQL 8.4 + Redis 7 Alpine，自动初始化建表与示例种子数据）

## 仓库分支约定

仓库地址：`https://github.com/element-17/my-website.git`

- `main`：主干分支
- `frontend`：前端独立开发分支（`frontend/`）
- `backend`：后端与文档独立开发分支（`docs/`、`docker-compose.yml`、`backend/`）

## 快速启动（本地开发）

```bash
# 1. 在仓库根目录启动 MySQL 8 + Redis 7（自动执行建表与初始化数据）
docker compose up -d

# 2. 启动 Spring Boot 后端（默认端口 8080）
cd backend
./mvnw spring-boot:run

# 3. 访问健康检查与在线 OpenAPI 文档
# Health:     http://localhost:8080/api/v1/health
# Swagger UI: http://localhost:8080/swagger-ui.html
```
