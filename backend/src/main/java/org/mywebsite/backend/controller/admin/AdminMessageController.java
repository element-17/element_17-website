package org.mywebsite.backend.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.model.dto.MessageReadRequest;
import org.mywebsite.backend.model.vo.MessagePageVO;
import org.mywebsite.backend.service.MessageService;
import org.springframework.web.bind.annotation.*;

@Tag(name = "AdminMessage")
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/messages")
public class AdminMessageController {

    private final MessageService messageService;

    @Operation(summary = "分页查看访客传书留言")
    @GetMapping
    public ApiResponse<MessagePageVO> inbox(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) Boolean isRead
    ) {
        return ApiResponse.ok(messageService.listAdmin(page, size, isRead));
    }

    @Operation(summary = "标记留言已读或未读")
    @PatchMapping("/{id}/read")
    public ApiResponse<Void> toggleRead(@PathVariable Long id, @Valid @RequestBody MessageReadRequest body) {
        messageService.markRead(id, Boolean.TRUE.equals(body.getRead()));
        return ApiResponse.ok();
    }

    @Operation(summary = "删除留言")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> remove(@PathVariable Long id) {
        messageService.delete(id);
        return ApiResponse.ok();
    }
}
