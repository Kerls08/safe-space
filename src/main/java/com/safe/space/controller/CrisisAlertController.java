package com.safe.space.controller;

import com.safe.space.service.CrisisAlertService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Crisis Alert REST controller.
 *
 * RBAC:
 *   - GET  /api/alerts              → PROFESSIONAL, ADMIN (active alerts)
 *   - GET  /api/alerts/unresolved   → PROFESSIONAL, ADMIN (active + acknowledged)
 *   - GET  /api/alerts/history      → PROFESSIONAL, ADMIN (all statuses)
 *   - GET  /api/alerts/stats        → PROFESSIONAL, ADMIN (dashboard stats)
 *   - GET  /api/alerts/trends       → PROFESSIONAL, ADMIN (daily trends)
 *   - GET  /api/alerts/{alertId}    → PROFESSIONAL, ADMIN (single alert)
 *   - PUT  /api/alerts/{id}/ack     → PROFESSIONAL, ADMIN (acknowledge)
 *   - PUT  /api/alerts/{id}/resolve → PROFESSIONAL, ADMIN (resolve)
 *   - PUT  /api/alerts/{id}/escalate→ PROFESSIONAL, ADMIN (escalate)
 */
@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class CrisisAlertController {

    private final CrisisAlertService alertService;

    // ── Read Endpoints ──

    /**
     * Get all active alerts, prioritized by severity then time.
     */
    @GetMapping
    public ResponseEntity<?> getActiveAlerts(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) {
            return forbidden("Only professionals and admins can view alerts.");
        }
        return ResponseEntity.ok(alertService.getActiveAlerts());
    }

    /**
     * Get all unresolved alerts (ACTIVE + ACKNOWLEDGED).
     */
    @GetMapping("/unresolved")
    public ResponseEntity<?> getUnresolvedAlerts(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(alertService.getUnresolvedAlerts());
    }

    /**
     * Get alert history with optional status filter.
     */
    @GetMapping("/history")
    public ResponseEntity<?> getAlertHistory(
            @RequestParam(required = false, defaultValue = "ALL") String status,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(alertService.getAlertHistory(status));
    }

    /**
     * Get alert statistics for the dashboard.
     */
    @GetMapping("/stats")
    public ResponseEntity<?> getAlertStats(HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(alertService.getAlertStats());
    }

    /**
     * Get daily alert trends for charting.
     */
    @GetMapping("/trends")
    public ResponseEntity<?> getAlertTrends(
            @RequestParam(defaultValue = "30") int days,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(alertService.getAlertTrends(days));
    }

    /**
     * Get a single alert by its alertId.
     */
    @GetMapping("/{alertId}")
    public ResponseEntity<?> getAlert(
            @PathVariable String alertId,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(alertService.getAlertById(alertId));
    }

    // ── Action Endpoints ──

    /**
     * Acknowledge an alert (professional has seen it).
     */
    @PutMapping("/{alertId}/acknowledge")
    public ResponseEntity<?> acknowledgeAlert(
            @PathVariable String alertId,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        return ResponseEntity.ok(toMap(alertService.acknowledgeAlert(alertId, username)));
    }

    /**
     * Resolve an alert (issue has been handled).
     */
    @PutMapping("/{alertId}/resolve")
    public ResponseEntity<?> resolveAlert(
            @PathVariable String alertId,
            @RequestBody(required = false) Map<String, String> body,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        String notes = body != null ? body.getOrDefault("notes", "") : "";
        return ResponseEntity.ok(toMap(alertService.resolveAlert(alertId, username, notes)));
    }

    /**
     * Escalate an alert (requires higher-level intervention).
     */
    @PutMapping("/{alertId}/escalate")
    public ResponseEntity<?> escalateAlert(
            @PathVariable String alertId,
            @RequestBody(required = false) Map<String, String> body,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        String notes = body != null ? body.getOrDefault("notes", "") : "";
        return ResponseEntity.ok(toMap(alertService.escalateAlert(alertId, username, notes)));
    }

    /**
     * Initiate a chat session from a crisis alert.
     * Creates a session on behalf of the student and auto-accepts it for the professional.
     */
    @PostMapping("/{alertId}/chat")
    public ResponseEntity<?> initiateChatFromAlert(
            @PathVariable String alertId,
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        String role = (String) request.getAttribute("auth.role");
        String username = (String) request.getAttribute("auth.username");
        if (!isProfessionalOrAdmin(role)) return forbidden("Access denied.");

        String professionalName = body != null ? body.getOrDefault("professionalName", username) : username;

        var session = alertService.initiateChatFromAlert(alertId, username, professionalName);

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "status", "chat_initiated",
                "sessionId", session.getSessionId(),
                "pseudonym", session.getStudentPseudonym(),
                "message", "Chat session created and accepted. You can now message the student."
        ));
    }

    // ── Helpers ──

    private boolean isProfessionalOrAdmin(String role) {
        return "PROFESSIONAL".equals(role);
    }

    private ResponseEntity<Map<String, String>> forbidden(String message) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", message));
    }

    private Map<String, Object> toMap(com.safe.space.model.CrisisAlert alert) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("alertId", alert.getAlertId());
        map.put("alertType", alert.getAlertType());
        map.put("severity", alert.getSeverity());
        map.put("status", alert.getStatus());
        map.put("title", alert.getTitle());
        map.put("message", alert.getMessage());
        map.put("acknowledgedBy", alert.getAcknowledgedBy());
        map.put("acknowledgedAt", alert.getAcknowledgedAt());
        map.put("resolvedBy", alert.getResolvedBy());
        map.put("resolvedAt", alert.getResolvedAt());
        map.put("resolutionNotes", alert.getResolutionNotes());
        return map;
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleBadState(IllegalStateException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
