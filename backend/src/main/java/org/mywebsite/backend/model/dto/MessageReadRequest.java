package org.mywebsite.backend.model.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MessageReadRequest {

    @NotNull(message = "read 字段不能为空")
    private Boolean read;
}
