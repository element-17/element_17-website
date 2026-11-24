package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class SkillsUpdateRequest {

    @NotNull(message = "技能标签列表不能为空")
    @Size(max = 50, message = "技能标签最多 50 个")
    private List<@NotBlank(message = "标签名不能为空") @Size(max = 64, message = "标签名不能超过 64 字符") String> skills;
}
