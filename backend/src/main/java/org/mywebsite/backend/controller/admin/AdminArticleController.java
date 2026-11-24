package org.mywebsite.backend.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.common.api.PageResult;
import org.mywebsite.backend.model.dto.ArticleSaveRequest;
import org.mywebsite.backend.model.dto.ArticleStatusRequest;
import org.mywebsite.backend.model.vo.ArticleDetailVO;
import org.mywebsite.backend.model.vo.ArticleSummaryVO;
import org.mywebsite.backend.service.ArticleService;
import org.springframework.web.bind.annotation.*;

@Tag(name = "AdminArticle")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/articles")
public class AdminArticleController {

    private final ArticleService articleService;

    @Operation(summary = "文章分页查询（含草稿）")
    @GetMapping
    public ApiResponse<PageResult<ArticleSummaryVO>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false) String keyword
    ) {
        return ApiResponse.ok(articleService.listAdmin(page, size, status, tag, keyword));
    }

    @Operation(summary = "按 ID 获取文章编辑详情")
    @GetMapping("/{id}")
    public ApiResponse<ArticleDetailVO> detail(@PathVariable Long id) {
        return ApiResponse.ok(articleService.getAdminDetail(id));
    }

    @Operation(summary = "新建文章")
    @PostMapping
    public ApiResponse<ArticleDetailVO> create(@Valid @RequestBody ArticleSaveRequest body) {
        return ApiResponse.ok(articleService.create(body));
    }

    @Operation(summary = "更新文章")
    @PutMapping("/{id}")
    public ApiResponse<ArticleDetailVO> update(@PathVariable Long id, @Valid @RequestBody ArticleSaveRequest body) {
        return ApiResponse.ok(articleService.update(id, body));
    }

    @Operation(summary = "更新发布状态或置顶")
    @PatchMapping("/{id}/status")
    public ApiResponse<ArticleDetailVO> patchStatus(
            @PathVariable Long id,
            @Valid @RequestBody ArticleStatusRequest body
    ) {
        return ApiResponse.ok(articleService.updateStatus(id, body));
    }

    @Operation(summary = "删除文章")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> remove(@PathVariable Long id) {
        articleService.delete(id);
        return ApiResponse.ok();
    }
}
