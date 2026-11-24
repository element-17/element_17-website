package org.mywebsite.backend.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.model.dto.SiteUpdateRequest;
import org.mywebsite.backend.model.vo.AdminSiteVO;
import org.mywebsite.backend.service.SiteService;
import org.springframework.web.bind.annotation.*;

@Tag(name = "AdminSite")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/site")
public class AdminSiteController {

    private final SiteService siteService;

    @Operation(summary = "读取完整站点与条目配置")
    @GetMapping
    public ApiResponse<AdminSiteVO> load() {
        return ApiResponse.ok(siteService.getAdminSite());
    }

    @Operation(summary = "保存站点与来历/传书配置")
    @PutMapping
    public ApiResponse<AdminSiteVO> save(@Valid @RequestBody SiteUpdateRequest body) {
        return ApiResponse.ok(siteService.updateSite(body));
    }
}
