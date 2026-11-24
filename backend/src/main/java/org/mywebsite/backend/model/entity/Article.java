package org.mywebsite.backend.model.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Article {
    private Long id;
    private String slug;
    private String title;
    private String tag;
    private String summary;
    private String content;
    private String externalUrl;
    private String status;
    private Boolean pinned;
    private Long viewCount;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
