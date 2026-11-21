package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ArticleSaveRequest {

    @NotBlank(message = "文章 slug 不能为空")
    @Size(max = 128, message = "slug 不能超过 128 字符")
    @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$", message = "slug 仅支持小写字母、数字与连字符（如 webgl-perf）")
    private String slug;

    @NotBlank(message = "文章标题不能为空")
    @Size(max = 180, message = "标题不能超过 180 字符")
    private String title;

    @NotBlank(message = "文章标签不能为空")
    @Size(max = 64, message = "标签不能超过 64 字符")
    private String tag;

    @NotBlank(message = "文章摘要不能为空")
    @Size(max = 500, message = "摘要不能超过 500 字符")
    private String summary;

    @NotBlank(message = "文章正文不能为空")
    private String content;

    @Size(max = 512, message = "外链长度不能超过 512 字符")
    private String externalUrl;

    @Pattern(regexp = "^(DRAFT|PUBLISHED)$", message = "状态仅允许 DRAFT 或 PUBLISHED")
    private String status = "DRAFT";

    private Boolean pinned = Boolean.FALSE;
}
