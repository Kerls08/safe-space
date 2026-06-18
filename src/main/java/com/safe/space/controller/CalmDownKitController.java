package com.safe.space.controller;

import com.safe.space.dto.CalmDownCompletionRequest;
import com.safe.space.dto.CalmDownPrescription;
import com.safe.space.dto.CalmDownStatsResponse;
import com.safe.space.service.CalmDownKitService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST controller for the adaptive Calm-Down Kit.
 *
 * The kit is "prescribed" on the post-submission success screen based
 * on the student's Rant Energy Score, making the system adaptive:
 *
 *   Score 1–3  → Positive quote + reflective prompt
 *   Score 4–7  → Interactive breathing pacer
 *   Score 8–10 → 5-4-3-2-1 grounding technique + resources
 *
 * Endpoints:
 *   POST /api/calm-down/prescribe        — Get an adaptive prescription
 *   POST /api/calm-down/complete         — Mark a session as completed
 *   GET  /api/calm-down/stats            — Usage and effectiveness analytics
 */
@RestController
@RequestMapping("/api/calm-down")
@RequiredArgsConstructor
public class CalmDownKitController {

    private final CalmDownKitService calmDownKitService;

    /**
     * Prescribe a Calm-Down Kit based on the student's energy score.
     * Called immediately after a rant post is submitted.
     *
     * @param body must contain: energyScore (1–10), emotionTag;
     *             optional: postId, content (for crisis detection)
     */
    @PostMapping("/prescribe")
    public ResponseEntity<CalmDownPrescription> prescribe(@RequestBody Map<String, Object> body) {
        int energyScore = getInt(body, "energyScore", 5);
        String emotionTag = getString(body, "emotionTag", "Neutral");
        String postId = getString(body, "postId", null);
        String content = getString(body, "content", null);

        if (energyScore < 1 || energyScore > 10) {
            throw new IllegalArgumentException("energyScore must be between 1 and 10.");
        }

        CalmDownPrescription prescription = calmDownKitService.prescribe(
                energyScore, emotionTag, postId, content);
        return ResponseEntity.status(HttpStatus.CREATED).body(prescription);
    }

    /**
     * Mark a Calm-Down Kit session as completed.
     * Allows the student to report engagement duration and how they feel.
     */
    @PostMapping("/complete")
    public ResponseEntity<Map<String, Object>> completeSession(
            @RequestBody CalmDownCompletionRequest request) {
        if (request.getSessionId() == null || request.getSessionId().isBlank()) {
            throw new IllegalArgumentException("sessionId is required.");
        }
        Map<String, Object> result = calmDownKitService.completeSession(request);
        return ResponseEntity.ok(result);
    }

    /**
     * Retrieve Calm-Down Kit usage and effectiveness statistics.
     * Includes completion rates, engagement durations, and student feedback.
     */
    @GetMapping("/stats")
    public ResponseEntity<CalmDownStatsResponse> getStats() {
        return ResponseEntity.ok(calmDownKitService.getStats());
    }

    // ── Helpers ──

    private int getInt(Map<String, Object> body, String key, int defaultVal) {
        Object val = body.get(key);
        if (val instanceof Number n) return n.intValue();
        if (val instanceof String s) { try { return Integer.parseInt(s); } catch (Exception e) { /* fall through */ } }
        return defaultVal;
    }

    private String getString(Map<String, Object> body, String key, String defaultVal) {
        Object val = body.get(key);
        return val != null ? val.toString() : defaultVal;
    }

    // ── Exception handlers ──

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidation(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }
}
