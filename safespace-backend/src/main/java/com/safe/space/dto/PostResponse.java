package com.safe.space.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.safe.space.model.WellnessResource;
import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Post API response — contains only public-safe data.
 * ownerUsername is NEVER included (privacy by design).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PostResponse {

    private Long id;
    private String postId;
    private String pseudonym;
    private String content;
    private String emotionTag;
    private int energyScore;
    private boolean flagged;
    private String flaggedKeywords;
    private String severity;
    private String autoReply;
    private boolean reviewed;
    private String reviewedBy;
    private LocalDateTime reviewedAt;
    private LocalDateTime createdAt;

    /**
     * Contextual wellness resources relevant to the student's emotional state.
     * Only populated on post creation — never included in feed/list responses.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private List<WellnessResource> contextualResources;

    /**
     * Adaptive Calm-Down Kit prescription returned for crisis posts.
     * Provides guided breathing, grounding exercises, or reflective prompts.
     * Only populated when crisis keywords are detected in the post.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private CalmDownPrescription calmDownKit;
}

