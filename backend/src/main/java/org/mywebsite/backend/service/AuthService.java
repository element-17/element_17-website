package org.mywebsite.backend.service;

import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.mapper.SysAdminMapper;
import org.mywebsite.backend.model.dto.LoginRequest;
import org.mywebsite.backend.model.dto.PasswordUpdateRequest;
import org.mywebsite.backend.model.entity.SysAdmin;
import org.mywebsite.backend.model.vo.AdminInfoVO;
import org.mywebsite.backend.model.vo.LoginVO;
import org.mywebsite.backend.security.AuthContext;
import org.mywebsite.backend.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class AuthService {

    private final SysAdminMapper adminMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RedisCacheService cacheService;

    public AuthService(
            SysAdminMapper adminMapper,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            RedisCacheService cacheService
    ) {
        this.adminMapper = adminMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.cacheService = cacheService;
    }

    public LoginVO login(LoginRequest req, String clientIp) {
        String username = req.getUsername().trim();
        if (cacheService.isLoginLocked(username, clientIp)) {
            throw new BizException(ErrorCode.TOO_MANY_REQUESTS, "密码连续错误次数过多，请 15 分钟后再试");
        }

        SysAdmin admin = adminMapper.findByUsername(username);
        if (admin == null || !passwordEncoder.matches(req.getPassword(), admin.getPasswordHash())) {
            cacheService.recordLoginFailure(username, clientIp);
            throw new BizException(ErrorCode.INVALID_CREDENTIALS);
        }

        cacheService.clearLoginFailures(username, clientIp);
        adminMapper.updateLastLogin(admin.getId(), LocalDateTime.now());
        cacheService.cacheTokenVersion(admin.getId(), admin.getTokenVersion());

        JwtService.IssuedToken issued = jwtService.issue(admin.getId(), admin.getUsername(), admin.getTokenVersion());
        return new LoginVO(
                issued.token(),
                "Bearer",
                issued.expiresInSeconds(),
                new AdminInfoVO(admin.getId(), admin.getUsername(), admin.getNickname())
        );
    }

    public void logout(AuthContext.Principal principal) {
        long remain = principal.expiresAtMillis() - System.currentTimeMillis();
        cacheService.blacklistToken(principal.jti(), remain);
    }

    public AdminInfoVO currentAdmin(AuthContext.Principal principal) {
        SysAdmin admin = adminMapper.findById(principal.adminId());
        if (admin == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        return new AdminInfoVO(admin.getId(), admin.getUsername(), admin.getNickname());
    }

    @Transactional
    public void updatePassword(AuthContext.Principal principal, PasswordUpdateRequest req) {
        SysAdmin admin = adminMapper.findById(principal.adminId());
        if (admin == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        if (!passwordEncoder.matches(req.getOldPassword(), admin.getPasswordHash())) {
            throw new BizException(ErrorCode.BAD_REQUEST, "原密码不正确");
        }
        String newHash = passwordEncoder.encode(req.getNewPassword());
        adminMapper.updatePasswordAndBumpVersion(admin.getId(), newHash);
        int nextVersion = admin.getTokenVersion() + 1;
        cacheService.cacheTokenVersion(admin.getId(), nextVersion);
        logout(principal);
    }
}
