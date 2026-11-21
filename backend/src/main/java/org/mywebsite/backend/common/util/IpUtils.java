package org.mywebsite.backend.common.util;

import jakarta.servlet.http.HttpServletRequest;

/** 客户端真实 IP 提取工具（兼容反向代理透传头） */
public final class IpUtils {

    private IpUtils() {
    }

    public static String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String first = xff.split(",")[0].trim();
            if (!first.isBlank()) {
                return truncate(first, 64);
            }
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return truncate(realIp.trim(), 64);
        }
        String remote = request.getRemoteAddr();
        return remote == null ? "unknown" : truncate(remote, 64);
    }

    public static String truncate(String s, int maxLen) {
        if (s == null) {
            return null;
        }
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }
}
