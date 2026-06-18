package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;

/**
 * Chat session details returned to clients.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSessionResponse {

    private String sessionId;
    private String studentPseudonym;
    private String professionalId;
    private String professionalName;
    private String status;
    private String topic;
    private String emotionTag;
    private Integer energyScore;
    private boolean crisisFlag;
    private int messageCount;
    private long unreadCount;
    private String closedBy;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime closedAt;
}
