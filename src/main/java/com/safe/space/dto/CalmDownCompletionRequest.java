package com.safe.space.dto;

import lombok.*;

/**
 * Request to mark a Calm-Down Kit session as completed.
 * Allows the student to report how long they engaged and how they feel after.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CalmDownCompletionRequest {

    /** The session ID returned in the prescription. */
    private String sessionId;

    /** How long the student engaged with the kit, in seconds. */
    private Integer durationSeconds;

    /** Self-reported feeling after: "better", "same", or "worse". */
    private String feedbackRating;
}
