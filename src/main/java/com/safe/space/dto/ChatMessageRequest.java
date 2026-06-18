package com.safe.space.dto;

import lombok.*;

/**
 * Request to send a message in a chat session.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessageRequest {

    /** The session to send the message in. */
    private String sessionId;

    /** Who is sending: "student" or "professional". */
    private String senderType;

    /** Display name of the sender (pseudonym for students). */
    private String senderName;

    /** The message content. */
    private String content;
}
