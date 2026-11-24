package org.mywebsite.backend.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.model.dto.ProjectSaveRequest;
import org.mywebsite.backend.model.dto.SkillsUpdateRequest;
import org.mywebsite.backend.model.vo.ProjectVO;
import org.mywebsite.backend.service.ProjectService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "AdminProject")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin")
public class AdminProjectController {

    private final ProjectService projectService;

    @Operation(summary = "获取全部作品（含隐藏）")
    @GetMapping("/projects")
    public ApiResponse<List<ProjectVO>> all() {
        return ApiResponse.ok(projectService.listAdmin());
    }

    @Operation(summary = "新增作品")
    @PostMapping("/projects")
    public ApiResponse<ProjectVO> add(@Valid @RequestBody ProjectSaveRequest body) {
        return ApiResponse.ok(projectService.create(body));
    }

    @Operation(summary = "编辑作品")
    @PutMapping("/projects/{id}")
    public ApiResponse<ProjectVO> edit(@PathVariable Long id, @Valid @RequestBody ProjectSaveRequest body) {
        return ApiResponse.ok(projectService.update(id, body));
    }

    @Operation(summary = "删除作品")
    @DeleteMapping("/projects/{id}")
    public ApiResponse<Void> remove(@PathVariable Long id) {
        projectService.delete(id);
        return ApiResponse.ok();
    }

    @Operation(summary = "批量覆盖技能标签")
    @PutMapping("/skills")
    public ApiResponse<List<String>> replaceSkills(@Valid @RequestBody SkillsUpdateRequest body) {
        return ApiResponse.ok(projectService.replaceSkills(body));
    }
}
