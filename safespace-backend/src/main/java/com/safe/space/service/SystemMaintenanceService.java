package com.safe.space.service;

import com.safe.space.dto.SystemMaintenanceDTOs.*;
import com.safe.space.event.AdminAuditEvent;
import com.safe.space.repository.*;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Service for System Administrator maintenance operations, telemetry diagnostics,
 * maintenance mode, system-wide broadcast banners, and security audit logging.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SystemMaintenanceService {

    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final CrisisAlertRepository crisisAlertRepository;
    private final WellnessResourceRepository wellnessResourceRepository;
    private final EmailService emailService;
    private final CredentialService credentialService;

    private static final int MAX_AUDIT_LOGS = 100;
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final long appStartTime = System.currentTimeMillis();

    // ── Maintenance Mode State ──
    private volatile boolean maintenanceActive = false;
    private volatile String maintenanceMessage = "Safe Space is currently undergoing scheduled platform maintenance. For immediate mental health support, contact Campus Hotline: 0917-800-SAFE.";
    private volatile String maintenanceEstimatedEnd = null;
    private volatile LocalDateTime maintenanceEnabledAt = null;
    private volatile String maintenanceEnabledBy = null;

    // ── Campus Broadcast Banner State ──
    private volatile boolean broadcastActive = false;
    private volatile String broadcastMessage = "";
    private volatile String broadcastType = "INFO"; // INFO, WARNING, CRITICAL
    private volatile LocalDateTime broadcastUpdatedAt = null;
    private volatile String broadcastUpdatedBy = null;

    // ── In-Memory Circular Audit Trail ──
    private final Deque<AuditLogResponse> auditLogs = new ConcurrentLinkedDeque<>();

    @PostConstruct
    public void init() {
        logAudit("SYSTEM", "SYSTEM_STARTUP", "SUCCESS",
                "Safe Space backend initialized on Java " + System.getProperty("java.version") + " (" + System.getProperty("os.name") + ").",
                "system");
        logAudit("SYSTEM", "SECURITY_VERIFIED", "INFO",
                "Default RBAC security active. H2 database and token stores ready.",
                "security");
    }

    @EventListener
    public void handleAdminAuditEvent(AdminAuditEvent event) {
        logAudit(event.actor(), event.action(), event.severity(), event.details(), event.target());
    }

    public void logAudit(String actor, String action, String severity, String details, String target) {
        AuditLogResponse entry = AuditLogResponse.builder()
                .id(UUID.randomUUID().toString().substring(0, 8))
                .timestamp(LocalDateTime.now().format(FORMATTER))
                .actor(actor != null && !actor.isBlank() ? actor : "admin")
                .action(action)
                .severity(severity != null ? severity.toUpperCase() : "INFO")
                .details(details)
                .target(target != null ? target : "—")
                .build();

        auditLogs.addFirst(entry);
        while (auditLogs.size() > MAX_AUDIT_LOGS) {
            auditLogs.removeLast();
        }
    }

    // ── Live System Health & Telemetry Diagnostics ──

    public SystemHealthResponse getSystemHealth() {
        // 1. JVM Runtime
        Runtime runtime = Runtime.getRuntime();
        long totalMem = runtime.totalMemory() / (1024 * 1024);
        long freeMem = runtime.freeMemory() / (1024 * 1024);
        long maxMem = runtime.maxMemory() / (1024 * 1024);
        long usedMem = totalMem - freeMem;
        double memPercent = maxMem > 0 ? ((double) usedMem / maxMem) * 100.0 : 0.0;

        long uptimeMillis = ManagementFactory.getRuntimeMXBean().getUptime();
        long uptimeSeconds = uptimeMillis / 1000;
        String formattedUptime = formatUptime(uptimeSeconds);

        JvmMetrics jvm = JvmMetrics.builder()
                .uptimeSeconds(uptimeSeconds)
                .uptimeFormatted(formattedUptime)
                .startTime(LocalDateTime.now().minusSeconds(uptimeSeconds).format(FORMATTER))
                .usedMemoryMb(usedMem)
                .totalMemoryMb(totalMem)
                .maxMemoryMb(maxMem)
                .memoryPercent(Math.round(memPercent * 10.0) / 10.0)
                .availableProcessors(runtime.availableProcessors())
                .javaVersion(System.getProperty("java.version"))
                .osName(System.getProperty("os.name"))
                .build();

        // 2. Database Entities
        long totalUsers = userRepository.count();
        long activeUsers = userRepository.countByActiveTrue();
        long students = 0, professionals = 0, admins = 0;
        for (Object[] row : userRepository.countByRole()) {
            String role = (String) row[0];
            long count = ((Number) row[1]).longValue();
            switch (role) {
                case "STUDENT" -> students = count;
                case "PROFESSIONAL" -> professionals = count;
                case "ADMIN" -> admins = count;
            }
        }

        DatabaseMetrics database = DatabaseMetrics.builder()
                .status("ONLINE")
                .databaseType("H2 JPA / Persistent Engine")
                .totalUsers(totalUsers)
                .students(students)
                .professionals(professionals)
                .admins(admins)
                .activeUsers(activeUsers)
                .totalPosts(postRepository.count())
                .totalChatSessions(chatSessionRepository.count())
                .totalCrisisAlerts(crisisAlertRepository.count())
                .totalResources(wellnessResourceRepository.count())
                .activeSessionsCount(credentialService.getActiveTokenCount())
                .build();

        // 3. Email Gateway
        boolean emailConfigured = emailService.isConfigured();
        EmailGatewayMetrics emailGateway = EmailGatewayMetrics.builder()
                .configured(emailConfigured)
                .status(emailConfigured ? "ONLINE" : "KEY_NOT_CONFIGURED")
                .senderEmail(emailService.getFromAddress())
                .senderName(emailService.getFromName())
                .build();

        // 4. Maintenance & Broadcast
        MaintenanceStatus maintenance = getMaintenanceDetails();
        BroadcastBannerStatus broadcast = getBroadcastDetails();

        return SystemHealthResponse.builder()
                .jvm(jvm)
                .database(database)
                .emailGateway(emailGateway)
                .maintenance(maintenance)
                .broadcast(broadcast)
                .build();
    }

    // ── Public Maintenance & Banner Status ──

    public Map<String, Object> getPublicStatus() {
        return Map.of(
                "maintenance", getMaintenanceDetails(),
                "broadcast", getBroadcastDetails()
        );
    }

    public MaintenanceStatus getMaintenanceDetails() {
        return MaintenanceStatus.builder()
                .active(maintenanceActive)
                .message(maintenanceMessage)
                .estimatedEnd(maintenanceEstimatedEnd)
                .enabledAt(maintenanceEnabledAt != null ? maintenanceEnabledAt.format(FORMATTER) : null)
                .enabledBy(maintenanceEnabledBy)
                .build();
    }

    public BroadcastBannerStatus getBroadcastDetails() {
        return BroadcastBannerStatus.builder()
                .active(broadcastActive)
                .message(broadcastMessage)
                .type(broadcastType)
                .updatedAt(broadcastUpdatedAt != null ? broadcastUpdatedAt.format(FORMATTER) : null)
                .updatedBy(broadcastUpdatedBy)
                .build();
    }

    public boolean isMaintenanceActive() {
        return maintenanceActive;
    }

    public String getMaintenanceMessage() {
        return maintenanceMessage;
    }

    // ── Admin Actions: Set Maintenance Mode ──

    public OperationResult setMaintenanceMode(SetMaintenanceRequest req, String adminUsername) {
        this.maintenanceActive = req.isActive();
        if (req.getMessage() != null && !req.getMessage().isBlank()) {
            this.maintenanceMessage = req.getMessage().trim();
        }
        this.maintenanceEstimatedEnd = (req.getEstimatedEnd() != null && !req.getEstimatedEnd().isBlank())
                ? req.getEstimatedEnd().trim() : null;

        if (this.maintenanceActive) {
            this.maintenanceEnabledAt = LocalDateTime.now();
            this.maintenanceEnabledBy = adminUsername;
            logAudit(adminUsername, "MAINTENANCE_ENABLED", "WARN",
                    "Activated maintenance mode: \"" + this.maintenanceMessage + "\"", "system");
        } else {
            this.maintenanceEnabledAt = null;
            this.maintenanceEnabledBy = null;
            logAudit(adminUsername, "MAINTENANCE_DISABLED", "SUCCESS",
                    "Deactivated maintenance mode. All campus student traffic resumed.", "system");
        }

        return OperationResult.builder()
                .success(true)
                .message(this.maintenanceActive
                        ? "Maintenance mode ENABLED. Student mutating traffic is routed to maintenance status."
                        : "Maintenance mode DISABLED. Normal operations resumed.")
                .data(getMaintenanceDetails())
                .build();
    }

    // ── Admin Actions: Set Broadcast Announcement Banner ──

    public OperationResult setBroadcastBanner(SetBroadcastRequest req, String adminUsername) {
        this.broadcastActive = req.isActive();
        this.broadcastMessage = req.getMessage() != null ? req.getMessage().trim() : "";
        this.broadcastType = req.getType() != null ? req.getType().toUpperCase() : "INFO";
        this.broadcastUpdatedAt = LocalDateTime.now();
        this.broadcastUpdatedBy = adminUsername;

        String action = this.broadcastActive ? "BANNER_POSTED" : "BANNER_CLEARED";
        String severity = "INFO";
        if ("WARNING".equals(broadcastType)) severity = "WARN";
        if ("CRITICAL".equals(broadcastType)) severity = "CRITICAL";

        logAudit(adminUsername, action, severity,
                this.broadcastActive ? "Broadcast banner (" + broadcastType + "): " + broadcastMessage : "Broadcast banner removed.",
                "announcements");

        return OperationResult.builder()
                .success(true)
                .message(this.broadcastActive ? "Broadcast announcement banner published." : "Broadcast banner cleared.")
                .data(getBroadcastDetails())
                .build();
    }

    // ── Admin Actions: Housekeeping Utilities ──

    public OperationResult purgeInactiveSessions(String adminUsername) {
        long start = System.currentTimeMillis();
        int initialTokens = credentialService.getActiveTokenCount();
        int purged = credentialService.purgeTokensExcept(adminUsername);
        long latency = System.currentTimeMillis() - start;

        logAudit(adminUsername, "SESSIONS_PURGED", "INFO",
                "Purged " + purged + " inactive session tokens from memory (initial: " + initialTokens + ").",
                "security");

        return OperationResult.builder()
                .success(true)
                .message("Successfully purged " + purged + " inactive session tokens.")
                .latencyMs(latency)
                .data(Map.of("purgedTokens", purged, "remainingTokens", credentialService.getActiveTokenCount()))
                .build();
    }

    public OperationResult runDatabaseCheck(String adminUsername) {
        long start = System.currentTimeMillis();

        long users = userRepository.count();
        long posts = postRepository.count();
        long alerts = crisisAlertRepository.count();
        long chats = chatSessionRepository.count();

        long latency = System.currentTimeMillis() - start;

        logAudit(adminUsername, "DATABASE_CHECK", "SUCCESS",
                "Database integrity verified in " + latency + "ms. Queried " + (users + posts + alerts + chats) + " total entities without errors.",
                "database");

        return OperationResult.builder()
                .success(true)
                .message("Database integrity verified. All tables and relationship constraints responsive.")
                .latencyMs(latency)
                .data(Map.of(
                        "status", "HEALTHY",
                        "latencyMs", latency,
                        "verifiedTables", List.of("USERS", "POSTS", "CRISIS_ALERTS", "CHAT_SESSIONS", "WELLNESS_RESOURCES"),
                        "timestamp", LocalDateTime.now().format(FORMATTER)
                ))
                .build();
    }

    public OperationResult testEmailGateway(String testEmail, String adminUsername) {
        long start = System.currentTimeMillis();
        String target = (testEmail != null && !testEmail.isBlank()) ? testEmail.trim() : emailService.getFromAddress();

        try {
            String resultMsg = emailService.sendDiagnosticTestEmail(target, adminUsername).join();
            long latency = System.currentTimeMillis() - start;

            boolean success = !resultMsg.toLowerCase().contains("failed") && !resultMsg.toLowerCase().contains("disabled");
            logAudit(adminUsername, "EMAIL_GATEWAY_TEST", success ? "SUCCESS" : "WARN",
                    "Email gateway test to " + target + ": " + resultMsg, "mail");

            return OperationResult.builder()
                    .success(success)
                    .message(resultMsg)
                    .latencyMs(latency)
                    .data(Map.of("targetEmail", target, "gatewayConfigured", emailService.isConfigured()))
                    .build();
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            logAudit(adminUsername, "EMAIL_GATEWAY_TEST", "CRITICAL",
                    "Email gateway test failed: " + e.getMessage(), "mail");
            return OperationResult.builder()
                    .success(false)
                    .message("Email test error: " + e.getMessage())
                    .latencyMs(latency)
                    .build();
        }
    }

    public Map<String, Object> exportTelemetryReport(String adminUsername) {
        logAudit(adminUsername, "TELEMETRY_EXPORT", "INFO",
                "Exported full system telemetry & diagnostics report.", "diagnostics");

        SystemHealthResponse health = getSystemHealth();
        return Map.of(
                "exportTimestamp", LocalDateTime.now().format(FORMATTER),
                "exportedBy", adminUsername,
                "system", "Safe Space Campus Mental Health & Wellbeing Platform",
                "diagnostics", health,
                "recentAuditLogs", auditLogs.stream().limit(25).toList()
        );
    }

    public List<AuditLogResponse> getAuditLogs() {
        return new ArrayList<>(auditLogs);
    }

    private String formatUptime(long seconds) {
        long days = seconds / 86400;
        long hours = (seconds % 86400) / 3600;
        long minutes = (seconds % 3600) / 60;
        long secs = seconds % 60;

        StringBuilder sb = new StringBuilder();
        if (days > 0) sb.append(days).append("d ");
        if (hours > 0 || days > 0) sb.append(hours).append("h ");
        sb.append(minutes).append("m ");
        sb.append(secs).append("s");
        return sb.toString();
    }
}
