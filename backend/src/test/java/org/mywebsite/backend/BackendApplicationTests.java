package org.mywebsite.backend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mywebsite.backend.service.ArticleService;
import org.mywebsite.backend.service.RedisCacheService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 全链路集成测试：Spring Boot + MyBatis XML + H2(MySQL 模式) + 内存版 RedisCacheService。
 * 验证公开查询、阅读量防刷计数与落库、传书限流、JWT 登录/鉴权/登出黑名单、CRUD 缓存失效。
 */
@SpringBootTest
@ActiveProfiles("test")
class BackendApplicationTests {

    @Autowired
    private WebApplicationContext wac;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ArticleService articleService;

    @Autowired
    private InMemoryRedisCacheService fakeRedis;

    private MockMvc mockMvc;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(wac).build();
        fakeRedis.resetRateLimits();
    }

    @Test
    void publicSiteProjectsAndArticlesWork() throws Exception {
        mockMvc.perform(get("/api/v1/site"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.site.name").value("孤剑夜行"))
                .andExpect(jsonPath("$.data.skills", hasSize(4)))
                .andExpect(jsonPath("$.data.contactItems", hasSize(2)));

        mockMvc.perform(get("/api/v1/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].name").value("孤剑夜行 · 3D 个人站"));

        // 公开列表不应暴露草稿
        mockMvc.perform(get("/api/v1/articles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.records[0].slug").value("css-3d-camera"));

        // 标签筛选
        mockMvc.perform(get("/api/v1/articles").param("tag", "类型体操"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.records[0].slug").value("ts-type-craft"));

        // 草稿不允许从公开详情访问
        mockMvc.perform(get("/api/v1/articles/draft-only-note"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(40401));
    }

    @Test
    void articleViewCountDeduplicatesAndFlushesToDb() throws Exception {
        // 同一 IP 连续访问只涨 1 次（初始 42 -> 43）
        mockMvc.perform(get("/api/v1/articles/css-3d-camera").header("X-Real-IP", "10.0.0.1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewCount").value(43));

        mockMvc.perform(get("/api/v1/articles/css-3d-camera").header("X-Real-IP", "10.0.0.1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewCount").value(43));

        // 换一个 IP 访问再涨 1 次（43 -> 44）
        mockMvc.perform(get("/api/v1/articles/css-3d-camera").header("X-Real-IP", "10.0.0.2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewCount").value(44));

        // 触发定时落库任务后，数据库基数变为 44，再读依然是 44
        articleService.flushViewCountsToDb();
        mockMvc.perform(get("/api/v1/articles/css-3d-camera").header("X-Real-IP", "10.0.0.1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.viewCount").value(44));
    }

    @Test
    void guestMessageValidationAndRateLimitWork() throws Exception {
        // 缺少正文应返回 40001
        mockMvc.perform(post("/api/v1/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"青衫\",\"content\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40001));

        // 首次提交成功
        mockMvc.perform(post("/api/v1/messages")
                        .header("X-Real-IP", "203.0.113.9")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"过客青衫\",\"email\":\"guest@example.com\",\"content\":\"古卷交互很雅致，特来传书。\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").isNumber());

        // 同 IP 冷却期内再次提交触发 429
        mockMvc.perform(post("/api/v1/messages")
                        .header("X-Real-IP", "203.0.113.9")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"过客青衫\",\"content\":\"短时间内连发第二条\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value(42901));
    }

    @Test
    void adminJwtLifecycleAndCrudFlowWork() throws Exception {
        // 无 Token 访问管理接口被拦截
        mockMvc.perform(get("/api/v1/admin/messages"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));

        // 错密码登录失败
        mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"wrong-pass\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40102));

        // 正确登录拿到 JWT
        MvcResult loginRes = mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"TestPassword@2026\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andReturn();

        JsonNode root = objectMapper.readTree(loginRes.getResponse().getContentAsString());
        String token = root.path("data").path("token").asText();

        // /me 正常返回
        mockMvc.perform(get("/api/v1/admin/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.username").value("admin"));

        // 后台新建一篇已发布文章并从公开接口读出
        String createBody = """
                {
                  "slug": "springboot-mybatis-notes",
                  "title": "Spring Boot 与 MyBatis 实战笔记",
                  "tag": "后端架构",
                  "summary": "记录个人站后端从零到一的设计要点。",
                  "content": "使用 MyBatis XML + Redis Cache-Aside 与阅读量异步落库。",
                  "status": "PUBLISHED",
                  "pinned": false
                }
                """;
        MvcResult created = mockMvc.perform(post("/api/v1/admin/articles")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slug").value("springboot-mybatis-notes"))
                .andReturn();

        long createdId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/api/v1/articles/springboot-mybatis-notes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Spring Boot 与 MyBatis 实战笔记"));

        // 删除刚创建的测试文章
        mockMvc.perform(delete("/api/v1/admin/articles/" + createdId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // 退出登录后旧 Token 被 Redis 黑名单拒绝
        mockMvc.perform(post("/api/v1/admin/auth/logout")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/admin/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
    }

    @Test
    void adminProjectSkillSiteMessageAndOpenApiWork() throws Exception {
        // 登录获取令牌
        MvcResult loginRes = mockMvc.perform(post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"TestPassword@2026\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String token = objectMapper.readTree(loginRes.getResponse().getContentAsString())
                .path("data").path("token").asText();

        // 新增作品 -> 公开接口立刻可见（缓存已清理） -> 删除恢复
        MvcResult createdProj = mockMvc.perform(post("/api/v1/admin/projects")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"青霜剑\",\"meta\":\"Java / Redis\",\"description\":\"测试铸剑作品\",\"sortOrder\":9,\"visible\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("青霜剑"))
                .andReturn();
        long projId = objectMapper.readTree(createdProj.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/api/v1/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].name", hasItem("青霜剑")));

        mockMvc.perform(delete("/api/v1/admin/projects/" + projId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // 批量更新技能标签 -> 公开站点总览同步更新
        mockMvc.perform(put("/api/v1/admin/skills")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"skills\":[\"React\",\"Spring Boot\",\"MyBatis\",\"Redis\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(4)));

        mockMvc.perform(get("/api/v1/site"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.skills", hasItem("MyBatis")));

        // 更新站点文案
        mockMvc.perform(put("/api/v1/admin/site")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"configs\":{\"site.tagline\":\"夜泊孤舟，剑鸣星河。\"}}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/site"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.site.tagline").value("夜泊孤舟，剑鸣星河。"));

        // 访客留言 -> 后台查看并标记已读
        MvcResult msgRes = mockMvc.perform(post("/api/v1/messages")
                        .header("X-Real-IP", "198.51.100.42")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"竹林客\",\"content\":\"请教后端架构细节\"}"))
                .andExpect(status().isOk())
                .andReturn();
        long msgId = objectMapper.readTree(msgRes.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(get("/api/v1/admin/messages").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount", greaterThanOrEqualTo(1)));

        mockMvc.perform(patch("/api/v1/admin/messages/" + msgId + "/read")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"read\":true}"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/v1/admin/messages/" + msgId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // OpenAPI 3 文档正常暴露
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.openapi").exists())
                .andExpect(jsonPath("$.paths['/api/v1/articles']").exists());
    }

    @TestConfiguration
    static class TestRedisConfig {
        @Bean
        @Primary
        InMemoryRedisCacheService inMemoryRedisCacheService(ObjectMapper mapper, org.mywebsite.backend.config.AppProperties props) {
            return new InMemoryRedisCacheService(mapper, props);
        }
    }

    /** 测试环境下的内存版 RedisCacheService，不依赖外部 Redis 进程即可完整验证缓存/黑名单/计数/限流逻辑 */
    static class InMemoryRedisCacheService extends RedisCacheService {
        private final ObjectMapper mapper;
        private final Map<String, String> kv = new ConcurrentHashMap<>();
        private final Map<String, Long> views = new ConcurrentHashMap<>();
        private final Set<String> uv = ConcurrentHashMap.newKeySet();
        private final Set<String> blacklist = ConcurrentHashMap.newKeySet();
        private final Map<Long, Integer> versions = new ConcurrentHashMap<>();
        private final Map<String, AtomicInteger> msgCounts = new ConcurrentHashMap<>();
        private final Set<String> msgCooldown = ConcurrentHashMap.newKeySet();
        private final Map<String, AtomicInteger> loginFails = new ConcurrentHashMap<>();

        InMemoryRedisCacheService(ObjectMapper mapper, org.mywebsite.backend.config.AppProperties props) {
            super(null, mapper, props);
            this.mapper = mapper;
        }

        void resetRateLimits() {
            msgCooldown.clear();
            msgCounts.clear();
            loginFails.clear();
        }

        @Override
        public <T> CacheLookup<T> get(String key, Class<T> clazz) {
            String raw = kv.get(key);
            if (raw == null) return CacheLookup.miss();
            if ("__NULL__".equals(raw)) return CacheLookup.hitNull();
            return CacheLookup.hit(mapper.readValue(raw, clazz));
        }

        @Override
        public <T> Optional<T> get(String key, tools.jackson.core.type.TypeReference<T> typeRef) {
            String raw = kv.get(key);
            if (raw == null || "__NULL__".equals(raw)) return Optional.empty();
            return Optional.of(mapper.readValue(raw, typeRef));
        }

        @Override
        public void set(String key, Object value, Duration ttl) {
            kv.put(key, mapper.writeValueAsString(value));
        }

        @Override
        public void setNull(String key) {
            kv.put(key, "__NULL__");
        }

        @Override
        public void delete(String... keys) {
            for (String k : keys) {
                if (k != null) kv.remove(k);
            }
        }

        @Override
        public long recordArticleView(String slug, String clientIp) {
            if (uv.add(slug + ":" + clientIp)) {
                return views.merge(slug, 1L, Long::sum);
            }
            return views.getOrDefault(slug, 0L);
        }

        @Override
        public long getArticleViewDelta(String slug) {
            return views.getOrDefault(slug, 0L);
        }

        @Override
        public Map<String, Long> getAllArticleViewDeltas() {
            return new HashMap<>(views);
        }

        @Override
        public void deductArticleViewDelta(String slug, long flushed) {
            views.compute(slug, (k, v) -> (v == null || v <= flushed) ? null : v - flushed);
        }

        @Override
        public void removeArticleViewDelta(String slug) {
            views.remove(slug);
        }

        @Override
        public void blacklistToken(String jti, long remainingMillis) {
            if (remainingMillis > 0) blacklist.add(jti);
        }

        @Override
        public boolean isTokenBlacklisted(String jti) {
            return blacklist.contains(jti);
        }

        @Override
        public Optional<Integer> getCachedTokenVersion(Long adminId) {
            return Optional.ofNullable(versions.get(adminId));
        }

        @Override
        public void cacheTokenVersion(Long adminId, int version) {
            versions.put(adminId, version);
        }

        @Override
        public boolean isLoginLocked(String username, String ip) {
            AtomicInteger c = loginFails.get(username + ":" + ip);
            return c != null && c.get() >= 5;
        }

        @Override
        public long recordLoginFailure(String username, String ip) {
            return loginFails.computeIfAbsent(username + ":" + ip, k -> new AtomicInteger()).incrementAndGet();
        }

        @Override
        public void clearLoginFailures(String username, String ip) {
            loginFails.remove(username + ":" + ip);
        }

        @Override
        public boolean allowGuestMessage(String ip) {
            if (!msgCooldown.add(ip)) return false;
            return msgCounts.computeIfAbsent(ip, k -> new AtomicInteger()).incrementAndGet() <= 5;
        }

        @Override
        public boolean ping() {
            return true;
        }
    }
}
