package org.mywebsite.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

@Data
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Admin admin = new Admin();
    private Cors cors = new Cors();
    private Cache cache = new Cache();
    private RateLimit rateLimit = new RateLimit();

    @Data
    public static class Jwt {
        private String secret;
        private long expireSeconds = 86400;
        private String issuer = "element17";
    }

    @Data
    public static class Admin {
        private String initUsername = "admin";
        private String initPassword = "Admin@2026ChangeMe";
        private String initNickname = "element_17";
    }

    @Data
    public static class Cors {
        private String allowedOrigins = "http://localhost:5173,http://127.0.0.1:5173";

        public List<String> originList() {
            return Arrays.stream(allowedOrigins.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
        }
    }

    @Data
    public static class Cache {
        private long defaultTtlSeconds = 1800;
        private long nullTtlSeconds = 120;
        private long viewUvTtlSeconds = 600;
    }

    @Data
    public static class RateLimit {
        private long messageCooldownSeconds = 30;
        private long messageWindowSeconds = 600;
        private long messageWindowMax = 5;
        private long loginFailWindowSeconds = 900;
        private long loginFailMax = 5;
    }
}
