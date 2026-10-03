package com.safe.space.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Data Transfer Objects for System Maintenance, Infrastructure Telemetry, and Diagnostics.
 */
public class SystemMaintenanceDTOs {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SystemHealthResponse {
        private JvmMetrics jvm;
        private DatabaseMetrics database;
        private EmailGatewayMetrics emailGateway;
        private MaintenanceStatus maintenance;
        private BroadcastBannerStatus broadcast;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class JvmMetrics {
        private long uptimeSeconds;
        private String uptimeFormatted;
        private String startTime;
        private long usedMemoryMb;
        private long totalMemoryMb;
        private long maxMemoryMb;
        private double memoryPercent;
        private int availableProcessors;
        private String javaVersion;
        private String osName;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DatabaseMetrics {
        private String status;
        private String databaseType;
        private long totalUsers;
        private long students;
        private long professionals;
        private long admins;
        private long activeUsers;
        private long totalPosts;
        private long totalChatSessions;
        private long totalCrisisAlerts;
        private long totalResources;
        private int activeSessionsCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class EmailGatewayMetrics {
        private boolean configured;
        private String status;
        private String senderEmail;
        private String senderName;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class MaintenanceStatus {
        private boolean active;
        private String message;
        private String estimatedEnd;
        private String enabledAt;
        private String enabledBy;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BroadcastBannerStatus {
        private boolean active;
        private String message;
        private String type; // INFO, WARNING, CRITICAL
        private String updatedAt;
        private String updatedBy;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SetMaintenanceRequest {
        private boolean active;
        private String message;
        private String estimatedEnd;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SetBroadcastRequest {
        private boolean active;
        private String message;
        private String type; // INFO, WARNING, CRITICAL
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TestEmailRequest {
        private String email;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AuditLogResponse {
        private String id;
        private String timestamp;
        private String actor;
        private String action;
        private String severity; // SUCCESS, INFO, WARN, CRITICAL
        private String details;
        private String target;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OperationResult {
        private boolean success;
        private String message;
        private long latencyMs;
        private Object data;
    }
}
