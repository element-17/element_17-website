package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.SiteConfig;

import java.util.List;

public interface SiteConfigMapper {

    List<SiteConfig> findAll();

    int updateValue(@Param("configKey") String configKey, @Param("configValue") String configValue);

    int insert(SiteConfig config);
}
