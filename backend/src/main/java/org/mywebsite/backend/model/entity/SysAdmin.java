package org.mywebsite.backend.model.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SysAdmin {
    private Long id;
    private String username;
    private String passwordHash;
    private String nickname;
    private Integer tokenVersion;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
