package org.mywebsite.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.model.vo.SiteOverviewVO;
import org.mywebsite.backend.service.SiteService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "公开 · 站点配置")
@RestController
@RequestMapping("/api/v1/site")
public class PublicSiteController {

    private final SiteService siteService;

    public PublicSiteController(SiteService siteService) {
        this.siteService = siteService;
    }

    @Operation(summary = "获取站点文案、来历、联系方式与技能标签（Redis 缓存）")
    @GetMapping
    public ApiResponse<SiteOverviewVO> overview() {
        return ApiResponse.ok(siteService.getPublicOverview());
    }
}
