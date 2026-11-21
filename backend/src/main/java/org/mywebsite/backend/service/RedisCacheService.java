package org.mywebsite.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.mywebsite.backend.config.AppProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Redis 统一访问封装：
 * - Cache-Aside 缓存（带随机 TTL 抖动防雪崩 + 空值占位防穿透）
 * - 文章阅读量增量 Hash 与防刷去重
 * - JWT 黑名单与 tokenVersion 缓存
 * - 访客留言限流 & 登录失败计数
 * Redis 短暂不可用时记录告警并自动降级，避免拖垮只读接口。
 */
@Slf4j
@Service
public class RedisCacheService {

    public static final String KEY_SITE_OVERVIEW = "loneblade:site:overview";
    public static final String KEY_PROJECTS_PUBLIC = "loneblade:projects:public";
    public static final String KEY_ARTICLE_TAGS = "loneblade:article:tags";
    public static final String KEY_ARTICLE_VIEWS = "loneblade:article:views";

    private static final String PREFIX_ARTICLE_DETAIL = "loneblade:article:detail:";
    private static final String PREFIX_ARTICLE_UV = "loneblade:article:uv:";
    private static final String PREFIX_AUTH_BLACKLIST = "loneblade:auth:blacklist:";
    private static final String PREFIX_AUTH_VER = "loneblade:auth:ver:";
    private static final String PREFIX_AUTH_FAIL = "loneblade:auth:fail:";
    private static final String PREFIX_MSG_COOLDOWN = "loneblade:ratelimit:msg:cd:";
    private static final String PREFIX_MSG_WINDOW = "loneblade:ratelimit:msg:win:";
    private static final String NULL_SENTINEL = "__NULL__";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AppProperties props;

