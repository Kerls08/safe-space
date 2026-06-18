package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Represents an anonymous chat session between a student and a professional.
 *
 * The student is identified only by a pseudonym — their real identity
 * is never stored or exposed. The professional is identified by their
 * role-based name/ID for accountability.
 *
 * Lifecycle: WAITING → ACTIVE → CLOSED
 */
@Entity
@Table(name = "chat_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Unique public session identifier. */
    @Column(nullable = false, unique = true)
    private String sessionId;

    /** Student's anonymous pseudonym (never their real name). */
    @Column(nullable = false, length = 100)
    private String studentPseudonym;

    /** ID of the assigned professional (null while waiting). */
    @Column(length = 100)
    private String professionalId;

    /** Display name of the assigned professional. */
    @Column(length = 100)
    private String professionalName;

    /**
     * Session status:
     *   WAITING  — student initiated, waiting for a professional
     *   ACTIVE   — professional accepted, conversation in progress
     *   CLOSED   — session ended by either party
     */
    @Column(nullable = false, length = 20)
    private String status;

    /** Optional topic/concern the student described when starting the session. */
    @Column(length = 500)
    private String topic;

    /** The emotion tag the student was feeling (from their last post, if any). */
    @Column(length = 20)
    private String emotionTag;

    /** Energy score at the time of initiating chat (if available). */
    @Column
    private Integer energyScore;

    /** Whether crisis keywords were detected in the topic/initial message. */
    @Column(nullable = false)
    private boolean crisisFlag;

    /** Total message count in this session. */
    @Column(nullable = false)
    private int messageCount;

    /** Who closed the session: "student", "professional", or "system". */
    @Column(length = 20)
    private String closedBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime acceptedAt;

    @Column
    private LocalDateTime closedAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (status == null) status = "WAITING";
    }
}
