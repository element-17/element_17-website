package org.mywebsite.backend.model.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SkillTag {
    private Long id;
    private String name;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
