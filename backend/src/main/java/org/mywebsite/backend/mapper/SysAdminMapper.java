package org.mywebsite.backend.mapper;

import org.apache.ibatis.annotations.Param;
import org.mywebsite.backend.model.entity.SysAdmin;

import java.time.LocalDateTime;

public interface SysAdminMapper {

    long countAll();

    SysAdmin findById(@Param("id") Long id);

    SysAdmin findByUsername(@Param("username") String username);

    int insert(SysAdmin admin);

    int updateLastLogin(@Param("id") Long id, @Param("lastLoginAt") LocalDateTime lastLoginAt);

    int updatePasswordAndBumpVersion(@Param("id") Long id, @Param("passwordHash") String passwordHash);
}
