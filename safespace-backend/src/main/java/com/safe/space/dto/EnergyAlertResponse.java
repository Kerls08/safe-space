package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;

/**
 * Lightweight post representation for high-energy alert listings.
 * Omits full content to protect anonymity while still providing
 * essential context to professionals.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnergyAlertResponse {

    private String postId;
    private String pseudonym;
    private String emotionTag;
    private int energyScore;
    private boolean flagged;
    private String contentPreview;  // first 200 chars only
    private String autoReply;
    private LocalDateTime createdAt;
}
