package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.GuestMessage;

import java.util.List;

public interface GuestMessageMapper {

    List<GuestMessage> selectPage(
            @Param("isRead") Boolean isRead,
            @Param("offset") int offset,
            @Param("size") int size
    );

    long countPage(@Param("isRead") Boolean isRead);

    long countUnread();

    GuestMessage findById(@Param("id") Long id);

    int insert(GuestMessage message);

    int updateRead(@Param("id") Long id, @Param("isRead") boolean isRead);

    int deleteById(@Param("id") Long id);
}
