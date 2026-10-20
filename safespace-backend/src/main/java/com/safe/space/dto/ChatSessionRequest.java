package com.safe.space.dto;

import lombok.*;

/**
 * Request to initiate a new anonymous chat session.
 * The student provides an optional pseudonym, topic, and context.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSessionRequest {

    /** Optional pseudonym; auto-generated if not provided. */
    private String pseudonym;

    /** Optional topic or concern the student wants to discuss. */
    private String topic;

    /** Optional emotion tag for context. */
    private String emotionTag;

    /** Optional energy score for context. */
    private Integer energyScore;

    /**
     * Optional student user ID (authenticated username).
     * Used when a professional creates a session on behalf of a student
     * (e.g., from a crisis alert) so the student can discover the session.
     */
    private String studentUserId;

    /**
     * If true, supersedes/closes any previous open sessions for this student
     * and forces the creation of a brand-new chat session.
     */
    private boolean forceNew;
}
