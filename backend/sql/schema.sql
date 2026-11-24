-- element_17 个人网站 · MySQL 8.4 建表脚本（幂等）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sys_admin (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    nickname      VARCHAR(64)  NOT NULL,
    token_version INT          NOT NULL DEFAULT 1,
    last_login_at DATETIME     NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sys_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站长账号表';

CREATE TABLE IF NOT EXISTS site_config (
    config_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
    config_value TEXT         NOT NULL,
    description  VARCHAR(128) NULL,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站点基础配置键值表';

CREATE TABLE IF NOT EXISTS profile_item (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    section    VARCHAR(32)  NOT NULL COMMENT 'about / contact',
    label      VARCHAR(64)  NOT NULL,
    meta       VARCHAR(255) NOT NULL,
    copy_value VARCHAR(255) NULL,
    href       VARCHAR(512) NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    visible    TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_profile_section_sort (section, visible, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='关于与联系条目表';

CREATE TABLE IF NOT EXISTS article (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(128) NOT NULL,
    title        VARCHAR(180) NOT NULL,
    tag          VARCHAR(64)  NOT NULL,
    summary      VARCHAR(500) NOT NULL,
    content      MEDIUMTEXT   NOT NULL,
    external_url VARCHAR(512) NULL,
    status       VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PUBLISHED',
    pinned       TINYINT(1)   NOT NULL DEFAULT 0,
    view_count   BIGINT       NOT NULL DEFAULT 0,
    published_at DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_article_slug (slug),
    KEY idx_article_pub_list (status, pinned, published_at),
    KEY idx_article_tag (status, tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='随笔文章表';

CREATE TABLE IF NOT EXISTS project (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    meta        VARCHAR(128) NOT NULL DEFAULT '',
    description VARCHAR(500) NOT NULL DEFAULT '',
    url         VARCHAR(512) NULL,
    repo_url    VARCHAR(512) NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    visible     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_project_visible_sort (visible, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='开源与个人作品表';

CREATE TABLE IF NOT EXISTS skill_tag (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(64) NOT NULL,
    sort_order INT         NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_skill_tag_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='技术栈标签表';

CREATE TABLE IF NOT EXISTS guest_message (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nickname   VARCHAR(64)  NOT NULL,
    email      VARCHAR(128) NULL,
    content    TEXT         NOT NULL,
    ip_address VARCHAR(64)  NOT NULL,
    user_agent VARCHAR(255) NULL,
    is_read    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_message_read_time (is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='访客留言表';
