package org.mywebsite.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "BearerAuth";

    @Bean
    public OpenAPI siteOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("element_17 · 个人网站后端 API")
                        .version("v1")
                        .description("随笔（博客）、作品集、站点配置与在线留言接口（Spring Boot + MyBatis + MySQL + Redis）"))
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(new Components().addSecuritySchemes(
                        BEARER_SCHEME,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("通过 POST /api/v1/admin/auth/login 获取的 JWT Token")
                ));
    }
}
