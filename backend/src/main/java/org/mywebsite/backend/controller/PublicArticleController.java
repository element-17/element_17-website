package org.mywebsite.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.common.api.PageResult;
import org.mywebsite.backend.common.util.IpUtils;
import org.mywebsite.backend.model.vo.ArticleDetailVO;
import org.mywebsite.backend.model.vo.ArticleSummaryVO;
import org.mywebsite.backend.model.vo.TagCountVO;
import org.mywebsite.backend.service.ArticleService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "公开 · 藏卷（博客）")
@RestController
@RequestMapping("/api/v1/articles")
public class PublicArticleController {

    private final ArticleService articleService;

    public PublicArticleController(ArticleService articleService) {
        this.articleService = articleService;
    }

    @Operation(summary = "已发布文章分页列表（支持按标签与关键词筛选）")
    @GetMapping
    public ApiResponse<PageResult<ArticleSummaryVO>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String keyword
    ) {
        return ApiResponse.ok(articleService.listPublic(page, size, tag, keyword));
    }

    @Operation(summary = "已发布文章标签及篇数统计（Redis 缓存）")
    @GetMapping("/tags")
    public ApiResponse<List<TagCountVO>> tags() {
        return ApiResponse.ok(articleService.listPublicTags());
    }

    @Operation(summary = "按 slug 获取文章详情（Redis 热点缓存 + 阅读量防刷计数）")
    @GetMapping("/{slug}")
    public ApiResponse<ArticleDetailVO> detail(@PathVariable String slug, HttpServletRequest request) {
        String ip = IpUtils.resolveClientIp(request);
        return ApiResponse.ok(articleService.getPublicDetail(slug, ip));
    }
}
