package org.mywebsite.backend.config;

import lombok.extern.slf4j.Slf4j;
import org.mywebsite.backend.mapper.SysAdminMapper;
import org.mywebsite.backend.model.entity.SysAdmin;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** 首次启动时若站长表为空，幂等创建初始管理员账号（BCrypt 加密） */
@Slf4j
@Component
public class AdminInitializer implements ApplicationRunner {

    private final SysAdminMapper adminMapper;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;

    public AdminInitializer(SysAdminMapper adminMapper, PasswordEncoder passwordEncoder, AppProperties props) {
        this.adminMapper = adminMapper;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminMapper.countAll() > 0) {
            return;
        }
        SysAdmin admin = new SysAdmin();
        admin.setUsername(props.getAdmin().getInitUsername());
        admin.setPasswordHash(passwordEncoder.encode(props.getAdmin().getInitPassword()));
        admin.setNickname(props.getAdmin().getInitNickname());
        admin.setTokenVersion(1);
        adminMapper.insert(admin);
        log.info("已自动初始化站长账号 username={}（生产环境请尽快修改初始密码）", admin.getUsername());
    }
}
