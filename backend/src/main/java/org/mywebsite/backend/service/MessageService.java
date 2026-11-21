package org.mywebsite.backend.service;

import org.mywebsite.backend.common.api.ErrorCode;
import org.mywebsite.backend.common.exception.BizException;
import org.mywebsite.backend.common.util.IpUtils;
import org.mywebsite.backend.mapper.GuestMessageMapper;
import org.mywebsite.backend.model.dto.MessageCreateRequest;
import org.mywebsite.backend.model.entity.GuestMessage;
import org.mywebsite.backend.model.vo.MessagePageVO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class MessageService {

    private final GuestMessageMapper messageMapper;
    private final RedisCacheService cacheService;

    public MessageService(GuestMessageMapper messageMapper, RedisCacheService cacheService) {
        this.messageMapper = messageMapper;
        this.cacheService = cacheService;
    }

    @Transactional
    public Long submit(MessageCreateRequest req, String clientIp, String userAgent) {
        if (!cacheService.allowGuestMessage(clientIp)) {
            throw new BizException(ErrorCode.TOO_MANY_REQUESTS, "传书过于频繁，请稍候片刻再试");
        }
        GuestMessage msg = new GuestMessage();
        msg.setNickname(req.getNickname().trim());
        msg.setEmail(req.getEmail() == null || req.getEmail().isBlank() ? null : req.getEmail().trim());
        msg.setContent(req.getContent().trim());
        msg.setIpAddress(IpUtils.truncate(clientIp, 64));
        msg.setUserAgent(IpUtils.truncate(userAgent, 255));
        msg.setIsRead(Boolean.FALSE);
        messageMapper.insert(msg);
        return msg.getId();
    }

    public MessagePageVO listAdmin(int page, int size, Boolean isRead) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        int offset = (safePage - 1) * safeSize;
        long total = messageMapper.countPage(isRead);
        long unread = messageMapper.countUnread();
        List<GuestMessage> records = total == 0 ? List.of() : messageMapper.selectPage(isRead, offset, safeSize);
        return MessagePageVO.of(records, total, safePage, safeSize, unread);
    }

    @Transactional
    public void markRead(Long id, boolean read) {
        if (messageMapper.findById(id) == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "留言不存在");
        }
        messageMapper.updateRead(id, read);
    }

    @Transactional
    public void delete(Long id) {
        if (messageMapper.findById(id) == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "留言不存在");
        }
        messageMapper.deleteById(id);
    }
}
