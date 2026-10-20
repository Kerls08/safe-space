package com.safe.space.controller;

import com.safe.space.dto.*;
import com.safe.space.service.AnonymousChatService;
import com.safe.space.service.FallbackResponseService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST controller for Anonymized Communication.
 *
 * Session lifecycle:
 *   POST   /api/chat/sessions                              — Student initiates chat
 *   PUT    /api/chat/sessions/{id}/accept                   — Professional accepts
 *   PUT    /api/chat/sessions/{id}/accept-invite            — Student accepts outreach invite
 *   PUT    /api/chat/sessions/{id}/decline-invite           — Student declines outreach invite
 *   PUT    /api/chat/sessions/{id}/close                    — Close session
 *   GET    /api/chat/sessions/{id}                          — Get session details
 *   GET    /api/chat/sessions/student/{pseudonym}           — Student's sessions
 *   GET    /api/chat/sessions/professional/{professionalId} — Professional queue
 *
 * Messaging:
 *   POST   /api/chat/sessions/{id}/messages                 — Send a message
 *   GET    /api/chat/sessions/{id}/messages                 — Get messages
 *
 * Fallback:
 *   POST   /api/chat/heartbeat                              — Professional heartbeat
 *   GET    /api/chat/professional-status                    — Online status of all professionals
 *
 * Analytics:
 *   GET    /api/chat/stats                                  — Chat statistics
 */
@RestController
@RequestMapping("/api/chat")
public class AnonymousChatController {

    private final AnonymousChatService chatService;
    private final FallbackResponseService fallbackResponseService;

    public AnonymousChatController(AnonymousChatService chatService, FallbackResponseService fallbackResponseService) {
        this.chatService = chatService;
        this.fallbackResponseService = fallbackResponseService;
    }

    // ── Session Endpoints ──

    /**
     * Student initiates a new anonymous chat session.
     */
    @PostMapping("/sessions")
    public ResponseEntity<ChatSessionResponse> createSession(@RequestBody ChatSessionRequest request) {
        ChatSessionResponse response = chatService.createSession(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Professional accepts a waiting session.
     */
    @PutMapping("/sessions/{sessionId}/accept")
    public ResponseEntity<ChatSessionResponse> acceptSession(
            @PathVariable String sessionId,
            @RequestBody Map<String, String> body) {
        String professionalId = body.getOrDefault("professionalId", "");
        String professionalName = body.getOrDefault("professionalName", "Counselor");

        if (professionalId.isBlank()) {
            throw new IllegalArgumentException("professionalId is required.");
        }

        // Record heartbeat on accept (professional is clearly online)
        fallbackResponseService.recordHeartbeat(professionalId);

        ChatSessionResponse response = chatService.acceptSession(sessionId, professionalId, professionalName);
        return ResponseEntity.ok(response);
    }

    /**
     * Student accepts an outreach invitation.
     */
    @PutMapping("/sessions/{sessionId}/accept-invite")
    public ResponseEntity<ChatSessionResponse> acceptInvite(
            @PathVariable String sessionId,
            HttpServletRequest request) {
        String username = (String) request.getAttribute("auth.username");
        ChatSessionResponse response = chatService.acceptInvite(sessionId, username);
        return ResponseEntity.ok(response);
    }

    /**
     * Student declines an outreach invitation.
     */
    @PutMapping("/sessions/{sessionId}/decline-invite")
    public ResponseEntity<ChatSessionResponse> declineInvite(
            @PathVariable String sessionId,
            HttpServletRequest request) {
        String username = (String) request.getAttribute("auth.username");
        ChatSessionResponse response = chatService.declineInvite(sessionId, username);
        return ResponseEntity.ok(response);
    }

    /**
     * Close a chat session.
     */
    @PutMapping("/sessions/{sessionId}/close")
    public ResponseEntity<ChatSessionResponse> closeSession(
            @PathVariable String sessionId,
            @RequestBody Map<String, String> body) {
        String closedBy = body.getOrDefault("closedBy", "system");
        ChatSessionResponse response = chatService.closeSession(sessionId, closedBy);
        return ResponseEntity.ok(response);
    }

    /**
     * Delete a chat session and all its messages.
     * Allowed for student owner, assigned professional, or admin.
     */
    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Map<String, Object>> deleteSession(
            @PathVariable String sessionId,
            @RequestParam(required = false) String pseudonym,
            HttpServletRequest request) {
        String username = (String) request.getAttribute("auth.username");
        String role = (String) request.getAttribute("auth.role");
        com.safe.space.model.User user = (com.safe.space.model.User) request.getAttribute("auth.user");
        String institutionalId = user != null ? user.getInstitutionalId() : null;
        chatService.deleteSession(sessionId, username, institutionalId, role, pseudonym);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "sessionId", sessionId,
                "message", "Conversation deleted successfully."
        ));
    }

