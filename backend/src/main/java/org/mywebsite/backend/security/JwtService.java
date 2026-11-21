package org.mywebsite.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/** HMAC-SHA256 JWT 签发与验签 */
@Component
public class JwtService {

    private final AppProperties props;
    private final SecretKey signingKey;

    public JwtService(AppProperties props) {
        this.props = props;
        byte[] keyBytes = props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret 长度必须不少于 32 字节");
        }
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public IssuedToken issue(Long adminId, String username, int tokenVersion) {
        Instant now = Instant.now();
        long expireSec = props.getJwt().getExpireSeconds();
        Instant exp = now.plusSeconds(expireSec);
        String jti = UUID.randomUUID().toString().replace("-", "");

        String token = Jwts.builder()
                .issuer(props.getJwt().getIssuer())
                .subject(username)
                .id(jti)
                .claim("uid", adminId)
                .claim("ver", tokenVersion)
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
        return new IssuedToken(token, expireSec);
    }

    public ParsedToken parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .requireIssuer(props.getJwt().getIssuer())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            Long uid = claims.get("uid", Number.class).longValue();
            Integer ver = claims.get("ver", Number.class).intValue();
            String username = claims.getSubject();
            String jti = claims.getId();
            long expMillis = claims.getExpiration().getTime();
            return new ParsedToken(uid, username, jti, ver, expMillis);
        } catch (JwtException | IllegalArgumentException | NullPointerException ex) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "无效或已过期的登录凭证");
        }
    }

    public record IssuedToken(String token, long expiresInSeconds) {
    }

    public record ParsedToken(Long adminId, String username, String jti, int tokenVersion, long expiresAtMillis) {
    }
}
