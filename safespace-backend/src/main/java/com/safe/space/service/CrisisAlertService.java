package com.safe.space.service;

import com.safe.space.dto.ChatSessionRequest;
import com.safe.space.dto.ChatSessionResponse;
import com.safe.space.model.ChatSession;
import com.safe.space.model.CrisisAlert;
import com.safe.space.model.User;
import com.safe.space.repository.ChatSessionRepository;
import com.safe.space.repository.CrisisAlertRepository;
import com.safe.space.repository.PostRepository;
import com.safe.space.repository.UserRepository;
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
 * 1. Generates persisted alerts from crisis events across all subsystems
 * 2. Detects patterns (repeat crisis, energy spikes)
 * 3. Prevents duplicate alerts for the same event
 * 4. Supports a professional workflow (acknowledge → resolve/escalate)
 * 5. Provides statistics and trends for the monitoring dashboard
 *
 * Alert sources:
 * - PostService → CRISIS_POST, HIGH_ENERGY_POST
 * - ChatService → CRISIS_CHAT
 * - Pattern engine → REPEAT_CRISIS, ENERGY_SPIKE
 * - System events → SYSTEM_EVENT (lockouts, imports)
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
    private final ChatSessionRepository sessionRepository;
    private final PostRepository postRepository;
    private final EmailService emailService;
    private final UserRepository userRepository;

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

        // Notify professionals via email
        notifyProfessionalsByEmail(saved);

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
        if (alertExists(postId, "POST"))
            return null;

        String severity = mapEnergySeverity(energyScore);

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("HIGH_ENERGY_POST")
                .severity(severity)
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
        log.info("⚡ ALERT GENERATED [{}] type=HIGH_ENERGY severity={} postId={} energy={}",
                saved.getAlertId(), severity, postId, energyScore);

        // Notify professionals via email
        notifyProfessionalsByEmail(saved);

        return saved;
    }

    private String mapEnergySeverity(int energyScore) {
        if (energyScore >= 10) return "CRITICAL";
        if (energyScore >= 9) return "HIGH";
        return "MODERATE";
    }

    /**
     * Generate an alert for a crisis-flagged chat session.
     */
    @Transactional
    public CrisisAlert alertCrisisChat(String sessionId, String pseudonym,
            String topic, String emotionTag, Integer energyScore) {
        if (alertExists(sessionId, "CHAT"))
            return null;

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

        // Notify professionals via email
        notifyProfessionalsByEmail(saved);

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

        // Notify professionals via email (for crisis-related blocked posts)
        if (hasCrisis) {
            notifyProfessionalsByEmail(saved);
        }

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

                CrisisAlert savedRepeat = alertRepository.save(repeat);
                log.error("🔴 REPEAT CRISIS PATTERN for pseudonym={} count={}", pseudonym, count);

                // Notify professionals via email about repeat crisis pattern
                notifyProfessionalsByEmail(savedRepeat);
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
     * Get all in-progress alerts (ACKNOWLEDGED status), sorted newest first.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getInProgressAlerts() {
        return alertRepository.findInProgressAlertsPrioritized().stream()
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
            alerts = alertRepository.findByStatusInOrderByCreatedAtDesc(List.of("RESOLVED", "ESCALATED"));
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
                "inProgress", acknowledged,
                "resolved", resolved,
                "escalated", escalated,
                "severityBreakdown", severityBreakdown,
                "typeBreakdown", typeBreakdown,
                "todayTotal", todayTotal,
                "todayCritical", todayCritical);
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
     * @param alertId          the alert to initiate chat from
     * @param professionalId   the professional's username/ID
     * @param professionalName the professional's display name
     * @return the created and accepted chat session response
     */
    @Transactional
    public Map<String, Object> initiateChatFromAlert(String alertId, String professionalId,
            String professionalName) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));

        if (alert.getPseudonym() == null || alert.getPseudonym().isBlank()) {
            throw new IllegalStateException("Cannot initiate chat: alert has no associated student pseudonym.");
        }

        // Resolve pseudonym → actual student username from Post table
        String studentUserId = null;
        try {
            studentUserId = postRepository.findFirstByPseudonymOrderByCreatedAtDesc(alert.getPseudonym())
                    .map(p -> p.getOwnerUsername())
                    .orElse(null);
            if (studentUserId != null) {
                log.info("Resolved pseudonym '{}' to studentUserId '{}' for crisis chat",
                        alert.getPseudonym(), studentUserId);
            } else {
                log.warn("Could not resolve pseudonym '{}' to a student user ID — session will be pseudonym-only",
                        alert.getPseudonym());
            }
        } catch (Exception e) {
            log.warn("Error resolving pseudonym '{}' to userId: {}", alert.getPseudonym(), e.getMessage());
        }

        // Check if student already has an open session (WAITING, INVITED, or ACTIVE)
        List<ChatSession> openSessions = sessionRepository.findOpenSessionsForStudent(studentUserId, alert.getPseudonym());

        if (!openSessions.isEmpty()) {
            ChatSession existing = openSessions.get(0);

            // Case 1: Student is WAITING (they voluntarily started a chat and are waiting in queue)
            if ("WAITING".equals(existing.getStatus())) {
                ChatSessionResponse accepted = chatService.acceptSession(
                        existing.getSessionId(), professionalId, professionalName);

                alert.setChatSessionId(accepted.getSessionId());
                alert.setOutreachStatus("ACTIVE");
                autoAcknowledgeAlert(alert, professionalId);

                return Map.of(
                        "status", "claimed_waiting",
                        "sessionId", accepted.getSessionId(),
                        "pseudonym", accepted.getStudentPseudonym(),
                        "professionalName", professionalName,
                        "message", "Connected to student's waiting chat session.");
            }

            // Case 2: Session is ACTIVE with THIS professional
            if ("ACTIVE".equals(existing.getStatus()) && professionalId.equals(existing.getProfessionalId())) {
                alert.setChatSessionId(existing.getSessionId());
                alert.setOutreachStatus("ACTIVE");
                autoAcknowledgeAlert(alert, professionalId);
                return Map.of(
                        "status", "resumed_active",
                        "sessionId", existing.getSessionId(),
                        "pseudonym", existing.getStudentPseudonym(),
                        "professionalName", professionalName,
                        "message", "Resumed ongoing active counseling session.");
            }

            // Case 3: Session is ACTIVE with ANOTHER professional
            if ("ACTIVE".equals(existing.getStatus()) && !professionalId.equals(existing.getProfessionalId())) {
                String assignedName = existing.getProfessionalName() != null ? existing.getProfessionalName() : existing.getProfessionalId();
                return Map.of(
                        "status", "already_active_with_other",
                        "sessionId", existing.getSessionId(),
                        "professionalName", assignedName,
                        "message", "This student is currently in an active counseling session with " + assignedName + ".");
            }

            // Case 4: Session is INVITED by ANOTHER professional
            if ("INVITED".equals(existing.getStatus()) && !professionalId.equals(existing.getProfessionalId())) {
                String assignedName = existing.getProfessionalName() != null ? existing.getProfessionalName() : existing.getProfessionalId();
                return Map.of(
                        "status", "already_invited_by_other",
                        "sessionId", existing.getSessionId(),
                        "professionalName", assignedName,
                        "message", "An outreach invitation was already sent to this student by " + assignedName + " (pending response).");
            }

            // Case 5: Session is INVITED by THIS professional
            if ("INVITED".equals(existing.getStatus()) && professionalId.equals(existing.getProfessionalId())) {
                alert.setChatSessionId(existing.getSessionId());
                alert.setOutreachStatus("INVITED");
                alertRepository.save(alert);
                return Map.of(
                        "status", "invite_sent",
                        "sessionId", existing.getSessionId(),
                        "pseudonym", existing.getStudentPseudonym(),
                        "professionalName", professionalName,
                        "message", "Outreach invitation already sent by you. Waiting for student to accept.");
            }
        }

        // Case 6: No open session exists -> Create gentle outreach invitation (status = INVITED)
        String topic = "[Crisis Outreach] " + (alert.getTitle() != null ? alert.getTitle() : "Counselor Check-in");
        ChatSessionResponse inviteSession = chatService.createOutreachInvite(
                studentUserId,
                alert.getPseudonym(),
                topic,
                alert.getEmotionTag(),
                alert.getEnergyScore(),
                professionalId,
                professionalName);

        alert.setChatSessionId(inviteSession.getSessionId());
        alert.setOutreachStatus("INVITED");
        autoAcknowledgeAlert(alert, professionalId);

        log.info("Crisis outreach invitation created: alertId={}, sessionId={}, professional={}, pseudonym={}",
                alertId, inviteSession.getSessionId(), professionalName, alert.getPseudonym());

        return Map.of(
                "status", "invite_sent",
                "sessionId", inviteSession.getSessionId(),
                "pseudonym", alert.getPseudonym(),
                "professionalName", professionalName,
                "message", "Outreach invitation sent to student. Waiting for student to accept.");
    }

    private void autoAcknowledgeAlert(CrisisAlert alert, String professionalId) {
        if ("ACTIVE".equals(alert.getStatus())) {
            alert.setStatus("ACKNOWLEDGED");
            alert.setAcknowledgedBy(professionalId);
            alert.setAcknowledgedAt(LocalDateTime.now());
        }
        alertRepository.save(alert);
    }

    /**
     * Update outreach status for an alert linked to a chat session.
     * Called when student declines or closes the outreach session.
     */
    @Transactional
    public void updateAlertOutreachStatus(String sessionId, String outreachStatus, String notes) {
        alertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc(sessionId).ifPresent(alert -> {
            alert.setOutreachStatus(outreachStatus);
            if (notes != null && !notes.isBlank()) {
                String existing = alert.getResolutionNotes();
                alert.setResolutionNotes(existing != null ? existing + "\n" + notes : notes);
            }
            alertRepository.save(alert);
            log.info("Crisis alert outreachStatus updated: alertId={}, sessionId={}, outreachStatus={}",
                    alert.getAlertId(), sessionId, outreachStatus);
        });
    }

    // ── EMAIL NOTIFICATION TO PROFESSIONALS ──

    /**
     * Dispatch crisis alert email to all active professionals with an email address.
     * Runs asynchronously so it never blocks the alert creation flow.
     */
    private void notifyProfessionalsByEmail(CrisisAlert alert) {
        try {
            List<User> professionals = userRepository.findByRoleInAndActiveTrueAndEmailIsNotNull(
                    List.of("PROFESSIONAL", "SUPER_ADMIN")
            );
            if (professionals.isEmpty()) {
                log.info("No active professionals with email found — crisis alert email skipped for alert {}",
                        alert.getAlertId());
                return;
            }

            int dispatched = 0;
            for (User pro : professionals) {
                if (pro.getEmail() != null && !pro.getEmail().isBlank()) {
                    emailService.sendCrisisAlertEmail(
                            pro.getEmail(),
                            pro.getFullName(),
                            alert.getAlertType(),
                            alert.getSeverity(),
                            alert.getPseudonym(),
                            alert.getTitle(),
                            alert.getMessage(),
                            alert.getEmotionTag(),
                            alert.getEnergyScore(),
                            alert.getFlaggedKeywords(),
                            alert.getAlertId()
                    );
                    dispatched++;
                    log.info("📧 Dispatched crisis alert {} to {} ({}, role={})",
                            alert.getAlertId(), pro.getEmail(), pro.getFullName(), pro.getRole());
                }
            }
            log.info("📧 Crisis alert email dispatched to {} professional(s) for alert {}",
                    dispatched, alert.getAlertId());
        } catch (Exception e) {
            log.error("Failed to dispatch crisis alert emails for alert {}: {}",
                    alert.getAlertId(), e.getMessage());
        }
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
        String outreachStatus = a.getOutreachStatus() != null ? a.getOutreachStatus() : "NONE";
        if ("NONE".equals(outreachStatus)) {
            String notes = a.getResolutionNotes();
            if (notes != null && (notes.toLowerCase().contains("declined") || notes.toLowerCase().contains("vent only"))) {
                outreachStatus = "DECLINED";
            } else if (notes != null && notes.toLowerCase().contains("invite")) {
                outreachStatus = "INVITED";
            }
        }
        if (a.getChatSessionId() != null && !a.getChatSessionId().isBlank()) {
            Optional<com.safe.space.model.ChatSession> optSession = sessionRepository.findBySessionId(a.getChatSessionId());
            if (optSession.isPresent()) {
                String sessStatus = optSession.get().getStatus();
                if ("ACTIVE".equals(sessStatus) && !"DECLINED".equals(outreachStatus)) {
                    outreachStatus = "ACTIVE";
                } else if ("DECLINED".equals(sessStatus)) {
                    outreachStatus = "DECLINED";
                } else if ("CLOSED".equals(sessStatus) && !"DECLINED".equals(outreachStatus)) {
                    outreachStatus = "CONCLUDED";
                }
            }
        }
        map.put("outreachStatus", outreachStatus);
        map.put("chatSessionId", a.getChatSessionId());
        map.put("referenceId", a.getReferenceId());
        map.put("referenceType", a.getReferenceType());
        map.put("title", a.getTitle());
        map.put("message", a.getMessage());
        map.put("pseudonym", a.getPseudonym());
        map.put("emotionTag", a.getEmotionTag());
        map.put("energyScore", a.getEnergyScore());
        map.put("flaggedKeywords", a.getFlaggedKeywords());
        map.put("acknowledgedBy", a.getAcknowledgedBy());
        String ackByName = a.getAcknowledgedBy();
        if (ackByName != null && !ackByName.isBlank()) {
            ackByName = userRepository.findByUsername(ackByName)
                    .map(User::getFullName)
                    .orElse(ackByName);
        }
        map.put("acknowledgedByName", ackByName);
        map.put("acknowledgedAt", a.getAcknowledgedAt());
        map.put("resolvedBy", a.getResolvedBy());
        String resByName = a.getResolvedBy();
        if (resByName != null && !resByName.isBlank()) {
            resByName = userRepository.findByUsername(resByName)
                    .map(User::getFullName)
                    .orElse(resByName);
        }
        map.put("resolvedByName", resByName);
        map.put("resolvedAt", a.getResolvedAt());
        map.put("resolutionNotes", a.getResolutionNotes());
        map.put("createdAt", a.getCreatedAt());
        return map;
    }

    private String mapSeverity(String crisisSeverity) {
        if (crisisSeverity == null)
            return "MODERATE";
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
        if (s == null)
            return "";
        return s.length() > len ? s.substring(0, len) + "…" : s;
    }
}
