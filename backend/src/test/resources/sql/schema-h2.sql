CREATE TABLE IF NOT EXISTS sys_admin (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    nickname      VARCHAR(64)  NOT NULL,
    token_version INT          NOT NULL DEFAULT 1,
    last_login_at TIMESTAMP    NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_config (
    config_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
    config_value CLOB         NOT NULL,
    description  VARCHAR(128) NULL,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profile_item (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    section    VARCHAR(32)  NOT NULL,
    label      VARCHAR(64)  NOT NULL,
    meta       VARCHAR(255) NOT NULL,
    copy_value VARCHAR(255) NULL,
    href       VARCHAR(512) NULL,
    sort_order INT          NOT NULL DEFAULT 0,
    visible    TINYINT      NOT NULL DEFAULT 1,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS article (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(128) NOT NULL UNIQUE,
    title        VARCHAR(180) NOT NULL,
    tag          VARCHAR(64)  NOT NULL,
    summary      VARCHAR(500) NOT NULL,
    content      CLOB         NOT NULL,
    external_url VARCHAR(512) NULL,
    status       VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
    pinned       TINYINT      NOT NULL DEFAULT 0,
    view_count   BIGINT       NOT NULL DEFAULT 0,
    published_at TIMESTAMP    NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    meta        VARCHAR(128) NOT NULL,
    description VARCHAR(500) NOT NULL,
    url         VARCHAR(512) NULL,
    repo_url    VARCHAR(512) NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    visible     TINYINT      NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_tag (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(64) NOT NULL UNIQUE,
    sort_order INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_message (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nickname   VARCHAR(64)  NOT NULL,
    email      VARCHAR(128) NULL,
    content    CLOB         NOT NULL,
    ip_address VARCHAR(64)  NOT NULL,
    user_agent VARCHAR(255) NULL,
    is_read    TINYINT      NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
