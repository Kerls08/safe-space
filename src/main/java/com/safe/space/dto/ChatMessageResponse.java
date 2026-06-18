package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;

/**
 * Chat message returned to clients.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessageResponse {

    private String messageId;
    private String sessionId;
    private String senderType;
    private String senderName;
    private String content;
    private boolean read;
    private LocalDateTime sentAt;
}
