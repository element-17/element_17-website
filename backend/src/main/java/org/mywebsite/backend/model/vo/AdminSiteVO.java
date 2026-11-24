package org.mywebsite.backend.model.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.mywebsite.backend.model.entity.ProfileItem;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdminSiteVO {
    private Map<String, String> configs;
    private List<ProfileItem> profileItems;
    private List<String> skills;
}
