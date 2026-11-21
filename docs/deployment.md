# 开发联调与部署指南

## 1. 环境前置要求

- **JDK 21**（项目目标版本为 Java 21）
- **Maven 3.9+**（或直接使用 `backend/mvnw` / `backend/mvnw.cmd`）
- **Docker Desktop**（用于一键启动本地 MySQL 8.4 与 Redis 7），或本机自行安装 MySQL 8+ 与 Redis 7+

---

## 2. 一键启动本地数据库与 Redis

仓库根目录已提供 `docker-compose.yml`，首次启动会自动挂载执行：
1. `backend/sql/schema.sql`（建表）
2. `backend/sql/seed.sql`（写入与前端一致的初始站点文案、示例文章与作品）

```bash
# 启动 MySQL (3306) + Redis (6379)
docker compose up -d

# 查看健康状态
docker compose ps

# 如需清空数据重新初始化
docker compose down -v && docker compose up -d
```

> 若使用本机已安装的 MySQL，请先创建数据库 `CREATE DATABASE lone_blade CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`，再依次导入 `backend/sql/schema.sql` 和 `backend/sql/seed.sql`。

---

## 3. 启动后端服务与运行测试

```bash
cd backend

# 运行全部单元测试与基于 H2(MySQL模式) 的 MyBatis 集成测试
./mvnw test

# 本地启动（默认端口 8080）
./mvnw spring-boot:run

# 打包可执行 JAR
./mvnw clean package -DskipTests
java -jar target/backend-0.0.1-SNAPSHOT.jar
```

启动后验证：
- 健康检查：`GET http://localhost:8080/api/v1/health`
- Swagger UI：`http://localhost:8080/swagger-ui.html`
- 默认开发站长账号：`admin` / `LoneBlade@2026`（首次启动若 `sys_admin` 表为空则自动创建，可通过环境变量覆盖）

---

## 4. 环境变量清单

全部敏感项在 `backend/src/main/resources/application.yaml` 中均有本地开发默认值，**生产环境务必通过环境变量注入**：

| 环境变量 | 本地默认值 | 说明 |
| --- | --- | --- |
| `SERVER_PORT` | `8080` | 后端监听端口 |
| `DB_HOST` | `127.0.0.1` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_NAME` | `lone_blade` | 数据库名 |
| `DB_USER` | `loneblade` | MySQL 用户名 |
| `DB_PASSWORD` | `loneblade123` | MySQL 密码 |
| `REDIS_HOST` | `127.0.0.1` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | `loneblade_redis` | Redis 密码（若本机未设密码可置空） |
| `JWT_SECRET` | 开发内置 64 字符密钥 | **生产必须替换为随机 ≥32 字节密钥** |
| `JWT_EXPIRE_SECONDS` | `86400` | JWT 有效期（秒，默认 24 小时） |
| `ADMIN_INIT_USERNAME` | `admin` | 首次启动自动创建的站长账号 |
| `ADMIN_INIT_PASSWORD` | `LoneBlade@2026` | **首次上线前务必替换或登录后立即修改** |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许跨域的前端域名（逗号分隔） |

---

## 5. 生产部署安全清单

1. **必须替换** `JWT_SECRET`、`DB_PASSWORD`、`REDIS_PASSWORD`、`ADMIN_INIT_PASSWORD`。
2. `CORS_ALLOWED_ORIGINS` 收窄为实际线上域名（如 `https://yourdomain.com`）。
3. 通过 Nginx / Caddy 配置 HTTPS 反向代理 `/api/` 到后端 `8080`，并透传 `X-Real-IP` / `X-Forwarded-For` 以保证留言限流与登录锁定的来源 IP 准确。
4. 生产建议关闭在线 Swagger UI：`SPRINGDOC_SWAGGER_UI_ENABLED=false`、`SPRINGDOC_API_DOCS_ENABLED=false`。
