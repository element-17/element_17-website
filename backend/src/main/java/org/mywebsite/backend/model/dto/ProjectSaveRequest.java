package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ProjectSaveRequest {

    @NotBlank(message = "作品名称不能为空")
    @Size(max = 128, message = "作品名称不能超过 128 字符")
    private String name;

    @Size(max = 128, message = "技术简标不能超过 128 字符")
    private String meta = "";

    @Size(max = 500, message = "作品简介不能超过 500 字符")
    private String description = "";

    @Size(max = 512, message = "访问链接不能超过 512 字符")
    private String url;

    @Size(max = 512, message = "仓库链接不能超过 512 字符")
    private String repoUrl;

    private Integer sortOrder = 0;

    private Boolean visible = Boolean.TRUE;
}
