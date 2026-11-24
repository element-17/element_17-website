package org.mywebsite.backend.model.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginVO {
    private String token;
    private String tokenType;
    private long expiresInSeconds;
    private AdminInfoVO admin;
}
