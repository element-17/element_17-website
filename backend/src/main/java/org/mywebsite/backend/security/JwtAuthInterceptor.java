package org.mywebsite.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.mapper.SysAdminMapper;
import org.mywebsite.backend.model.entity.SysAdmin;
import org.mywebsite.backend.service.RedisCacheService;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** 校验后台管理接口的 Bearer JWT、Redis 黑名单与 tokenVersion */
@Component
public class JwtAuthInterceptor implements HandlerInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final RedisCacheService cacheService;
    private final SysAdminMapper adminMapper;

    public JwtAuthInterceptor(JwtService jwtService, RedisCacheService cacheService, SysAdminMapper adminMapper) {
        this.jwtService = jwtService;
        this.cacheService = cacheService;
        this.adminMapper = adminMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith(BEARER_PREFIX)) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "缺少 Authorization Bearer 令牌");
        }
        String token = header.substring(BEARER_PREFIX.length()).trim();
        JwtService.ParsedToken parsed = jwtService.parse(token);

        if (cacheService.isTokenBlacklisted(parsed.jti())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "登录凭证已注销，请重新登录");
        }

        int currentVersion = cacheService.getCachedTokenVersion(parsed.adminId())
                .orElseGet(() -> {
                    SysAdmin admin = adminMapper.findById(parsed.adminId());
                    if (admin == null) {
                        throw new BizException(ErrorCode.UNAUTHORIZED, "账号不存在");
                    }
                    cacheService.cacheTokenVersion(admin.getId(), admin.getTokenVersion());
                    return admin.getTokenVersion();
                });

        if (parsed.tokenVersion() != currentVersion) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "密码已变更，请重新登录");
        }

        AuthContext.set(new AuthContext.Principal(
                parsed.adminId(), parsed.username(), parsed.jti(), parsed.expiresAtMillis()));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        AuthContext.clear();
    }
}
