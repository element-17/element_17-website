package org.mywebsite.backend.model.vo;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.mywebsite.backend.common.api.PageResult;
import org.mywebsite.backend.model.entity.GuestMessage;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
public class MessagePageVO extends PageResult<GuestMessage> {

    private long unreadCount;

    public static MessagePageVO of(List<GuestMessage> records, long total, int page, int size, long unreadCount) {
        MessagePageVO vo = new MessagePageVO();
        vo.setRecords(records);
        vo.setTotal(total);
        vo.setPage(page);
        vo.setSize(size);
        vo.setPages(size <= 0 ? 0 : (total + size - 1) / size);
        vo.setUnreadCount(unreadCount);
        return vo;
    }
}