    public RedisCacheService(StringRedisTemplate redis, ObjectMapper objectMapper, AppProperties props) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.props = props;
    }

    public static String articleDetailKey(String slug) {
        return PREFIX_ARTICLE_DETAIL + slug;
    }

    // ---------- 通用 JSON 缓存 ----------

    public <T> CacheLookup<T> get(String key, Class<T> clazz) {
        try {
            String raw = redis.opsForValue().get(key);
            if (raw == null) {
                return CacheLookup.miss();
            }
            if (NULL_SENTINEL.equals(raw)) {
                return CacheLookup.hitNull();
            }
            return CacheLookup.hit(objectMapper.readValue(raw, clazz));
        } catch (Exception ex) {
            log.warn("Redis get 失败，自动降级直连库 key={}: {}", key, ex.getMessage());
            return CacheLookup.miss();
        }
    }

    public <T> Optional<T> get(String key, TypeReference<T> typeRef) {
        try {
            String raw = redis.opsForValue().get(key);
            if (raw == null || NULL_SENTINEL.equals(raw)) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(raw, typeRef));
        } catch (Exception ex) {
            log.warn("Redis get(TypeReference) 失败 key={}: {}", key, ex.getMessage());
            return Optional.empty();
        }
    }

    public void set(String key, Object value) {
        long jitter = ThreadLocalRandom.current().nextLong(0, 121);
        set(key, value, Duration.ofSeconds(props.getCache().getDefaultTtlSeconds() + jitter));
    }

    public void set(String key, Object value, Duration ttl) {
        try {
            String json = objectMapper.writeValueAsString(value);
            redis.opsForValue().set(key, json, ttl);
        } catch (Exception ex) {
            log.warn("Redis set 失败 key={}: {}", key, ex.getMessage());
        }
    }

    public void setNull(String key) {
        try {
            redis.opsForValue().set(key, NULL_SENTINEL, Duration.ofSeconds(props.getCache().getNullTtlSeconds()));
        } catch (Exception ex) {
            log.warn("Redis setNull 失败 key={}: {}", key, ex.getMessage());
        }
    }

    public void delete(String... keys) {
        try {
            for (String k : keys) {
                if (k != null && !k.isBlank()) {
                    redis.delete(k);
                }
            }
        } catch (Exception ex) {
            log.warn("Redis delete 失败: {}", ex.getMessage());
        }
    }

    // ---------- 文章阅读量增量缓冲与防刷 ----------

    /** 同 IP 在冷却期内只记一次有效阅读，返回累加后的待落库增量 */
    public long recordArticleView(String slug, String clientIp) {
        try {
            String uvKey = PREFIX_ARTICLE_UV + slug + ":" + clientIp;
            Boolean fresh = redis.opsForValue().setIfAbsent(
                    uvKey, "1", Duration.ofSeconds(props.getCache().getViewUvTtlSeconds()));
            if (Boolean.TRUE.equals(fresh)) {
                Long after = redis.opsForHash().increment(KEY_ARTICLE_VIEWS, slug, 1L);
                return after == null ? 0L : after;
            }
            return getArticleViewDelta(slug);
        } catch (Exception ex) {
            log.warn("Redis recordArticleView 失败 slug={}: {}", slug, ex.getMessage());
            return 0L;
        }
    }

    public long getArticleViewDelta(String slug) {
        try {
            Object v = redis.opsForHash().get(KEY_ARTICLE_VIEWS, slug);
            return v == null ? 0L : Long.parseLong(v.toString());
        } catch (Exception ex) {
            return 0L;
        }
    }

    public Map<String, Long> getAllArticleViewDeltas() {
        try {
            Map<Object, Object> entries = redis.opsForHash().entries(KEY_ARTICLE_VIEWS);
            if (entries.isEmpty()) {
                return Collections.emptyMap();
            }
            Map<String, Long> result = new HashMap<>(entries.size());
            for (Map.Entry<Object, Object> e : entries.entrySet()) {
                long delta = Long.parseLong(e.getValue().toString());
                if (delta > 0) {
                    result.put(e.getKey().toString(), delta);
                }
            }
            return result;
        } catch (Exception ex) {
            log.warn("Redis getAllArticleViewDeltas 失败: {}", ex.getMessage());
            return Collections.emptyMap();
        }
    }

    public void deductArticleViewDelta(String slug, long flushed) {
        try {
            Long remain = redis.opsForHash().increment(KEY_ARTICLE_VIEWS, slug, -flushed);
            if (remain != null && remain <= 0) {
                redis.opsForHash().delete(KEY_ARTICLE_VIEWS, slug);
            }
        } catch (Exception ex) {
            log.warn("Redis deductArticleViewDelta 失败 slug={}: {}", slug, ex.getMessage());
        }
    }

    public void removeArticleViewDelta(String slug) {
        try {
            redis.opsForHash().delete(KEY_ARTICLE_VIEWS, slug);
        } catch (Exception ex) {
            log.warn("Redis removeArticleViewDelta 失败 slug={}: {}", slug, ex.getMessage());
        }
    }

    // ---------- 认证黑名单 / tokenVersion / 登录防爆破 ----------

    public void blacklistToken(String jti, long remainingMillis) {
        if (remainingMillis <= 0) {
            return;
        }
        try {
            redis.opsForValue().set(PREFIX_AUTH_BLACKLIST + jti, "1", Duration.ofMillis(remainingMillis));
        } catch (Exception ex) {
            log.warn("Redis blacklistToken 失败: {}", ex.getMessage());
        }
    }

    public boolean isTokenBlacklisted(String jti) {
        try {
            return Boolean.TRUE.equals(redis.hasKey(PREFIX_AUTH_BLACKLIST + jti));
        } catch (Exception ex) {
            log.warn("Redis isTokenBlacklisted 失败: {}", ex.getMessage());
            return false;
        }
    }

    public Optional<Integer> getCachedTokenVersion(Long adminId) {
        try {
            String v = redis.opsForValue().get(PREFIX_AUTH_VER + adminId);
            return v == null ? Optional.empty() : Optional.of(Integer.parseInt(v));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    public void cacheTokenVersion(Long adminId, int version) {
        try {
            redis.opsForValue().set(PREFIX_AUTH_VER + adminId, String.valueOf(version), Duration.ofHours(24));
        } catch (Exception ex) {
            log.warn("Redis cacheTokenVersion 失败: {}", ex.getMessage());
        }
    }

    public boolean isLoginLocked(String username, String ip) {
        try {
            String v = redis.opsForValue().get(PREFIX_AUTH_FAIL + username + ":" + ip);
            return v != null && Long.parseLong(v) >= props.getRateLimit().getLoginFailMax();
        } catch (Exception ex) {
            return false;
        }
    }

    public long recordLoginFailure(String username, String ip) {
        try {
            String key = PREFIX_AUTH_FAIL + username + ":" + ip;
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redis.expire(key, Duration.ofSeconds(props.getRateLimit().getLoginFailWindowSeconds()));
            }
            return count == null ? 0L : count;
        } catch (Exception ex) {
            return 0L;
        }
    }

    public void clearLoginFailures(String username, String ip) {
        delete(PREFIX_AUTH_FAIL + username + ":" + ip);
    }

    // ---------- 传书留言两级 IP 限流 ----------

    /** 返回 true 表示放行，false 表示超限 */
    public boolean allowGuestMessage(String ip) {
        try {
            String cdKey = PREFIX_MSG_COOLDOWN + ip;
            Boolean acquiredCooldown = redis.opsForValue().setIfAbsent(
                    cdKey, "1", Duration.ofSeconds(props.getRateLimit().getMessageCooldownSeconds()));
            if (!Boolean.TRUE.equals(acquiredCooldown)) {
                return false;
            }
            String winKey = PREFIX_MSG_WINDOW + ip;
            Long count = redis.opsForValue().increment(winKey);
            if (count != null && count == 1L) {
                redis.expire(winKey, Duration.ofSeconds(props.getRateLimit().getMessageWindowSeconds()));
            }
            return count == null || count <= props.getRateLimit().getMessageWindowMax();
        } catch (Exception ex) {
            log.warn("Redis allowGuestMessage 失败，降级放行: {}", ex.getMessage());
            return true;
        }
    }

    /** 健康探活 */
    public boolean ping() {
        try {
            var factory = redis.getConnectionFactory();
            if (factory == null) {
                return false;
            }
            try (var conn = factory.getConnection()) {
                return "PONG".equalsIgnoreCase(conn.ping());
            }
        } catch (Exception ex) {
            return false;
        }
    }

    public record CacheLookup<T>(boolean hit, T value) {
        public static <T> CacheLookup<T> hit(T value) {
            return new CacheLookup<>(true, value);
        }

        public static <T> CacheLookup<T> hitNull() {
            return new CacheLookup<>(true, null);
        }

        public static <T> CacheLookup<T> miss() {
            return new CacheLookup<>(false, null);
        }
    }
}
