package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MessageCreateRequest {

    @NotBlank(message = "称呼不能为空")
    @Size(min = 1, max = 64, message = "称呼长度需在 1 ~ 64 字符之间")
    private String nickname;

    @Email(message = "邮箱格式不正确")
    @Size(max = 128, message = "邮箱长度不能超过 128 字符")
    private String email;

    @NotBlank(message = "留言内容不能为空")
    @Size(min = 2, max = 1000, message = "留言内容需在 2 ~ 1000 字符之间")
    private String content;
}