    /**
     * Get a single session by ID.
     */
    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<ChatSessionResponse> getSession(@PathVariable String sessionId) {
        return ResponseEntity.ok(chatService.getSession(sessionId));
    }

    /**
     * Get all sessions for a student pseudonym.
     */
    @GetMapping("/sessions/student/{pseudonym}")
    public ResponseEntity<List<ChatSessionResponse>> getStudentSessions(@PathVariable String pseudonym) {
        return ResponseEntity.ok(chatService.getStudentSessions(pseudonym));
    }

    /**
     * Get all sessions linked to a student's user account.
     * This discovers sessions created on behalf of the student
     * (e.g., from crisis alerts) in addition to student-initiated ones.
     */
    @GetMapping("/sessions/user/{userId}")
    public ResponseEntity<List<ChatSessionResponse>> getStudentSessionsByUserId(@PathVariable String userId) {
        return ResponseEntity.ok(chatService.getStudentSessionsByUserId(userId));
    }

    /**
     * Get the professional's session queue (waiting + active sessions).
     */
    @GetMapping("/sessions/professional/{professionalId}")
    public ResponseEntity<Map<String, List<ChatSessionResponse>>> getProfessionalQueue(
            @PathVariable String professionalId) {
        // Record heartbeat when professional checks their queue
        fallbackResponseService.recordHeartbeat(professionalId);
        return ResponseEntity.ok(chatService.getProfessionalQueue(professionalId));
    }

    // ── Message Endpoints ──

    /**
     * Send a message in a chat session.
     */
    @PostMapping("/sessions/{sessionId}/messages")
    public ResponseEntity<ChatMessageResponse> sendMessage(
            @PathVariable String sessionId,
            @RequestBody ChatMessageRequest request) {
        request.setSessionId(sessionId);
        ChatMessageResponse response = chatService.sendMessage(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Get all messages in a session.
     * Pass ?viewer=student or ?viewer=professional to auto-mark messages as read.
     */
    @GetMapping("/sessions/{sessionId}/messages")
    public ResponseEntity<List<ChatMessageResponse>> getMessages(
            @PathVariable String sessionId,
            @RequestParam(required = false) String viewer) {
        return ResponseEntity.ok(chatService.getMessages(sessionId, viewer));
    }

    // ── Fallback / Presence Endpoints ──

    /**
     * Professional heartbeat — call periodically to indicate online status.
     * If heartbeat stops, the system considers the professional offline
     * and activates fallback auto-responses for their sessions.
     */
    @PostMapping("/heartbeat")
    public ResponseEntity<Map<String, Object>> heartbeat(@RequestBody Map<String, String> body) {
        String professionalId = body.getOrDefault("professionalId", "");
        String sessionId = body.getOrDefault("sessionId", "");
        if (professionalId.isBlank() && sessionId.isBlank()) {
            throw new IllegalArgumentException("professionalId or sessionId is required.");
        }
        if (!professionalId.isBlank()) {
            fallbackResponseService.recordHeartbeat(professionalId);
        }
        if (!sessionId.isBlank()) {
            fallbackResponseService.recordStudentHeartbeat(sessionId);
        }
        return ResponseEntity.ok(Map.of(
                "status", "online",
                "professionalId", professionalId,
                "sessionId", sessionId
        ));
    }

    /**
     * Professional or student explicitly logs out or leaves chat — mark offline immediately.
     */
    @PostMapping("/offline")
    public ResponseEntity<Map<String, Object>> offline(@RequestBody Map<String, String> body) {
        String professionalId = body.getOrDefault("professionalId", "");
        String sessionId = body.getOrDefault("sessionId", "");
        if (!professionalId.isBlank()) {
            fallbackResponseService.recordOffline(professionalId);
        }
        if (!sessionId.isBlank()) {
            fallbackResponseService.recordStudentOffline(sessionId);
        }
        return ResponseEntity.ok(Map.of(
                "status", "offline",
                "professionalId", professionalId,
                "sessionId", sessionId
        ));
    }

    /**
     * Get online/offline status of all tracked professionals.
     */
    @GetMapping("/professional-status")
    public ResponseEntity<Map<String, Object>> getProfessionalStatus() {
        return ResponseEntity.ok(fallbackResponseService.getProfessionalStatus());
    }

    // ── Analytics ──

    /**
     * Get chat system statistics.
     */
    @GetMapping("/stats")
    public ResponseEntity<ChatStatsResponse> getStats() {
        return ResponseEntity.ok(chatService.getStats());
    }

    // ── Exception Handlers ──

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidation(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, String>> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }
}
