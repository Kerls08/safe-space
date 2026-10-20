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
import jakarta.annotation.PostConstruct;
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
    private final CrisisKeywordService crisisKeywordService;

    // Cache to debounce email notifications per student pseudonym (15 minutes)
    private final Map<String, LocalDateTime> lastEmailDispatchPerPseudonym = new java.util.concurrent.ConcurrentHashMap<>();

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

        attachToOpenCaseIfPresent(alert, pseudonym);
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

        boolean isMash = isRepetitiveOrKeyboardMash(content);
        String severity = mapEnergySeverity(energyScore, content);
        String title = isMash
                ? "High energy post detected (score: " + energyScore + "/10 - Repetitive Venting)"
                : "High energy post detected (score: " + energyScore + "/10)";

        CrisisAlert alert = CrisisAlert.builder()
                .alertId(generateAlertId())
                .alertType("HIGH_ENERGY_POST")
                .severity(severity)
                .status("ACTIVE")
                .referenceId(postId)
                .referenceType("POST")
                .title(title)
                .message(truncate(content, 500))
                .pseudonym(pseudonym)
                .emotionTag(emotionTag)
                .energyScore(energyScore)
                .build();

        attachToOpenCaseIfPresent(alert, pseudonym);
        CrisisAlert saved = alertRepository.save(alert);
        log.info("⚡ ALERT GENERATED [{}] type=HIGH_ENERGY severity={} postId={} energy={}",
                saved.getAlertId(), severity, postId, energyScore);

        // Notify professionals via email
        notifyProfessionalsByEmail(saved);

        return saved;
    }

    private String mapEnergySeverity(int energyScore) {
        return mapEnergySeverity(energyScore, null);
    }

    private String mapEnergySeverity(int energyScore, String content) {
        if (isRepetitiveOrKeyboardMash(content)) {
            // Repetitive keyboard mash / venting: cap severity at HIGH so it doesn't trigger false sirens
            return energyScore >= 9 ? "HIGH" : "MODERATE";
        }
        // High-energy venting without explicit crisis keywords is capped at HIGH,
        // strictly reserving CRITICAL for acute life-safety emergencies (suicidal ideation / lethal crisis)
        if (energyScore >= 9) return "HIGH";
        return "MODERATE";
    }

    /**
     * Startup alignment: Calibrates existing alerts and posts in the database
     * to match the clinical crisis severity standards:
     * - CRISIS_POST with explicit keywords ("die", "suicide", "kill", etc.) → CRITICAL
     * - HIGH_ENERGY_POST (non-crisis venting) → capped at HIGH
     */
    @PostConstruct
    @Transactional
    public void calibrateLegacyAlertSeverities() {
        try {
            List<CrisisAlert> allAlerts = alertRepository.findAll();
            int updatedAlerts = 0;
            for (CrisisAlert a : allAlerts) {
                boolean changed = false;
                if ("CRISIS_POST".equalsIgnoreCase(a.getAlertType())) {
                    String combined = (a.getTitle() != null ? a.getTitle() : "") + " "
                            + (a.getMessage() != null ? a.getMessage() : "") + " "
                            + (a.getFlaggedKeywords() != null ? a.getFlaggedKeywords() : "");
                    List<CrisisKeywordService.KeywordMatch> matches = crisisKeywordService.scan(combined);
                    String clinicalSev = crisisKeywordService.determineSeverity(matches).toUpperCase();
                    if ("CRITICAL".equals(clinicalSev) && !"CRITICAL".equalsIgnoreCase(a.getSeverity())) {
                        a.setSeverity("CRITICAL");
                        changed = true;
                    }
                } else if ("HIGH_ENERGY_POST".equalsIgnoreCase(a.getAlertType())) {
                    if ("CRITICAL".equalsIgnoreCase(a.getSeverity())) {
                        a.setSeverity("HIGH");
                        changed = true;
                    }
                }

                // Also calibrate outreachStatus based on the latest linked chat session state
                ChatSession targetSess = null;
                if (a.getChatSessionId() != null && !a.getChatSessionId().isBlank()) {
                    targetSess = sessionRepository.findBySessionId(a.getChatSessionId()).orElse(null);
                }
                if (targetSess == null && a.getPseudonym() != null && !a.getPseudonym().isBlank()) {
                    List<ChatSession> pSessions = sessionRepository.findByStudentPseudonymOrderByCreatedAtDesc(a.getPseudonym());
                    if (!pSessions.isEmpty()) {
                        targetSess = pSessions.get(0);
                        a.setChatSessionId(targetSess.getSessionId());
                        changed = true;
                    }
                }
                if (targetSess != null) {
                    if (targetSess.isDeletedByStudent() || "CLOSED".equals(targetSess.getStatus())) {
                        if (!"CONCLUDED".equals(a.getOutreachStatus())) {
                            a.setOutreachStatus("CONCLUDED");
                            changed = true;
                        }
                    } else if ("ACTIVE".equals(targetSess.getStatus())) {
                        if (!"ACTIVE".equals(a.getOutreachStatus())) {
                            a.setOutreachStatus("ACTIVE");
                            changed = true;
                        }
                    } else if ("DECLINED".equals(targetSess.getStatus())) {
                        if (!"DECLINED".equals(a.getOutreachStatus())) {
                            a.setOutreachStatus("DECLINED");
                            changed = true;
                        }
                    } else if ("INVITED".equals(targetSess.getStatus())) {
                        if (!"INVITED".equals(a.getOutreachStatus())) {
                            a.setOutreachStatus("INVITED");
                            changed = true;
                        }
                    }
                }

                // Also clean up redundant/duplicate resolution notes in database
                if (a.getResolutionNotes() != null && !a.getResolutionNotes().isBlank()) {
                    String cleanedNotes = cleanLegacyResolutionNotes(a.getResolutionNotes());
                    if (!Objects.equals(cleanedNotes, a.getResolutionNotes())) {
                        a.setResolutionNotes(cleanedNotes);
                        changed = true;
                    }
                }

                if (changed) {
                    alertRepository.save(a);
                    updatedAlerts++;
                }
            }
            if (updatedAlerts > 0) {
                log.info("Calibrated {} legacy alert(s) to match clinical crisis severity standards.", updatedAlerts);
            }

            // Also synchronize flagged post entities
            List<com.safe.space.model.Post> flaggedPosts = postRepository.findAll();
            for (com.safe.space.model.Post p : flaggedPosts) {
                if (p.isFlagged() && p.getContent() != null) {
                    List<CrisisKeywordService.KeywordMatch> matches = crisisKeywordService.scan(p.getContent());
                    String clinicalSev = crisisKeywordService.determineSeverity(matches);
                    if ("critical".equalsIgnoreCase(clinicalSev) && !"critical".equalsIgnoreCase(p.getSeverity())) {
                        p.setSeverity("critical");
                        postRepository.save(p);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not calibrate legacy alert severities: {}", e.getMessage());
        }
    }

    private boolean isRepetitiveOrKeyboardMash(String content) {
        if (content == null) return false;
        String trimmed = content.trim();
        if (trimmed.isEmpty()) return false;
        String clean = trimmed.toLowerCase().replaceAll("[^a-z0-9]", "");
        if (clean.length() >= 3 && clean.length() <= 20) {
            long uniqueChars = clean.chars().distinct().count();
            if (uniqueChars <= 3) {
                return true;
            }
        }
        return false;
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

        attachToOpenCaseIfPresent(alert, pseudonym);
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

    /**
     * If the student already has an open In-Progress casework alert (ACKNOWLEDGED), attach this new
     * alert directly to their ongoing case so it doesn't create fragmented cards across tabs.
     */
    private void attachToOpenCaseIfPresent(CrisisAlert alert, String pseudonym) {
        if (pseudonym == null || pseudonym.isBlank()) return;
        List<CrisisAlert> openCases = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                pseudonym, List.of("ACKNOWLEDGED"));
        if (!openCases.isEmpty()) {
            CrisisAlert activeCase = openCases.get(0);
            String currentOutreach = activeCase.getOutreachStatus();
            if ("ACTIVE".equalsIgnoreCase(currentOutreach) && activeCase.getChatSessionId() != null) {
                try {
                    java.util.Optional<com.safe.space.model.ChatSession> sessOpt = sessionRepository.findBySessionId(activeCase.getChatSessionId());
                    if (sessOpt.isEmpty() || !"ACTIVE".equalsIgnoreCase(sessOpt.get().getStatus()) || sessOpt.get().isDeletedByStudent()) {
                        currentOutreach = "CONCLUDED";
                        activeCase.setOutreachStatus("CONCLUDED");
                        alertRepository.save(activeCase);
                    }
                } catch (Exception ignored) {}
            }
            // For a brand new incoming alert requiring triage action, never inherit ACTIVE outreach
            if (!"ACTIVE".equalsIgnoreCase(currentOutreach)) {
                alert.setOutreachStatus(currentOutreach);
            }
            alert.setChatSessionId(activeCase.getChatSessionId());
            log.info("Attached new alert [{}] to existing in-progress case for pseudonym '{}' (assigned to {})",
                    alert.getAlertId(), pseudonym, activeCase.getAcknowledgedBy());
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

    /**
     * Resolve all active or acknowledged alerts for a specific student pseudonym (Case Resolution).
     */
    @Transactional
    public List<CrisisAlert> resolveAllForPseudonym(String pseudonym, String username, String notes) {
        if (pseudonym == null || pseudonym.isBlank()) {
            return List.of();
        }
        List<CrisisAlert> activeAlerts = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                pseudonym, List.of("ACTIVE", "ACKNOWLEDGED"));
        LocalDateTime now = LocalDateTime.now();
        String noteToAdd = (notes != null && !notes.isBlank()) ? notes : "Case resolved by clinician.";
        for (CrisisAlert a : activeAlerts) {
            a.setStatus("RESOLVED");
            a.setResolvedBy(username);
            a.setResolvedAt(now);
            String existingNotes = a.getResolutionNotes();
            a.setResolutionNotes(existingNotes != null && !existingNotes.isBlank()
                    ? existingNotes + "\n[Case Resolved] " + noteToAdd
                    : "[Case Resolved] " + noteToAdd);
        }
        List<CrisisAlert> saved = alertRepository.saveAll(activeAlerts);
        log.info("Batch resolved {} alert(s) for pseudonym '{}' by {}", saved.size(), pseudonym, username);
        return saved;
    }

    /**
     * Acknowledge all active alerts for a specific student pseudonym.
     */
    @Transactional
    public List<CrisisAlert> acknowledgeAllForPseudonym(String pseudonym, String username) {
        if (pseudonym == null || pseudonym.isBlank()) {
            return List.of();
        }
        List<CrisisAlert> alertsToUpdate = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                pseudonym, List.of("ACTIVE", "ACKNOWLEDGED"));
        LocalDateTime now = LocalDateTime.now();
        for (CrisisAlert a : alertsToUpdate) {
            a.setStatus("ACKNOWLEDGED");
            if (a.getAcknowledgedBy() == null || a.getAcknowledgedBy().isBlank()) {
                a.setAcknowledgedBy(username);
            }
            a.setAcknowledgedAt(now);
        }
        List<CrisisAlert> saved = alertRepository.saveAll(alertsToUpdate);
        log.info("Batch acknowledged {} alert(s) for pseudonym '{}' by {}", saved.size(), pseudonym, username);
        return saved;
    }

    // ── 4. ALERT QUERIES ──

    /**
     * Helper to get pseudonyms of all students currently with open in-progress casework.
     */
    private Set<String> getInProgressPseudonyms() {
        return alertRepository.findInProgressAlertsPrioritized().stream()
                .map(CrisisAlert::getPseudonym)
                .filter(p -> p != null && !p.isBlank())
                .collect(Collectors.toSet());
    }

    /**
     * Get all active alerts, prioritized by severity then time.
     * Excludes active rants from students who already have an open in-progress case
     * (those belong to the ongoing in-progress case).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getActiveAlerts() {
        Set<String> inProgressPseudonyms = getInProgressPseudonyms();
        return alertRepository.findActiveAlertsPrioritized().stream()
                .filter(a -> a.getPseudonym() == null || a.getPseudonym().isBlank() || !inProgressPseudonyms.contains(a.getPseudonym()))
                .map(this::toMap)
                .collect(Collectors.toList());
    }

    /**
     * Get all in-progress alerts, including both ACKNOWLEDGED alerts and any new ACTIVE
     * rants from students whose case is in progress, sorted newest first.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getInProgressAlerts() {
        List<CrisisAlert> acknowledged = alertRepository.findInProgressAlertsPrioritized();
        Set<String> inProgressPseudonyms = acknowledged.stream()
                .map(CrisisAlert::getPseudonym)
                .filter(p -> p != null && !p.isBlank())
                .collect(Collectors.toSet());

        List<CrisisAlert> result = new ArrayList<>(acknowledged);
        if (!inProgressPseudonyms.isEmpty()) {
            Set<String> existingAlertIds = result.stream()
                    .map(CrisisAlert::getAlertId)
                    .collect(Collectors.toSet());
            List<CrisisAlert> extraActive = alertRepository.findActiveAlertsPrioritized().stream()
                    .filter(a -> a.getPseudonym() != null && inProgressPseudonyms.contains(a.getPseudonym()))
                    .toList();
            for (CrisisAlert ea : extraActive) {
                if (!existingAlertIds.contains(ea.getAlertId())) {
                    result.add(ea);
                    existingAlertIds.add(ea.getAlertId());
                }
            }
        }

        result.sort((a, b) -> {
            if (b.getCreatedAt() == null || a.getCreatedAt() == null) return 0;
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });

        return result.stream()
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
     * Supports:
     *   "ARCHIVED"       → Archived resolved/escalated cases only
     *   "RESOLVED"       → Active (non-archived) resolved cases
     *   "ESCALATED"      → Active (non-archived) escalated cases
     *   "ACTIVE_HISTORY" → All unarchived resolved and escalated cases
     *   "ALL" or null    → All resolved and escalated cases (including archived flag so client can filter/count)
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAlertHistory(String statusFilter) {
        List<CrisisAlert> alerts;
        if ("ARCHIVED".equalsIgnoreCase(statusFilter)) {
            alerts = alertRepository.findByArchivedTrueOrderByCreatedAtDesc();
        } else if ("RESOLVED".equalsIgnoreCase(statusFilter)) {
            alerts = alertRepository.findByStatusAndArchivedFalseOrderByCreatedAtDesc("RESOLVED");
        } else if ("ESCALATED".equalsIgnoreCase(statusFilter)) {
            alerts = alertRepository.findByStatusAndArchivedFalseOrderByCreatedAtDesc("ESCALATED");
        } else if ("ACTIVE_HISTORY".equalsIgnoreCase(statusFilter)) {
            alerts = alertRepository.findByStatusInAndArchivedFalseOrderByCreatedAtDesc(List.of("RESOLVED", "ESCALATED"));
        } else {
            alerts = alertRepository.findByStatusInOrderByCreatedAtDesc(List.of("RESOLVED", "ESCALATED"));
        }
        return alerts.stream().map(this::toMap).collect(Collectors.toList());
    }

    /**
     * Archive an alert or its consolidated case (for a student pseudonym).
     */
    @Transactional
    public Map<String, Object> archiveAlertOrCase(String alertId, String username) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));
        LocalDateTime now = LocalDateTime.now();
        int count = 0;
        if (alert.getPseudonym() != null && !alert.getPseudonym().isBlank()) {
            List<CrisisAlert> siblingAlerts = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                    alert.getPseudonym(), List.of("RESOLVED", "ESCALATED"));
            for (CrisisAlert a : siblingAlerts) {
                a.setArchived(true);
                a.setArchivedAt(now);
                a.setArchivedBy(username);
            }
            alertRepository.saveAll(siblingAlerts);
            count = siblingAlerts.size();
        } else {
            alert.setArchived(true);
            alert.setArchivedAt(now);
            alert.setArchivedBy(username);
            alertRepository.save(alert);
            count = 1;
        }
        log.info("Archived {} alert(s) for alertId={} (pseudonym={}) by {}", count, alertId, alert.getPseudonym(), username);
        return Map.of("success", true, "archivedCount", count, "pseudonym", alert.getPseudonym() != null ? alert.getPseudonym() : "");
    }

    /**
     * Restore / unarchive an alert or its consolidated case back to active history.
     */
    @Transactional
    public Map<String, Object> unarchiveAlertOrCase(String alertId, String username) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));
        int count = 0;
        if (alert.getPseudonym() != null && !alert.getPseudonym().isBlank()) {
            List<CrisisAlert> siblingAlerts = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                    alert.getPseudonym(), List.of("RESOLVED", "ESCALATED"));
            for (CrisisAlert a : siblingAlerts) {
                a.setArchived(false);
                a.setArchivedAt(null);
                a.setArchivedBy(null);
            }
            alertRepository.saveAll(siblingAlerts);
            count = siblingAlerts.size();
        } else {
            alert.setArchived(false);
            alert.setArchivedAt(null);
            alert.setArchivedBy(null);
            alertRepository.save(alert);
            count = 1;
        }
        log.info("Restored/unarchived {} alert(s) for alertId={} (pseudonym={}) by {}", count, alertId, alert.getPseudonym(), username);
        return Map.of("success", true, "restoredCount", count, "pseudonym", alert.getPseudonym() != null ? alert.getPseudonym() : "");
    }

    /**
     * Permanently delete an alert or its consolidated case from the database.
     */
    @Transactional
    public Map<String, Object> deleteAlertOrCase(String alertId, String username) {
        CrisisAlert alert = alertRepository.findByAlertId(alertId)
                .orElseThrow(() -> new NoSuchElementException("Alert not found: " + alertId));
        int count = 0;
        if (alert.getPseudonym() != null && !alert.getPseudonym().isBlank()) {
            List<CrisisAlert> siblingAlerts = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                    alert.getPseudonym(), List.of("RESOLVED", "ESCALATED"));
            count = siblingAlerts.size();
            alertRepository.deleteAll(siblingAlerts);
        } else {
            count = 1;
            alertRepository.delete(alert);
        }
        log.info("Permanently deleted {} alert(s) for alertId={} (pseudonym={}) by {}", count, alertId, alert.getPseudonym(), username);
        return Map.of("success", true, "deletedCount", count, "pseudonym", alert.getPseudonym() != null ? alert.getPseudonym() : "");
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

        Set<String> inProgressPseudonyms = getInProgressPseudonyms();
        // Case-level counts (unique student incidents)
        long activeCases = alertRepository.findActiveAlertsPrioritized().stream()
                .filter(a -> a.getPseudonym() == null || a.getPseudonym().isBlank() || !inProgressPseudonyms.contains(a.getPseudonym()))
                .map(a -> (a.getPseudonym() != null && !a.getPseudonym().isBlank()) ? a.getPseudonym() : a.getAlertId())
                .distinct().count();
        long inProgressCases = alertRepository.findInProgressAlertsPrioritized().stream()
                .map(a -> (a.getPseudonym() != null && !a.getPseudonym().isBlank()) ? a.getPseudonym() : a.getAlertId())
                .distinct().count();
        long resolvedCases = alertRepository.findByStatusInOrderByCreatedAtDesc(List.of("RESOLVED", "ESCALATED")).stream()
                .map(a -> (a.getPseudonym() != null && !a.getPseudonym().isBlank()) ? a.getPseudonym() : a.getAlertId())
                .distinct().count();

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

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalAlerts", total);
        stats.put("active", active);
        stats.put("acknowledged", acknowledged);
        stats.put("inProgress", acknowledged);
        stats.put("activeCases", activeCases);
        stats.put("inProgressCases", inProgressCases);
        stats.put("resolvedCases", resolvedCases);
        stats.put("resolved", resolved);
        stats.put("escalated", escalated);
        stats.put("severityBreakdown", severityBreakdown);
        stats.put("typeBreakdown", typeBreakdown);
        stats.put("todayTotal", todayTotal);
        stats.put("todayCritical", todayCritical);
        return stats;
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
        return initiateChatFromAlert(alertId, professionalId, professionalName, false);
    }

    @Transactional
    public Map<String, Object> initiateChatFromAlert(String alertId, String professionalId,
            String professionalName, boolean force) {
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

                autoAcknowledgeCase(alert, professionalId, accepted.getSessionId(), "ACTIVE");

                return Map.of(
                        "status", "claimed_waiting",
                        "sessionId", accepted.getSessionId(),
                        "pseudonym", accepted.getStudentPseudonym(),
                        "professionalName", professionalName,
                        "message", "Connected to student's waiting chat session.");
            }

            // Case 2: Session is ACTIVE with THIS professional
            if ("ACTIVE".equals(existing.getStatus()) && professionalId.equals(existing.getProfessionalId())) {
                if (existing.isDeletedByProfessional()) {
                    existing.setDeletedByProfessional(false);
                    sessionRepository.save(existing);
                }
                autoAcknowledgeCase(alert, professionalId, existing.getSessionId(), "ACTIVE");
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
                if (existing.isDeletedByProfessional()) {
                    existing.setDeletedByProfessional(false);
                    sessionRepository.save(existing);
                }
                autoAcknowledgeCase(alert, professionalId, existing.getSessionId(), "INVITED");
                return Map.of(
                        "status", "invite_already_pending",
                        "sessionId", existing.getSessionId(),
                        "pseudonym", existing.getStudentPseudonym(),
                        "professionalName", professionalName,
                        "message", "An outreach invitation is already pending with this student. Awaiting student response.");
            }
        }

        // Check if student declined outreach (prefers to vent only) unless force is requested
        if (!force) {
            List<ChatSession> pastSessions = sessionRepository.findByStudentPseudonymOrderByCreatedAtDesc(alert.getPseudonym());
            if (!pastSessions.isEmpty()) {
                ChatSession latestSession = pastSessions.get(0);
                if ("DECLINED".equals(latestSession.getStatus())) {
                    return Map.of(
                            "status", "recently_declined",
                            "sessionId", latestSession.getSessionId(),
                            "pseudonym", alert.getPseudonym(),
                            "professionalName", professionalName,
                            "declinedAt", latestSession.getCreatedAt() != null ? latestSession.getCreatedAt().toString() : "",
                            "message", "Student " + alert.getPseudonym() + " declined outreach (prefers to vent only). Repeated invitations may feel intrusive. Re-inviting requires clinical confirmation.");
                }
            } else if ("DECLINED".equalsIgnoreCase(alert.getOutreachStatus())) {
                return Map.of(
                        "status", "recently_declined",
                        "pseudonym", alert.getPseudonym(),
                        "professionalName", professionalName,
                        "declinedAt", alert.getCreatedAt() != null ? alert.getCreatedAt().toString() : "",
                        "message", "Student " + alert.getPseudonym() + " declined outreach (prefers to vent only). Repeated invitations may feel intrusive. Re-inviting requires clinical confirmation.");
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

        autoAcknowledgeCase(alert, professionalId, inviteSession.getSessionId(), "INVITED");

        log.info("Crisis outreach invitation created: alertId={}, sessionId={}, professional={}, pseudonym={}, force={}",
                alertId, inviteSession.getSessionId(), professionalName, alert.getPseudonym(), force);

        return Map.of(
                "status", "invite_sent",
                "sessionId", inviteSession.getSessionId(),
                "pseudonym", alert.getPseudonym(),
                "professionalName", professionalName,
                "message", "Outreach invitation sent to student. Waiting for student to accept.");
    }

    private void autoAcknowledgeCase(CrisisAlert alert, String professionalId, String sessionId, String outreachStatus) {
        LocalDateTime now = LocalDateTime.now();
        alert.setStatus("ACKNOWLEDGED");
        alert.setAcknowledgedBy(professionalId);
        alert.setAcknowledgedAt(now);
        alert.setChatSessionId(sessionId);
        alert.setOutreachStatus(outreachStatus);
        alertRepository.save(alert);

        if (alert.getPseudonym() != null && !alert.getPseudonym().isBlank()) {
            List<CrisisAlert> openSiblings = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                    alert.getPseudonym(), List.of("ACTIVE"));
            for (CrisisAlert sibling : openSiblings) {
                if (!sibling.getAlertId().equals(alert.getAlertId())) {
                    sibling.setStatus("ACKNOWLEDGED");
                    sibling.setAcknowledgedBy(professionalId);
                    sibling.setAcknowledgedAt(now);
                    sibling.setChatSessionId(sessionId);
                    sibling.setOutreachStatus(outreachStatus);
                }
            }
            if (!openSiblings.isEmpty()) {
                alertRepository.saveAll(openSiblings);
                log.info("Auto-acknowledged {} additional active alert(s) for pseudonym '{}'", openSiblings.size(), alert.getPseudonym());
            }
        }
    }

    /**
     * Update outreach status for an alert linked to a chat session.
     * Called when student declines or closes the outreach session.
     */
    @Transactional
    public void updateAlertOutreachStatus(String sessionId, String outreachStatus, String notes) {
        List<CrisisAlert> alerts = new ArrayList<>(alertRepository.findByChatSessionIdOrderByCreatedAtDesc(sessionId));
        if (alerts.isEmpty()) {
            alertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc(sessionId).ifPresent(alerts::add);
        }

        if (!alerts.isEmpty()) {
            String pseudonym = alerts.get(0).getPseudonym();
            if (pseudonym != null && !pseudonym.isBlank()) {
                List<CrisisAlert> studentAlerts = alertRepository.findByPseudonymAndStatusInOrderByCreatedAtDesc(
                        pseudonym, List.of("ACKNOWLEDGED", "ACTIVE"));
                for (CrisisAlert sa : studentAlerts) {
                    if (!alerts.contains(sa)) {
                        alerts.add(sa);
                    }
                }
            }
            for (CrisisAlert a : alerts) {
                a.setOutreachStatus(outreachStatus);
                if (notes != null && !notes.isBlank()) {
                    String existing = a.getResolutionNotes();
                    a.setResolutionNotes(appendDeduplicatedNote(existing, notes));
                }
            }
            alertRepository.saveAll(alerts);
            log.info("Crisis alert outreachStatus updated to '{}' for {} alert(s) linked to sessionId={}",
                    outreachStatus, alerts.size(), sessionId);
        }
    }

    // ── EMAIL NOTIFICATION TO PROFESSIONALS ──

    /**
     * Dispatch crisis alert email to all active professionals with an email address.
     * Runs asynchronously so it never blocks the alert creation flow.
     */
    private void notifyProfessionalsByEmail(CrisisAlert alert) {
        try {
            String pseudonym = alert.getPseudonym();
            if (pseudonym != null && !pseudonym.isBlank()) {
                LocalDateTime lastSent = lastEmailDispatchPerPseudonym.get(pseudonym);
                if (lastSent != null && lastSent.isAfter(LocalDateTime.now().minusMinutes(15))) {
                    log.info("📧 Email alert debounced for pseudonym '{}' (last alert sent {}m ago)",
                            pseudonym, java.time.Duration.between(lastSent, LocalDateTime.now()).toMinutes());
                    return;
                }
                lastEmailDispatchPerPseudonym.put(pseudonym, LocalDateTime.now());
            }

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
        com.safe.space.model.ChatSession sess = null;
        if (a.getChatSessionId() != null && !a.getChatSessionId().isBlank()) {
            sess = sessionRepository.findBySessionId(a.getChatSessionId()).orElse(null);
        }
        if (sess == null && a.getPseudonym() != null && !a.getPseudonym().isBlank()) {
            List<com.safe.space.model.ChatSession> pSessions = sessionRepository.findByStudentPseudonymOrderByCreatedAtDesc(a.getPseudonym());
            if (!pSessions.isEmpty()) {
                sess = pSessions.get(0);
            }
        }
        if (sess != null) {
            String sessStatus = sess.getStatus();
            if (sess.isDeletedByStudent() || "CLOSED".equals(sessStatus)) {
                outreachStatus = "CONCLUDED";
            } else if ("ACTIVE".equals(sessStatus)) {
                if ("ACTIVE".equals(a.getStatus()) && (a.getAcknowledgedBy() == null || a.getAcknowledgedBy().isBlank())) {
                    outreachStatus = "NONE";
                } else {
                    outreachStatus = "ACTIVE";
                }
            } else if ("DECLINED".equals(sessStatus)) {
                outreachStatus = "DECLINED";
            } else if ("INVITED".equals(sessStatus)) {
                outreachStatus = "INVITED";
            }
        }
        map.put("outreachStatus", outreachStatus);
        map.put("chatSessionId", sess != null ? sess.getSessionId() : a.getChatSessionId());
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
        map.put("resolutionNotes", cleanLegacyResolutionNotes(a.getResolutionNotes()));
        map.put("archived", a.isArchived());
        map.put("archivedAt", a.getArchivedAt());
        map.put("archivedBy", a.getArchivedBy());
        map.put("createdAt", a.getCreatedAt());
        return map;
    }

    public static String cleanLegacyResolutionNotes(String notes) {
        if (notes == null || notes.isBlank()) return null;

        List<String> rawParts = new ArrayList<>();
        for (String line : notes.split("\\r?\\n")) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty()) {
                String[] sentences = trimmed.split("(?<=[.!?])\\s+");
                for (String s : sentences) {
                    String st = s.trim();
                    if (!st.isEmpty()) {
                        rawParts.add(st);
                    }
                }
            }
        }

        Set<String> unique = new LinkedHashSet<>();
        Set<String> seenLower = new HashSet<>();
        for (String part : rawParts) {
            String lower = part.toLowerCase();
            if (!seenLower.contains(lower)) {
                seenLower.add(lower);
                unique.add(part);
            }
        }

        boolean hasClosed = unique.stream().anyMatch(l ->
                l.toLowerCase().contains("session closed") || l.toLowerCase().contains("concluded"));

        List<String> filtered = new ArrayList<>();
        for (String item : unique) {
            if (hasClosed && (item.toLowerCase().contains("in active counseling")
                    || item.toLowerCase().contains("accepted outreach check-in"))) {
                continue;
            }
            filtered.add(item);
        }

        if (filtered.isEmpty()) {
            return unique.isEmpty() ? null : String.join(" ", unique);
        }
        return String.join(" ", filtered);
    }

    public static String appendDeduplicatedNote(String existing, String newNote) {
        if (newNote == null || newNote.isBlank()) return existing;
        String combined = (existing != null && !existing.isBlank()) ? existing + "\n" + newNote : newNote;
        return cleanLegacyResolutionNotes(combined);
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
