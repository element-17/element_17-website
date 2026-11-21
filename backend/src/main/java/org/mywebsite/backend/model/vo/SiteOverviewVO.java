package org.mywebsite.backend.model.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SiteOverviewVO {

    private SiteMeta site;
    private Map<String, String> descriptions;
    private List<ProfileItemVO> aboutItems;
    private List<ProfileItemVO> contactItems;
    private List<String> skills;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SiteMeta {
        private String name;
        private String nameEn;
        private String subtitle;
        private String tagline;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProfileItemVO {
        private Long id;
        private String label;
        private String meta;
        private String copyValue;
        private String href;
    }
}
