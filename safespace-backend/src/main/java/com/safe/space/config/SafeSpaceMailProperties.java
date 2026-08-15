package com.safe.space.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Custom configuration properties for SafeSpace mail system.
 * Eliminates IDE warnings for 'safespace.mail' properties in application.yaml.
 */
@Configuration
@ConfigurationProperties(prefix = "safespace.mail")
@Getter
@Setter
public class SafeSpaceMailProperties {

    /** From email address (e.g. noreply@safespace.edu.ph). */
    private String fromAddress = "noreply@safespace.edu.ph";

    /** From name display (e.g. SafeSpace System). */
    private String fromName = "SafeSpace System";

    /** Frontend application base URL for links in emails. */
    private String appUrl = "http://localhost:5173";

    /** Whether mail sending is enabled. */
    private boolean enabled = true;
}
