package org.mywebsite.backend.common.exception;

import lombok.Getter;
import org.mywebsite.backend.common.api.ErrorCode;

/** 业务异常，交由 GlobalExceptionHandler 统一转成标准错误响应 */
@Getter
public class BizException extends RuntimeException {

    private final ErrorCode errorCode;

    public BizException(ErrorCode errorCode) {
        super(errorCode.getDefaultMessage());
        this.errorCode = errorCode;
    }

    public BizException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}
