package org.mywebsite.backend.security;

/** 当前请求已认证管理员上下文（ThreadLocal，请求结束由拦截器清理） */
public final class AuthContext {

    private static final ThreadLocal<Principal> HOLDER = new ThreadLocal<>();

    private AuthContext() {
    }

    public static void set(Principal principal) {
        HOLDER.set(principal);
    }

    public static Principal get() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }

    public record Principal(Long adminId, String username, String jti, long expiresAtMillis) {
    }
}
