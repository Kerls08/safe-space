package com.safe.space.controller;

import com.safe.space.dto.SystemMaintenanceDTOs.*;
import com.safe.space.service.SystemMaintenanceService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST Controller for System Maintenance, Infrastructure Diagnostics,
 * Campus Announcement Broadcasts, and Security Audit Trails.
 *
 * Public Endpoint:
 *   - GET  /api/admin/maintenance/status     → Checks maintenance mode & broadcast announcements
 *
 * Administrator Endpoints (RBAC Enforced):
 *   - GET  /api/admin/maintenance/health     → Full system telemetry & hardware metrics
 *   - POST /api/admin/maintenance/mode       → Toggle maintenance mode on/off
 *   - POST /api/admin/maintenance/banner     → Set/clear campus broadcast announcement
 *   - POST /api/admin/maintenance/purge-sessions → Invalidate inactive sessions
 *   - POST /api/admin/maintenance/db-check   → Live database integrity check
 *   - POST /api/admin/maintenance/test-email → Ping/test Brevo transactional gateway
 *   - GET  /api/admin/maintenance/audit-logs → Recent security & admin audit log trail
 *   - GET  /api/admin/maintenance/export-telemetry → Downloadable JSON diagnostics snapshot
 */
@RestController
@RequestMapping("/api/admin/maintenance")
@RequiredArgsConstructor
@Slf4j
public class SystemMaintenanceController {

    private final SystemMaintenanceService maintenanceService;

    /**
     * Public check for maintenance mode and broadcast announcements.
     * Consumed by frontend auth guard on page loads.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getPublicStatus() {
        return ResponseEntity.ok(maintenanceService.getPublicStatus());
    }

    /**
     * Full infrastructure telemetry and diagnostic metrics (Admin only).
     */
    @GetMapping("/health")
    public ResponseEntity<?> getSystemHealth(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }
        return ResponseEntity.ok(maintenanceService.getSystemHealth());
    }

    /**
     * Toggle Maintenance Mode (Admin only).
     */
    @PostMapping("/mode")
    public ResponseEntity<?> setMaintenanceMode(@RequestBody SetMaintenanceRequest body,
                                                HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        OperationResult result = maintenanceService.setMaintenanceMode(body, username);
        return ResponseEntity.ok(result);
    }

    /**
     * Set or clear Campus Broadcast Announcement Banner (Admin only).
     */
    @PostMapping("/banner")
    public ResponseEntity<?> setBroadcastBanner(@RequestBody SetBroadcastRequest body,
                                                HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        OperationResult result = maintenanceService.setBroadcastBanner(body, username);
        return ResponseEntity.ok(result);
    }

    /**
     * Purge inactive session tokens from memory (Admin only).
     */
    @PostMapping("/purge-sessions")
    public ResponseEntity<?> purgeSessions(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        OperationResult result = maintenanceService.purgeInactiveSessions(username);
        return ResponseEntity.ok(result);
    }

    /**
     * Run live database health and integrity check (Admin only).
     */
    @PostMapping("/db-check")
    public ResponseEntity<?> runDatabaseCheck(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        OperationResult result = maintenanceService.runDatabaseCheck(username);
        return ResponseEntity.ok(result);
    }

    /**
     * Test Brevo email gateway connectivity and delivery (Admin only).
     */
    @PostMapping("/test-email")
    public ResponseEntity<?> testEmailGateway(@RequestBody(required = false) TestEmailRequest body,
                                              HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        String targetEmail = (body != null) ? body.getEmail() : null;
        OperationResult result = maintenanceService.testEmailGateway(targetEmail, username);
        return ResponseEntity.ok(result);
    }

    /**
     * Retrieve recent security and administrative audit logs (Admin only).
     */
    @GetMapping("/audit-logs")
    public ResponseEntity<?> getAuditLogs(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        List<AuditLogResponse> logs = maintenanceService.getAuditLogs();
        return ResponseEntity.ok(logs);
    }

    /**
     * Download comprehensive JSON telemetry and diagnostics report (Admin only).
     */
    @GetMapping("/export-telemetry")
    public ResponseEntity<?> exportTelemetry(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isAdmin(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Access denied: System Administrator credentials required."));
        }

        Map<String, Object> report = maintenanceService.exportTelemetryReport(username);
        return ResponseEntity.ok(report);
    }

    private boolean isAdmin(String role) {
        return "ADMIN".equalsIgnoreCase(role);
    }
}
