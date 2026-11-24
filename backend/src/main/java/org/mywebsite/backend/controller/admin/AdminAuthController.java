package org.mywebsite.backend.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.common.util.IpUtils;
import org.mywebsite.backend.model.dto.LoginRequest;
import org.mywebsite.backend.model.dto.PasswordUpdateRequest;
import org.mywebsite.backend.model.vo.AdminInfoVO;
import org.mywebsite.backend.model.vo.LoginVO;
import org.mywebsite.backend.security.AuthContext;
import org.mywebsite.backend.service.AuthService;
import org.springframework.web.bind.annotation.*;

@Tag(name = "AdminAuth")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/auth")
public class AdminAuthController {

    private final AuthService authService;

    @Operation(summary = "站长登录")
    @PostMapping("/login")
    public ApiResponse<LoginVO> signIn(@Valid @RequestBody LoginRequest body, HttpServletRequest http) {
        return ApiResponse.ok(authService.login(body, IpUtils.resolveClientIp(http)));
    }

    @Operation(summary = "退出登录")
    @PostMapping("/logout")
    public ApiResponse<Void> signOut() {
        authService.logout(AuthContext.get());
        return ApiResponse.ok();
    }

    @Operation(summary = "当前站长")
    @GetMapping("/me")
    public ApiResponse<AdminInfoVO> profile() {
        return ApiResponse.ok(authService.currentAdmin(AuthContext.get()));
    }

    @Operation(summary = "修改密码")
    @PutMapping("/password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody PasswordUpdateRequest body) {
        authService.updatePassword(AuthContext.get(), body);
        return ApiResponse.ok("密码已更新，请重新登录", null);
    }
}
