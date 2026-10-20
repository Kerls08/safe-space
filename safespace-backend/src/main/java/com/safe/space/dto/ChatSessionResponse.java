package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;

/**
 * Chat session details returned to clients.
 */
@Getter
@Setter
@Builder
public class ChatSessionResponse {

    private String sessionId;
    private String studentPseudonym;
    private String studentUserId;
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
    private boolean studentOnline;
    private boolean professionalOnline;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime closedAt;

    public ChatSessionResponse() {
    }

    public ChatSessionResponse(String sessionId, String studentPseudonym, String studentUserId,
                               String professionalId, String professionalName, String status,
                               String topic, String emotionTag, Integer energyScore,
                               boolean crisisFlag, int messageCount, long unreadCount,
                               String closedBy, boolean studentOnline, boolean professionalOnline,
                               LocalDateTime createdAt, LocalDateTime acceptedAt, LocalDateTime closedAt) {
        this.sessionId = sessionId;
        this.studentPseudonym = studentPseudonym;
        this.studentUserId = studentUserId;
        this.professionalId = professionalId;
        this.professionalName = professionalName;
        this.status = status;
        this.topic = topic;
        this.emotionTag = emotionTag;
        this.energyScore = energyScore;
        this.crisisFlag = crisisFlag;
        this.messageCount = messageCount;
        this.unreadCount = unreadCount;
        this.closedBy = closedBy;
        this.studentOnline = studentOnline;
        this.professionalOnline = professionalOnline;
        this.createdAt = createdAt;
        this.acceptedAt = acceptedAt;
        this.closedAt = closedAt;
    }
}
