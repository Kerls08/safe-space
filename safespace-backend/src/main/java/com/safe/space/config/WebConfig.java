package com.safe.space.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC configuration.
 *
 * Registers:
 * 1. CORS policy — allows frontend origins to access /api/**
 * 2. RBAC Interceptor — enforces authentication & authorization on /api/**
 *
 * The interceptor ONLY applies to /api/** paths.
 * Static resources (HTML, CSS, JS) are served without authentication.
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

        private final AuthInterceptor authInterceptor;

        @Override
        public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                                .allowedOriginPatterns("*")
                                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                                .allowedHeaders("*")
                                .allowCredentials(true)
                                .maxAge(3600);
        }

        @Override
        public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(authInterceptor)
                                .addPathPatterns("/api/**") // Only intercept API routes
                                .excludePathPatterns(
                                                "/api/auth/login", // Public — login
                                                "/api/auth/logout", // Public — logout
                                                "/api/auth/validate-token" // Public — token validation
                                );
        }
}
