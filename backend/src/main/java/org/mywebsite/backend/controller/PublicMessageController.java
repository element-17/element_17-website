package org.mywebsite.backend.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.mywebsite.backend.common.api.ApiResponse;
import org.mywebsite.backend.common.util.IpUtils;
import org.mywebsite.backend.model.dto.MessageCreateRequest;
import org.mywebsite.backend.service.MessageService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Tag(name = "公开 · 传书（访客留言）")
@RestController
@RequestMapping("/api/v1/messages")
public class PublicMessageController {

    private final MessageService messageService;

    public PublicMessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @Operation(summary = "提交飞鸽传书留言（带 Redis IP 防刷限流）")
    @PostMapping
    public ApiResponse<Map<String, Long>> submit(
            @Valid @RequestBody MessageCreateRequest req,
            HttpServletRequest request
    ) {
        String ip = IpUtils.resolveClientIp(request);
        String ua = request.getHeader("User-Agent");
        Long id = messageService.submit(req, ip, ua);
        return ApiResponse.ok("飞鸽已启程", Map.of("id", id));
    }
}
