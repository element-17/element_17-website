package org.mywebsite.backend.model.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class SiteUpdateRequest {

    /** 站点键值对配置（仅更新传入的键） */
    private Map<String, String> configs;

    /** 可选：整体替换来历/传书条目列表 */
    @Valid
    private List<ProfileItemInput> profileItems;

    @Data
    public static class ProfileItemInput {
        @NotBlank(message = "section 不能为空")
        @Pattern(regexp = "^(about|contact)$", message = "section 仅允许 about 或 contact")
        private String section;

        @NotBlank(message = "label 不能为空")
        @Size(max = 64, message = "label 不能超过 64 字符")
        private String label;

        @NotBlank(message = "meta 不能为空")
        @Size(max = 255, message = "meta 不能超过 255 字符")
        private String meta;

        @Size(max = 255, message = "copyValue 不能超过 255 字符")
        private String copyValue;

        @Size(max = 512, message = "href 不能超过 512 字符")
        private String href;

        private Integer sortOrder = 0;

        private Boolean visible = Boolean.TRUE;
    }
}
