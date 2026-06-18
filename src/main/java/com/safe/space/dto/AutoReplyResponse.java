package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Rich auto-reply response containing the message, tier classification,
 * the specific rule matched, suggested actions, and support resources.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutoReplyResponse {

    /** The supportive reply message. */
    private String message;

    /** The tier that was selected: "low", "mid", "high", or "crisis". */
    private String tier;

    /** The specific rule that matched (e.g. "CRISIS_OVERRIDE", "HIGH_Sad"). */
    private String ruleMatched;

    /** The emotion tag that was evaluated. */
    private String emotionTag;

    /** The energy score that was evaluated. */
    private int energyScore;

    /** Whether crisis keywords were detected in the content. */
    private boolean crisisDetected;

    /** Ordered list of suggested actions for the user. */
    private List<SuggestedAction> suggestedActions;

    /** Support resources relevant to the tier/severity. */
    private List<SupportResource> resources;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SuggestedAction {
        /** e.g. "breathing", "grounding", "journaling", "contact_pro" */
        private String type;
        private String title;
        private String description;
        private int priority;  // 1 = highest
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SupportResource {
        /** e.g. "hotline", "email", "link" */
        private String type;
        private String label;
        private String value;  // phone number, email, or URL
        private boolean urgent;
    }
}
