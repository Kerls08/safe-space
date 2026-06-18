package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * The adaptive Calm-Down Kit prescription returned on the post-submission
 * success screen. Content varies based on the student's energy score.
 *
 * Tiers:
 *   Score 1–3 (Low)      → "quote"     — Positive quote + reflective prompt
 *   Score 4–7 (Moderate)  → "breathing" — Interactive breathing pacer instructions
 *   Score 8–10 (High)     → "grounding" — 5-4-3-2-1 grounding exercise + resources
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CalmDownPrescription {

    /** Unique session ID for tracking completion. */
    private String sessionId;

    /** The prescribed kit type: "quote", "breathing", or "grounding". */
    private String kitType;

    /** Human-readable tier label. */
    private String tierLabel;

    /** The energy score that determined this prescription. */
    private int energyScore;

    /** The emotion tag from the post. */
    private String emotionTag;

    /** Whether crisis keywords were detected (escalates resources). */
    private boolean crisisDetected;

    /** Brief explanation of why this kit was chosen. */
    private String rationale;

    // ── Kit-specific content (only one will be populated) ──

    /** For "quote" kit: positive quote and reflective prompt. */
    private QuoteContent quoteContent;

    /** For "breathing" kit: breathing pacer configuration. */
    private BreathingContent breathingContent;

    /** For "grounding" kit: 5-4-3-2-1 grounding steps. */
    private GroundingContent groundingContent;

    /** Support resources (always present for high tier, optional for others). */
    private List<Resource> resources;

    // ── Inner DTOs ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class QuoteContent {
        private String quote;
        private String author;
        private String reflectivePrompt;
        private String followUpTip;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BreathingContent {
        private String patternName;
        private String description;
        private int inhaleSeconds;
        private int holdSeconds;
        private int exhaleSeconds;
        private int holdAfterExhaleSeconds;
        private int recommendedCycles;
        private int totalDurationSeconds;
        private List<BreathingStep> steps;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BreathingStep {
        private int order;
        private String phase;         // "inhale", "hold", "exhale", "holdAfterExhale"
        private int durationSeconds;
        private String instruction;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class GroundingContent {
        private String techniqueName;
        private String introduction;
        private List<GroundingStep> steps;
        private String completionMessage;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class GroundingStep {
        private int order;
        private int count;            // 5, 4, 3, 2, 1
        private String sense;         // "see", "touch", "hear", "smell", "taste"
        private String instruction;
        private String placeholder;   // input field hint
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Resource {
        private String type;          // "hotline", "email", "link"
        private String label;
        private String value;
        private boolean urgent;
    }
}
