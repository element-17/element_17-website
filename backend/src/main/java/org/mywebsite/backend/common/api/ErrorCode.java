package org.mywebsite.backend.common.api;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/** 统一业务错误码 */
@Getter
public enum ErrorCode {

    SUCCESS(0, HttpStatus.OK, "ok"),
    BAD_REQUEST(40001, HttpStatus.BAD_REQUEST, "请求参数不合法"),
    CONFLICT(40002, HttpStatus.BAD_REQUEST, "数据冲突或状态不允许"),
    UNAUTHORIZED(40101, HttpStatus.UNAUTHORIZED, "未登录或登录态已失效"),
    INVALID_CREDENTIALS(40102, HttpStatus.UNAUTHORIZED, "用户名或密码错误"),
    NOT_FOUND(40401, HttpStatus.NOT_FOUND, "请求的资源不存在"),
    TOO_MANY_REQUESTS(42901, HttpStatus.TOO_MANY_REQUESTS, "请求过于频繁，请稍后再试"),
    INTERNAL_ERROR(50000, HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部异常");

    private final int code;
    private final HttpStatus httpStatus;
    private final String defaultMessage;

    ErrorCode(int code, HttpStatus httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }
}
