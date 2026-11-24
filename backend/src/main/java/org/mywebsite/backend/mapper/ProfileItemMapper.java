package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.ProfileItem;

import java.util.List;

public interface ProfileItemMapper {

    List<ProfileItem> findVisible();

    List<ProfileItem> findAll();

    int deleteAll();

    int insertBatch(@Param("items") List<ProfileItem> items);
}
