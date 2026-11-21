package org.mywebsite.backend.model.vo;

import lombok.Data;

@Data
public class ProjectVO {
    private Long id;
    private String name;
    private String meta;
    private String description;
    private String url;
    private String repoUrl;
    private Integer sortOrder;
    private Boolean visible;
}
