package org.mywebsite.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.service.RedisCacheService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.LinkedHashMap;
import java.util.Map;

@Tag(name = "系统健康检查")
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    private final DataSource dataSource;
    private final RedisCacheService cacheService;

    public HealthController(DataSource dataSource, RedisCacheService cacheService) {
        this.dataSource = dataSource;
        this.cacheService = cacheService;
    }

    @Operation(summary = "服务与数据库/Redis 连通探活")
    @GetMapping("/health")
    public ApiResponse<Map<String, String>> health() {
        boolean mysqlUp = checkMysql();
        boolean redisUp = cacheService.ping();
        Map<String, String> body = new LinkedHashMap<>();
        body.put("status", mysqlUp ? "UP" : "DEGRADED");
        body.put("mysql", mysqlUp ? "UP" : "DOWN");
        body.put("redis", redisUp ? "UP" : "DOWN");
        return ApiResponse.ok(body);
    }

    private boolean checkMysql() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(2);
        } catch (Exception ex) {
            return false;
        }
    }
}
