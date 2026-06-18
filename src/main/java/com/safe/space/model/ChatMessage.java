package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * An individual message within an anonymous chat session.
 *
 * Messages are attributed to a sender type ("student" or "professional")
 * and a display name (pseudonym for students, real name for professionals).
 * The student's real identity is never stored.
 */
@Entity
@Table(name = "chat_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Unique public message identifier. */
    @Column(nullable = false, unique = true)
    private String messageId;

    /** The session this message belongs to. */
    @Column(nullable = false)
    private String sessionId;

    /** Who sent the message: "student" or "professional". */
    @Column(nullable = false, length = 20)
    private String senderType;

    /** Display name of the sender (pseudonym for students). */
    @Column(nullable = false, length = 100)
    private String senderName;

    /** Message content. */
    @Column(nullable = false, length = 5000)
    private String content;

    /** Whether the recipient has read this message. */
    @Column(nullable = false)
    private boolean read;

    @Column(nullable = false, updatable = false)
    private LocalDateTime sentAt;

    @PrePersist
    protected void onCreate() {
        if (sentAt == null) sentAt = LocalDateTime.now();
    }
}
