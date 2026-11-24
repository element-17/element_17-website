package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.SkillTag;

import java.util.List;

public interface SkillTagMapper {

    List<SkillTag> findAllOrdered();

    int deleteAll();

    int insertBatch(@Param("tags") List<SkillTag> tags);
}
