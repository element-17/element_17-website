package org.mywebsite.backend.model.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ProfileItem {
    private Long id;
    private String section;
    private String label;
    private String meta;
    private String copyValue;
    private String href;
    private Integer sortOrder;
    private Boolean visible;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
