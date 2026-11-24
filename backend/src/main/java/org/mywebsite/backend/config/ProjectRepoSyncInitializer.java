package org.mywebsite.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.mywebsite.backend.mapper.ProjectMapper;
import org.mywebsite.backend.model.entity.Project;
import org.mywebsite.backend.service.RedisCacheService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 启动时幂等同步已改名的 GitHub 仓库项目记录（避免生产库已有旧数据时仅更新 seed.sql 不生效），
 * 并在发生更新时清理作品公开列表缓存。
 */
@Slf4j
@Component
public class ProjectRepoSyncInitializer implements ApplicationRunner {

    static final String OLD_NAME = "my-website";
    static final String NEW_NAME = "element_17-website";
    static final String OLD_REPO_URL = "https://github.com/element-17/my-website";
    static final String NEW_REPO_URL = "https://github.com/element-17/element_17-website";

    private final ProjectMapper projectMapper;
    private final RedisCacheService cacheService;

    public ProjectRepoSyncInitializer(ProjectMapper projectMapper, RedisCacheService cacheService) {
        this.projectMapper = projectMapper;
        this.cacheService = cacheService;
    }

    @Override
    public void run(ApplicationArguments args) {
        syncRenamedRepos();
    }

    public int syncRenamedRepos() {
        int updated = 0;
        for (Project project : projectMapper.findAll()) {
            boolean changed = false;
            boolean matchedTargetRepo = false;

            if (matchesRepoUrl(project.getRepoUrl(), OLD_REPO_URL)) {
                project.setRepoUrl(NEW_REPO_URL);
                changed = true;
                matchedTargetRepo = true;
            } else if (matchesRepoUrl(project.getRepoUrl(), NEW_REPO_URL)) {
                matchedTargetRepo = true;
            }

            if (matchesRepoUrl(project.getUrl(), OLD_REPO_URL)) {
                project.setUrl(NEW_REPO_URL);
                changed = true;
                matchedTargetRepo = true;
            } else if (matchesRepoUrl(project.getUrl(), NEW_REPO_URL)) {
                matchedTargetRepo = true;
            }

            if (matchedTargetRepo && OLD_NAME.equals(project.getName())) {
                project.setName(NEW_NAME);
                changed = true;
            }

            if (changed) {
                projectMapper.update(project);
                updated++;
            }
        }

        if (updated > 0) {
            cacheService.delete(RedisCacheService.KEY_PROJECTS_PUBLIC);
            log.info("已同步已改名的作品仓库记录：{} -> {}（共更新 {} 条并清理作品缓存）",
                    OLD_NAME, NEW_NAME, updated);
        }
        return updated;
    }

    private static boolean matchesRepoUrl(String url, String target) {
        if (url == null || url.isBlank()) {
            return false;
        }
        String normalized = url.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.endsWith(".git")) {
            normalized = normalized.substring(0, normalized.length() - 4);
        }
        return target.equalsIgnoreCase(normalized);
    }
}
