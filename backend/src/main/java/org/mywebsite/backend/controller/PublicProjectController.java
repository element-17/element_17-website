package org.mywebsite.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.model.vo.ProjectVO;
import org.mywebsite.backend.service.ProjectService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "公开 · 铸剑（作品集）")
@RestController
@RequestMapping("/api/v1/projects")
public class PublicProjectController {

    private final ProjectService projectService;

    public PublicProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @Operation(summary = "获取公开展示的作品列表（Redis 缓存）")
    @GetMapping
    public ApiResponse<List<ProjectVO>> list() {
        return ApiResponse.ok(projectService.listPublic());
    }
}
