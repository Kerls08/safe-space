package com.safe.space.service;

import com.safe.space.dto.*;
import com.safe.space.model.ChatMessage;
import com.safe.space.model.ChatSession;
import com.safe.space.repository.ChatMessageRepository;
import com.safe.space.repository.ChatSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Anonymized Communication service.
 *
 * Manages the lifecycle of anonymous chat sessions between
 * students (identified by pseudonym only) and professionals.
 *
 * Session lifecycle:
 *   1. Student initiates → status=WAITING, enters professional queue
 *   2. Professional accepts → status=ACTIVE, conversation begins
 *   3. Either party closes → status=CLOSED
 *
 * Crisis-flagged sessions are prioritized in the professional queue.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AnonymousChatService {

    private final ChatSessionRepository sessionRepository;
    private final ChatMessageRepository messageRepository;
    private final CrisisKeywordService crisisKeywordService;
    private final FallbackResponseService fallbackResponseService;

    private static final List<String> PSEUDONYM_SEEDS = List.of(
            "Willow", "Nova", "Echo", "Sol", "River",
            "Sky", "Leaf", "Sage", "Mira", "Kai",
            "Luna", "Fern", "Blaze", "Cedar", "Dew"
    );

    // ── Session Management ──

    /**
     * Student initiates a new anonymous chat session.
     * Auto-generates a pseudonym if not provided, scans topic for crisis keywords.
     */
    @Transactional
    public ChatSessionResponse createSession(ChatSessionRequest request) {
        String pseudonym = (request.getPseudonym() != null && !request.getPseudonym().isBlank())
                ? request.getPseudonym().trim()
                : generatePseudonym();

        // Scan topic for crisis keywords
        boolean crisisFlag = false;
        if (request.getTopic() != null && !request.getTopic().isBlank()) {
            crisisFlag = crisisKeywordService.isCrisis(request.getTopic());
        }

        String sessionId = "chat-" + Long.toString(System.currentTimeMillis(), 36)
                + "-" + UUID.randomUUID().toString().substring(0, 8);

        ChatSession session = ChatSession.builder()
                .sessionId(sessionId)
                .studentPseudonym(pseudonym)
                .status("WAITING")
                .topic(request.getTopic())
                .emotionTag(request.getEmotionTag())
                .energyScore(request.getEnergyScore())
                .crisisFlag(crisisFlag)
                .messageCount(0)
                .build();

        sessionRepository.save(session);

        log.info("Chat session created: sessionId={}, pseudonym={}, crisis={}, topic={}",
                sessionId, pseudonym, crisisFlag,
                request.getTopic() != null ? request.getTopic().substring(0, Math.min(50, request.getTopic().length())) : "none");

        return toSessionResponse(session, 0);
    }

    /**
     * Professional accepts a waiting session.
     * Transitions status from WAITING to ACTIVE.
     */
    @Transactional
    public ChatSessionResponse acceptSession(String sessionId, String professionalId, String professionalName) {
        ChatSession session = findSession(sessionId);

        if (!"WAITING".equals(session.getStatus())) {
            throw new IllegalStateException("Session is not in WAITING status. Current: " + session.getStatus());
        }

        session.setStatus("ACTIVE");
        session.setProfessionalId(professionalId);
        session.setProfessionalName(professionalName);
        session.setAcceptedAt(LocalDateTime.now());
        sessionRepository.save(session);

        log.info("Chat session accepted: sessionId={}, professional={}", sessionId, professionalName);

        return toSessionResponse(session, 0);
    }

    /**
     * Close a chat session.
     */
    @Transactional
    public ChatSessionResponse closeSession(String sessionId, String closedBy) {
        ChatSession session = findSession(sessionId);

        if ("CLOSED".equals(session.getStatus())) {
            throw new IllegalStateException("Session is already closed.");
        }

        session.setStatus("CLOSED");
        session.setClosedBy(closedBy);
        session.setClosedAt(LocalDateTime.now());
        sessionRepository.save(session);

        log.info("Chat session closed: sessionId={}, closedBy={}", sessionId, closedBy);

        return toSessionResponse(session, 0);
    }

    /**
     * Get a single session by ID.
     */
    @Transactional(readOnly = true)
    public ChatSessionResponse getSession(String sessionId) {
        ChatSession session = findSession(sessionId);
        long unread = messageRepository.countBySessionIdAndSenderTypeNotAndReadFalse(sessionId, "professional");
        return toSessionResponse(session, unread);
    }

    /**
     * Get all sessions for a student pseudonym.
     * Includes unread count (messages from professional/system that student hasn't read).
     */
    @Transactional(readOnly = true)
    public List<ChatSessionResponse> getStudentSessions(String pseudonym) {
        return sessionRepository.findByStudentPseudonymOrderByCreatedAtDesc(pseudonym).stream()
                .map(s -> {
                    // Count messages NOT from student that are unread = professional/system messages student hasn't seen
                    long unread = messageRepository.countBySessionIdAndSenderTypeNotAndReadFalse(
                            s.getSessionId(), "student");
                    return toSessionResponse(s, unread);
                })
                .collect(Collectors.toList());
    }

    /**
     * Get the professional's session queue.
     * Returns WAITING sessions (prioritized: crisis first, then by time)
     * and ACTIVE sessions for the given professional.
     */
    @Transactional(readOnly = true)
    public Map<String, List<ChatSessionResponse>> getProfessionalQueue(String professionalId) {
        // Waiting queue: crisis first, then chronological
        List<ChatSession> crisisWaiting = sessionRepository.findByStatusAndCrisisFlagTrueOrderByCreatedAtAsc("WAITING");
        List<ChatSession> allWaiting = sessionRepository.findByStatusOrderByCreatedAtAsc("WAITING");

        // Deduplicate: crisis first, then non-crisis
        Set<String> crisisIds = crisisWaiting.stream().map(ChatSession::getSessionId).collect(Collectors.toSet());
        List<ChatSession> nonCrisisWaiting = allWaiting.stream()
                .filter(s -> !crisisIds.contains(s.getSessionId()))
                .collect(Collectors.toList());

        List<ChatSessionResponse> waitingQueue = new ArrayList<>();
        crisisWaiting.forEach(s -> waitingQueue.add(toSessionResponse(s, 0)));
        nonCrisisWaiting.forEach(s -> waitingQueue.add(toSessionResponse(s, 0)));

        // Active sessions for this professional
        List<ChatSessionResponse> activeSessions = sessionRepository
                .findByProfessionalIdAndStatusOrderByCreatedAtDesc(professionalId, "ACTIVE").stream()
                .map(s -> {
                    long unread = messageRepository.countBySessionIdAndSenderTypeNotAndReadFalse(
                            s.getSessionId(), "professional");
                    return toSessionResponse(s, unread);
                })
                .collect(Collectors.toList());

        return Map.of("waiting", waitingQueue, "active", activeSessions);
    }

    // ── Messaging ──

    /**
     * Send a message in a chat session.
     * Only allowed in ACTIVE sessions (or the first message from a student in WAITING).
     */
    @Transactional
    public ChatMessageResponse sendMessage(ChatMessageRequest request) {
        if (request.getContent() == null || request.getContent().isBlank()) {
            throw new IllegalArgumentException("Message content cannot be empty.");
        }
        if (request.getContent().length() > 5000) {
            throw new IllegalArgumentException("Message content must not exceed 5000 characters.");
        }
        if (!"student".equals(request.getSenderType()) && !"professional".equals(request.getSenderType())) {
            throw new IllegalArgumentException("senderType must be 'student' or 'professional'.");
        }

        ChatSession session = findSession(request.getSessionId());

        // Students can message in WAITING (initial message) or ACTIVE sessions
        // Professionals can only message in ACTIVE sessions
        if ("professional".equals(request.getSenderType()) && !"ACTIVE".equals(session.getStatus())) {
            throw new IllegalStateException("Professionals can only message in ACTIVE sessions.");
        }
        if ("CLOSED".equals(session.getStatus())) {
            throw new IllegalStateException("Cannot send messages in a CLOSED session.");
        }

        String messageId = "msg-" + Long.toString(System.currentTimeMillis(), 36)
                + "-" + UUID.randomUUID().toString().substring(0, 6);

        ChatMessage message = ChatMessage.builder()
                .messageId(messageId)
                .sessionId(session.getSessionId())
                .senderType(request.getSenderType())
                .senderName(request.getSenderName())
                .content(request.getContent())
                .read(false)
                .build();

        messageRepository.save(message);

        // Update session message count
        session.setMessageCount(session.getMessageCount() + 1);
        sessionRepository.save(session);

        log.info("Message sent: messageId={}, sessionId={}, sender={}/{}",
                messageId, session.getSessionId(), request.getSenderType(), request.getSenderName());

        // ── Automated Fallback Response ──
        // When a student sends a message, check if a fallback is needed
        if ("student".equals(request.getSenderType())) {
            triggerFallbackIfNeeded(session, request.getContent());
        }

        return toMessageResponse(message);
    }

    /**
     * Get all messages in a session (chronological order).
     * Optionally marks messages as read for the given viewer type.
     */
    @Transactional
    public List<ChatMessageResponse> getMessages(String sessionId, String viewerType) {
        findSession(sessionId); // verify session exists

        List<ChatMessage> messages = messageRepository.findBySessionIdOrderBySentAtAsc(sessionId);

        // Mark messages as read for the viewer
        if (viewerType != null) {
            for (ChatMessage msg : messages) {
                if (!msg.isRead() && !msg.getSenderType().equals(viewerType)) {
                    msg.setRead(true);
                    messageRepository.save(msg);
                }
            }
        }

        return messages.stream()
                .map(this::toMessageResponse)
                .collect(Collectors.toList());
    }

    // ── Analytics ──

    @Transactional(readOnly = true)
    public ChatStatsResponse getStats() {
        long total = sessionRepository.count();
        List<Object[]> statusRows = sessionRepository.countByStatus();

        long waiting = 0, active = 0, closed = 0;
        List<ChatStatsResponse.StatusCount> statusDist = new ArrayList<>();
        for (Object[] row : statusRows) {
            String status = (String) row[0];
            long count = (Long) row[1];
            statusDist.add(new ChatStatsResponse.StatusCount(status, count));
            switch (status) {
                case "WAITING" -> waiting = count;
                case "ACTIVE" -> active = count;
                case "CLOSED" -> closed = count;
            }
        }

        long crisis = sessionRepository.countByCrisisFlagTrue();
        Double avgMessages = sessionRepository.avgMessageCountClosed();

        return ChatStatsResponse.builder()
                .totalSessions(total)
                .waitingSessions(waiting)
                .activeSessions(active)
                .closedSessions(closed)
                .crisisSessions(crisis)
                .avgMessagesPerSession(avgMessages)
                .statusDistribution(statusDist)
                .build();
    }

    // ── Fallback Logic ──

    /**
     * Checks if a fallback auto-response should be triggered after a student message.
     * Triggers when:
     *   - Session is WAITING (no professional assigned)
     *   - Session is ACTIVE but the assigned professional is offline
     */
    private void triggerFallbackIfNeeded(ChatSession session, String messageContent) {
        boolean shouldFallback = fallbackResponseService.shouldTriggerFallback(
                session.getStatus(), session.getProfessionalId());

        if (!shouldFallback) return;

        // Count existing fallback messages to determine if this is the first
        long studentMsgCount = messageRepository.countBySessionIdAndSenderType(
                session.getSessionId(), "student");
        boolean isFirstMessage = studentMsgCount <= 1;

        FallbackResponseService.FallbackResult fallback = fallbackResponseService.generateFallback(
                session.getEmotionTag(),
                session.getEnergyScore(),
                messageContent,
                session.getStatus(),
                isFirstMessage
        );

        // Insert system fallback message
        String fbMessageId = "fb-" + Long.toString(System.currentTimeMillis(), 36)
                + "-" + UUID.randomUUID().toString().substring(0, 6);

        ChatMessage fallbackMsg = ChatMessage.builder()
                .messageId(fbMessageId)
                .sessionId(session.getSessionId())
                .senderType("system")
                .senderName("SafeSpace Assistant")
                .content(fallback.message())
                .read(false)
                .build();

        messageRepository.save(fallbackMsg);
        session.setMessageCount(session.getMessageCount() + 1);
        sessionRepository.save(session);

        // If crisis was detected in the message, escalate the session
        if (fallback.crisisDetected() && !session.isCrisisFlag()) {
            session.setCrisisFlag(true);
            sessionRepository.save(session);
            log.warn("Crisis escalation via fallback: sessionId={}", session.getSessionId());
        }

        log.info("Fallback auto-reply sent: sessionId={}, type={}, crisis={}",
                session.getSessionId(), fallback.responseType(), fallback.crisisDetected());
    }

    // ── Private helpers ──

    private ChatSession findSession(String sessionId) {
        return sessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("Chat session not found: " + sessionId));
    }

    private ChatSessionResponse toSessionResponse(ChatSession s, long unreadCount) {
        return ChatSessionResponse.builder()
                .sessionId(s.getSessionId())
                .studentPseudonym(s.getStudentPseudonym())
                .professionalId(s.getProfessionalId())
                .professionalName(s.getProfessionalName())
                .status(s.getStatus())
                .topic(s.getTopic())
                .emotionTag(s.getEmotionTag())
                .energyScore(s.getEnergyScore())
                .crisisFlag(s.isCrisisFlag())
                .messageCount(s.getMessageCount())
                .unreadCount(unreadCount)
                .closedBy(s.getClosedBy())
                .createdAt(s.getCreatedAt())
                .acceptedAt(s.getAcceptedAt())
                .closedAt(s.getClosedAt())
                .build();
    }

    private ChatMessageResponse toMessageResponse(ChatMessage m) {
        return ChatMessageResponse.builder()
                .messageId(m.getMessageId())
                .sessionId(m.getSessionId())
                .senderType(m.getSenderType())
                .senderName(m.getSenderName())
                .content(m.getContent())
                .read(m.isRead())
                .sentAt(m.getSentAt())
                .build();
    }

    private String generatePseudonym() {
        Random random = new Random();
        String seed = PSEUDONYM_SEEDS.get(random.nextInt(PSEUDONYM_SEEDS.size()));
        int number = random.nextInt(9000) + 1000;
        return "Anon-" + seed + "-" + number;
    }
}
