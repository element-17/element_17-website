package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.Project;

import java.util.List;

public interface ProjectMapper {

    List<Project> findVisible();

    List<Project> findAll();

    Project findById(@Param("id") Long id);

    int insert(Project project);

    int update(Project project);

    int deleteById(@Param("id") Long id);
}
