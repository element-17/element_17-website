package org.mywebsite.backend.model.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SiteConfig {
    private String configKey;
    private String configValue;
    private String description;
    private LocalDateTime updatedAt;
}
