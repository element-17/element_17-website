package org.mywebsite.backend.model.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdminInfoVO {
    private Long id;
    private String username;
    private String nickname;
}
