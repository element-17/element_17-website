package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class ArticleStatusRequest {

    @Pattern(regexp = "^(DRAFT|PUBLISHED)$", message = "状态仅允许 DRAFT 或 PUBLISHED")
    private String status;

    private Boolean pinned;
}
