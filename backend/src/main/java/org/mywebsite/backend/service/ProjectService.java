package org.mywebsite.backend.service;

import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.mapper.ProjectMapper;
import org.mywebsite.backend.mapper.SkillTagMapper;
import org.mywebsite.backend.model.dto.ProjectSaveRequest;
import org.mywebsite.backend.model.dto.SkillsUpdateRequest;
import org.mywebsite.backend.model.entity.Project;
import org.mywebsite.backend.model.entity.SkillTag;
import org.mywebsite.backend.model.vo.ProjectVO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Service
public class ProjectService {

    private final ProjectMapper projectMapper;
    private final SkillTagMapper skillTagMapper;
    private final RedisCacheService cacheService;

    public ProjectService(ProjectMapper projectMapper, SkillTagMapper skillTagMapper, RedisCacheService cacheService) {
        this.projectMapper = projectMapper;
        this.skillTagMapper = skillTagMapper;
        this.cacheService = cacheService;
    }

    public List<ProjectVO> listPublic() {
        return cacheService.get(RedisCacheService.KEY_PROJECTS_PUBLIC, new TypeReference<List<ProjectVO>>() {
        }).orElseGet(() -> {
            List<ProjectVO> list = projectMapper.findVisible().stream().map(ProjectService::toVO).toList();
            cacheService.set(RedisCacheService.KEY_PROJECTS_PUBLIC, list);
            return list;
        });
    }

    public List<ProjectVO> listAdmin() {
        return projectMapper.findAll().stream().map(ProjectService::toVO).toList();
    }

    @Transactional
    public ProjectVO create(ProjectSaveRequest req) {
        Project entity = new Project();
        applyFields(entity, req);
        projectMapper.insert(entity);
        cacheService.delete(RedisCacheService.KEY_PROJECTS_PUBLIC);
        return toVO(projectMapper.findById(entity.getId()));
    }

    @Transactional
    public ProjectVO update(Long id, ProjectSaveRequest req) {
        Project existing = projectMapper.findById(id);
        if (existing == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "作品不存在");
        }
        applyFields(existing, req);
        projectMapper.update(existing);
        cacheService.delete(RedisCacheService.KEY_PROJECTS_PUBLIC);
        return toVO(projectMapper.findById(id));
    }

    @Transactional
    public void delete(Long id) {
        if (projectMapper.findById(id) == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "作品不存在");
        }
        projectMapper.deleteById(id);
        cacheService.delete(RedisCacheService.KEY_PROJECTS_PUBLIC);
    }

    @Transactional
    public List<String> replaceSkills(SkillsUpdateRequest req) {
        // 去重保序
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String s : req.getSkills()) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) {
                unique.add(trimmed);
            }
        }
        skillTagMapper.deleteAll();
        if (!unique.isEmpty()) {
            List<SkillTag> rows = new ArrayList<>(unique.size());
            int order = 1;
            for (String name : unique) {
                SkillTag t = new SkillTag();
                t.setName(name);
                t.setSortOrder(order++);
                rows.add(t);
            }
            skillTagMapper.insertBatch(rows);
        }
        cacheService.delete(RedisCacheService.KEY_SITE_OVERVIEW);
        return List.copyOf(unique);
    }

    private static void applyFields(Project entity, ProjectSaveRequest req) {
        entity.setName(req.getName().trim());
        entity.setMeta(req.getMeta().trim());
        entity.setDescription(req.getDescription().trim());
        entity.setUrl(blankToNull(req.getUrl()));
        entity.setRepoUrl(blankToNull(req.getRepoUrl()));
        entity.setSortOrder(req.getSortOrder() == null ? 0 : req.getSortOrder());
        entity.setVisible(req.getVisible() == null ? Boolean.TRUE : req.getVisible());
    }

    private static ProjectVO toVO(Project p) {
        ProjectVO vo = new ProjectVO();
        vo.setId(p.getId());
        vo.setName(p.getName());
        vo.setMeta(p.getMeta());
        vo.setDescription(p.getDescription());
        vo.setUrl(p.getUrl());
        vo.setRepoUrl(p.getRepoUrl());
        vo.setSortOrder(p.getSortOrder());
        vo.setVisible(p.getVisible());
        return vo;
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
