package org.mywebsite.backend.model.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class GuestMessage {
    private Long id;
    private String nickname;
    private String email;
    private String content;
    private String ipAddress;
    private String userAgent;
    private Boolean isRead;
    private LocalDateTime createdAt;
}
