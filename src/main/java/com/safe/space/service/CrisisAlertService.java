package com.safe.space.service;

import com.safe.space.dto.ChatSessionRequest;
import com.safe.space.dto.ChatSessionResponse;
import com.safe.space.model.CrisisAlert;
import com.safe.space.repository.CrisisAlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Crisis Alert Service.
 *
 * Intelligent alerting engine that:
 *   1. Generates persisted alerts from crisis events across all subsystems
 *   2. Detects patterns (repeat crisis, energy spikes)
 *   3. Prevents duplicate alerts for the same event
 *   4. Supports a professional workflow (acknowledge → resolve/escalate)
 *   5. Provides statistics and trends for the monitoring dashboard
 *
 * Alert sources:
 *   - PostService     → CRISIS_POST, HIGH_ENERGY_POST
 *   - ChatService     → CRISIS_CHAT
 *   - Pattern engine  → REPEAT_CRISIS, ENERGY_SPIKE
 *   - System events   → SYSTEM_EVENT (lockouts, imports)
 *
 * Integration: Called from PostService.createPost() and ChatService after
 * crisis events are detected, rather than polling.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CrisisAlertService {

    private final CrisisAlertRepository alertRepository;
    private final AnonymousChatService chatService;

    // ── 1. ALERT GENERATION ──

    /**
     * Generate an alert for a crisis-flagged post.
     * Called from PostService when a post is flagged by CrisisKeywordService.
     */
    @Transactional
    public CrisisAlert alertCrisisPost(String postId, String pseudonym, String content,
                                        String emotionTag, int energyScore,
                                        String severity, String flaggedKeywords) {
        // Prevent duplicates
        if (alertExists(postId, "POST")) {
            log.debug("Alert already exists for post {}", postId);
            return null;
        }

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("CRISIS_POST")
                .severity(mapSeverity(severity))
                .status("ACTIVE")
                .referenceId(postId)
                .referenceType("POST")
                .title("Crisis keywords detected in post")
                .message(truncate(content, 500))
                .pseudonym(pseudonym)
                .emotionTag(emotionTag)
                .energyScore(energyScore)
                .flaggedKeywords(flaggedKeywords)
                .build();

        CrisisAlert saved = alertRepository.save(alert);
        log.warn("🚨 ALERT GENERATED [{}] type=CRISIS_POST severity={} postId={} pseudonym={}",
                saved.getAlertId(), saved.getSeverity(), postId, pseudonym);

        // Check for repeat crisis pattern
        checkRepeatCrisis(pseudonym, postId);

        return saved;
    }

    /**
     * Generate an alert for a high-energy post (energy >= 8, not flagged).
     */
    @Transactional
    public CrisisAlert alertHighEnergyPost(String postId, String pseudonym, String content,
                                            String emotionTag, int energyScore) {
        if (alertExists(postId, "POST")) return null;

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("HIGH_ENERGY_POST")
                .severity("MODERATE")
                .status("ACTIVE")
                .referenceId(postId)
                .referenceType("POST")
                .title("High energy post detected (score: " + energyScore + "/10)")
                .message(truncate(content, 500))
                .pseudonym(pseudonym)
                .emotionTag(emotionTag)
                .energyScore(energyScore)
                .build();

        CrisisAlert saved = alertRepository.save(alert);
        log.info("⚡ ALERT GENERATED [{}] type=HIGH_ENERGY severity=MODERATE postId={} energy={}",
                saved.getAlertId(), postId, energyScore);

        return saved;
    }

    /**
     * Generate an alert for a crisis-flagged chat session.
     */
    @Transactional
    public CrisisAlert alertCrisisChat(String sessionId, String pseudonym,
                                        String topic, String emotionTag, Integer energyScore) {
        if (alertExists(sessionId, "CHAT")) return null;

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("CRISIS_CHAT")
                .severity("CRITICAL")
                .status("ACTIVE")
                .referenceId(sessionId)
                .referenceType("CHAT")
                .title("Crisis chat session initiated")
                .message("Student pseudonym: " + pseudonym + ". Topic: " + truncate(topic, 300))
                .pseudonym(pseudonym)
                .emotionTag(emotionTag)
                .energyScore(energyScore)
                .build();

        CrisisAlert saved = alertRepository.save(alert);
        log.warn("🚨 ALERT GENERATED [{}] type=CRISIS_CHAT severity=CRITICAL sessionId={} pseudonym={}",
                saved.getAlertId(), sessionId, pseudonym);

        return saved;
    }

    /**
     * Generate a system event alert (lockouts, bulk imports, etc.).
     */
    @Transactional
    public CrisisAlert alertSystemEvent(String title, String message, String severity,
                                         String referenceId) {
        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("SYSTEM_EVENT")
                .severity(severity != null ? severity : "INFO")
                .status("ACTIVE")
                .referenceId(referenceId)
                .referenceType("SYSTEM")
                .title(title)
                .message(message)
                .build();

        CrisisAlert saved = alertRepository.save(alert);
        log.info("📋 CRISIS ALERT [{}] severity={} title={}",
                saved.getAlertId(), saved.getSeverity(), title);
        return saved;
    }

    /**
     * Generate an alert when a student attempts to post content containing
     * sensitive words (crisis keywords and/or profanity).
     *
     * The post is BLOCKED from being saved/visible, but the alert preserves
     * all relevant context so professionals can assess the student's state.
     *
     * @param pseudonym     anonymous identity of the student
     * @param content       the blocked post content
     * @param emotionTag    emotion selected by the student
     * @param energyScore   energy/distress level selected by the student
     * @param hasCrisis     true if crisis keywords were detected
     * @param severity      crisis severity ("high", "medium", or "NONE")
     * @param detectedWords human-readable list of detected sensitive words
     */
    @Transactional
    public CrisisAlert alertBlockedPostAttempt(String pseudonym, String content,
                                               String emotionTag, int energyScore,
                                               boolean hasCrisis, String severity,
                                               String detectedWords) {
        // Crisis content → higher alert severity & type
        String alertType = hasCrisis ? "CRISIS_POST" : "SYSTEM_EVENT";
        String alertSeverity = hasCrisis ? mapSeverity(severity) : "LOW";
        String title = hasCrisis
                ? "🛑 Blocked Post: Crisis keywords detected"
                : "🛑 Blocked Post: Sensitive words detected";

        String message = "Pseudonym '" + pseudonym + "' attempted to post restricted content.\n"
                + "Detected: " + detectedWords + "\n"
                + "Emotion: " + emotionTag + " | Energy: " + energyScore + "/10\n"
                + "Content: " + truncate(content, 400);

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType(alertType)
                .severity(alertSeverity)
                .status("ACTIVE")
                .referenceId(pseudonym)
                .referenceType("USER")
                .title(title)
                .message(message)
                .pseudonym(pseudonym)
                .emotionTag(emotionTag)
                .energyScore(energyScore)
                .flaggedKeywords(detectedWords)
                .build();

        CrisisAlert saved = alertRepository.save(alert);
        log.warn("🛑 BLOCKED POST ALERT [{}] type={} severity={} pseudonym={}",
                saved.getAlertId(), alertType, alertSeverity, pseudonym);

        // Check for repeat crisis pattern if crisis keywords were detected
        if (hasCrisis) {
            checkRepeatCrisis(pseudonym, saved.getAlertId());
        }

        return saved;
    }

    // ── 2. PATTERN DETECTION ──

    /**
     * Check if the same pseudonym has been flagged multiple times (repeat crisis).
     * If 2+ active crisis alerts exist → generate a REPEAT_CRISIS alert.
     */
    private void checkRepeatCrisis(String pseudonym, String currentPostId) {
        long count = alertRepository.countActiveCrisisForPseudonym(pseudonym);
        if (count >= 2) {
            // Check if a repeat alert already exists
            boolean repeatExists = alertRepository.findByReferenceIdAndReferenceType(pseudonym, "PATTERN")
                    .stream().anyMatch(a -> "ACTIVE".equals(a.getStatus()) || "ACKNOWLEDGED".equals(a.getStatus()));

            if (!repeatExists) {
                CrisisAlert repeat = CrisisAlert.builder()
                        .alertId(generateAlertId())
                        .alertType("REPEAT_CRISIS")
                        .severity("CRITICAL")
                        .status("ACTIVE")
                        .referenceId(pseudonym)
                        .referenceType("PATTERN")
                        .title("⚠ Repeat crisis pattern detected")
                        .message("Pseudonym '" + pseudonym + "' has " + count
                                + " active crisis indicators. Immediate professional attention recommended.")
                        .pseudonym(pseudonym)
                        .build();

                alertRepository.save(repeat);
                log.error("🔴 REPEAT CRISIS PATTERN for pseudonym={} count={}", pseudonym, count);
            }
        }
    }

    // ── 3. ALERT MANAGEMENT (Professional Workflow) ──

    /**
     * Acknowledge an alert (professional has seen it).
     */
    @Transactional
    public CrisisAlert acknowledgeAlert(String alertId, String username) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));

        if (!"ACTIVE".equals(alert.getStatus())) {
            throw new IllegalStateException("Alert is already " + alert.getStatus());
        }

        alert.setStatus("ACKNOWLEDGED");
        alert.setAcknowledgedBy(username);
        alert.setAcknowledgedAt(LocalDateTime.now());
        CrisisAlert saved = alertRepository.save(alert);

        log.info("Alert acknowledged: alertId={}, by={}", alertId, username);
        return saved;
    }

    /**
     * Resolve an alert (issue has been handled).
     */
    @Transactional
    public CrisisAlert resolveAlert(String alertId, String username, String notes) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));

        if ("RESOLVED".equals(alert.getStatus()) || "ESCALATED".equals(alert.getStatus())) {
            throw new IllegalStateException("Alert is already " + alert.getStatus());
        }

        alert.setStatus("RESOLVED");
        alert.setResolvedBy(username);
        alert.setResolvedAt(LocalDateTime.now());
        alert.setResolutionNotes(notes);
        CrisisAlert saved = alertRepository.save(alert);

        log.info("Alert resolved: alertId={}, by={}, notes={}", alertId, username, truncate(notes, 50));
        return saved;
    }

    /**
     * Escalate an alert (requires higher-level intervention).
     */
    @Transactional
    public CrisisAlert escalateAlert(String alertId, String username, String notes) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));

        if ("RESOLVED".equals(alert.getStatus()) || "ESCALATED".equals(alert.getStatus())) {
            throw new IllegalStateException("Alert is already " + alert.getStatus());
        }

        alert.setStatus("ESCALATED");
        alert.setResolvedBy(username);
        alert.setResolvedAt(LocalDateTime.now());
        alert.setResolutionNotes(notes);
        CrisisAlert saved = alertRepository.save(alert);

        log.warn("⬆ Alert ESCALATED: alertId={}, by={}", alertId, username);
        return saved;
    }

    // ── 4. ALERT QUERIES ──

    /**
     * Get all active alerts, prioritized by severity then time.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getActiveAlerts() {
        return alertRepository.findActiveAlertsPrioritized().stream()
                .map(this::toMap)
                .collect(Collectors.toList());
    }

    /**
     * Get all unresolved alerts (ACTIVE + ACKNOWLEDGED).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getUnresolvedAlerts() {
        return alertRepository.findUnresolvedAlertsPrioritized().stream()
                .map(this::toMap)
                .collect(Collectors.toList());
    }

    /**
     * Get alert history (all statuses) with optional status filter.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAlertHistory(String statusFilter) {
        List<CrisisAlert> alerts;
        if (statusFilter != null && !statusFilter.isBlank() && !"ALL".equalsIgnoreCase(statusFilter)) {
            alerts = alertRepository.findByStatusOrderByCreatedAtDesc(statusFilter);
        } else {
            alerts = alertRepository.findAll().stream()
                    .sorted(Comparator.comparing(CrisisAlert::getCreatedAt).reversed())
                    .collect(Collectors.toList());
        }
        return alerts.stream().map(this::toMap).collect(Collectors.toList());
    }

    /**
     * Get a single alert by its alertId.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getAlertById(String alertId) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));
        return toMap(alert);
    }

    // ── 5. ALERT STATISTICS ──

    /**
     * Comprehensive alert statistics for the dashboard.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getAlertStats() {
        long total = alertRepository.count();
        long active = alertRepository.countByStatus("ACTIVE");
        long acknowledged = alertRepository.countByStatus("ACKNOWLEDGED");
        long resolved = alertRepository.countByStatus("RESOLVED");
        long escalated = alertRepository.countByStatus("ESCALATED");

        // Active severity breakdown
        Map<String, Long> severityBreakdown = new LinkedHashMap<>();
        for (Object[] row : alertRepository.countActiveBySeverity()) {
            severityBreakdown.put((String) row[0], ((Number) row[1]).longValue());
        }

        // Active type breakdown
        Map<String, Long> typeBreakdown = new LinkedHashMap<>();
        for (Object[] row : alertRepository.countActiveByType()) {
            typeBreakdown.put((String) row[0], ((Number) row[1]).longValue());
        }

        // Today's counts
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        long todayTotal = alertRepository.countSince(todayStart);
        long todayCritical = alertRepository.countCriticalSince(todayStart);

        return Map.of(
                "totalAlerts", total,
                "active", active,
                "acknowledged", acknowledged,
                "resolved", resolved,
                "escalated", escalated,
                "severityBreakdown", severityBreakdown,
                "typeBreakdown", typeBreakdown,
                "todayTotal", todayTotal,
                "todayCritical", todayCritical
        );
    }

    /**
     * Daily alert trends for charting.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAlertTrends(int days) {
        LocalDateTime since = LocalDate.now().minusDays(days).atStartOfDay();
        List<Object[]> rows = alertRepository.findDailyAlertTrends(since);

        return rows.stream().map(r -> {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", r[0].toString());
            point.put("severity", r[1]);
            point.put("count", ((Number) r[2]).longValue());
            return point;
        }).collect(Collectors.toList());
    }

    // ── 6. CHAT INITIATION FROM ALERT ──

    /**
     * Initiate a chat session from a crisis alert.
     *
     * Creates a chat session on behalf of the student (using the pseudonym from the
     * alert) and immediately accepts it with the professional's credentials.
     * Both parties can then exchange messages.
     *
     * @param alertId           the alert to initiate chat from
     * @param professionalId    the professional's username/ID
     * @param professionalName  the professional's display name
     * @return the created and accepted chat session response
     */
    @Transactional
    public ChatSessionResponse initiateChatFromAlert(String alertId, String professionalId,
                                                      String professionalName) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));

        if (alert.getPseudonym() == null || alert.getPseudonym().isBlank()) {
            throw new IllegalStateException("Cannot initiate chat: alert has no associated student pseudonym.");
        }

        // Build a chat session request on behalf of the student
        ChatSessionRequest chatRequest = new ChatSessionRequest();
        chatRequest.setPseudonym(alert.getPseudonym());
        chatRequest.setTopic("[Crisis Alert] " + (alert.getTitle() != null ? alert.getTitle() : "Professional outreach"));
        chatRequest.setEmotionTag(alert.getEmotionTag());
        chatRequest.setEnergyScore(alert.getEnergyScore());

        // Create the session (status = WAITING)
        ChatSessionResponse session = chatService.createSession(chatRequest);

        // Immediately accept it with the professional's credentials (status = ACTIVE)
        ChatSessionResponse accepted = chatService.acceptSession(
                session.getSessionId(), professionalId, professionalName);

        // Auto-acknowledge the alert if it's still ACTIVE
        if ("ACTIVE".equals(alert.getStatus())) {
            alert.setStatus("ACKNOWLEDGED");
            alert.setAcknowledgedBy(professionalId);
            alert.setAcknowledgedAt(LocalDateTime.now());
            alertRepository.save(alert);
        }

        log.info("Chat initiated from alert: alertId={}, sessionId={}, professional={}, pseudonym={}",
                alertId, accepted.getSessionId(), professionalName, alert.getPseudonym());

        return accepted;
    }

    // ── HELPERS ──

    private boolean alertExists(String referenceId, String referenceType) {
        return alertRepository.existsByReferenceIdAndReferenceTypeAndStatusIn(
                referenceId, referenceType, List.of("ACTIVE", "ACKNOWLEDGED"));
    }

    private Map<String, Object> toMap(CrisisAlert a) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("alertId", a.getAlertId());
        map.put("alertType", a.getAlertType());
        map.put("severity", a.getSeverity());
        map.put("status", a.getStatus());
        map.put("referenceId", a.getReferenceId());
        map.put("referenceType", a.getReferenceType());
        map.put("title", a.getTitle());
        map.put("message", a.getMessage());
        map.put("pseudonym", a.getPseudonym());
        map.put("emotionTag", a.getEmotionTag());
        map.put("energyScore", a.getEnergyScore());
        map.put("flaggedKeywords", a.getFlaggedKeywords());
        map.put("acknowledgedBy", a.getAcknowledgedBy());
        map.put("acknowledgedAt", a.getAcknowledgedAt());
        map.put("resolvedBy", a.getResolvedBy());
        map.put("resolvedAt", a.getResolvedAt());
        map.put("resolutionNotes", a.getResolutionNotes());
        map.put("createdAt", a.getCreatedAt());
        return map;
    }

    private String mapSeverity(String crisisSeverity) {
        if (crisisSeverity == null) return "MODERATE";
        return switch (crisisSeverity.toLowerCase()) {
            case "critical" -> "CRITICAL";
            case "high" -> "HIGH";
            case "medium", "moderate" -> "MODERATE";
            case "low" -> "LOW";
            default -> "MODERATE";
        };
    }

    private String generateAlertId() {
        return "alert-" + Long.toString(System.currentTimeMillis(), 36).toLowerCase()
                + "-" + UUID.randomUUID().toString().substring(0, 4).toLowerCase();
    }

    private String truncate(String s, int len) {
        if (s == null) return "";
        return s.length() > len ? s.substring(0, len) + "…" : s;
    }
}
