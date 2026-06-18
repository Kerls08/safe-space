package com.safe.space.controller;

import com.safe.space.dto.AutoReplyRequest;
import com.safe.space.dto.AutoReplyResponse;
import com.safe.space.dto.AutoReplyStatsResponse;
import com.safe.space.service.AutoReplyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for the Rule-Based Auto-Reply system.
 *
 * Endpoints:
 *   POST /api/auto-reply/generate      — Generate a full structured auto-reply
 *   POST /api/auto-reply/preview       — Preview a reply without logging (dry-run)
 *   GET  /api/auto-reply/rules         — View all available reply rules
 *   GET  /api/auto-reply/stats         — Auto-reply usage analytics
 */
@RestController
@RequestMapping("/api/auto-reply")
@RequiredArgsConstructor
public class AutoReplyController {

    private final AutoReplyService autoReplyService;

    /**
     * Generate a full auto-reply and log it to the database.
     *
     * Evaluates rules in priority order (crisis → high → mid → low),
     * returns structured response with message, suggested actions, and resources.
     */
    @PostMapping("/generate")
    public ResponseEntity<AutoReplyResponse> generateReply(@RequestBody AutoReplyRequest request) {
        validate(request);
        AutoReplyResponse response = autoReplyService.generateFullReply(request, true);
        return ResponseEntity.ok(response);
    }

    /**
     * Preview a reply without persisting (dry-run mode).
     * Useful for testing or admin review of what a given input would produce.
     */
    @PostMapping("/preview")
    public ResponseEntity<AutoReplyResponse> previewReply(@RequestBody AutoReplyRequest request) {
        validate(request);
        AutoReplyResponse response = autoReplyService.generateFullReply(request, false);
        return ResponseEntity.ok(response);
    }

    /**
     * Retrieve all available reply rules organized by tier → emotion → message.
     * Allows professionals to review and audit the complete rule set.
     */
    @GetMapping("/rules")
    public ResponseEntity<Map<String, Map<String, String>>> getAllRules() {
        return ResponseEntity.ok(autoReplyService.getAllRules());
    }

    /**
     * Retrieve auto-reply usage statistics.
     * Includes tier/emotion/rule distributions and daily volume.
     */
    @GetMapping("/stats")
    public ResponseEntity<AutoReplyStatsResponse> getStats() {
        return ResponseEntity.ok(autoReplyService.getStats());
    }

    // ── Validation ──

    private void validate(AutoReplyRequest request) {
        if (request.getEmotionTag() == null || request.getEmotionTag().isBlank()) {
            throw new IllegalArgumentException("emotionTag is required.");
        }
        if (request.getEnergyScore() < 1 || request.getEnergyScore() > 10) {
            throw new IllegalArgumentException("energyScore must be between 1 and 10.");
        }
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidation(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
