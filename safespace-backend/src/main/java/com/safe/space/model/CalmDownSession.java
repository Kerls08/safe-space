package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Tracks each Calm-Down Kit session prescribed to a student.
 * Records what was prescribed, whether the student completed it,
 * and how long they engaged — enabling effectiveness analysis.
 */
@Entity
@Table(name = "calm_down_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CalmDownSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String sessionId;

    /** Link to the post that triggered this prescription (nullable for standalone use). */
    @Column
    private String postId;

    /** The energy score that determined the prescription. */
    @Column(nullable = false)
    private int energyScore;

    /** The emotion tag from the post. */
    @Column(length = 20)
    private String emotionTag;

    /** The prescribed kit type: "quote", "breathing", "grounding". */
    @Column(nullable = false, length = 20)
    private String kitType;

    /** The specific content ID prescribed (e.g. quote index, breathing pattern name). */
    @Column(length = 50)
    private String contentId;

    /** Whether crisis keywords were detected in the associated post. */
    @Column(nullable = false)
    private boolean crisisDetected;

    /** Whether the student marked this session as completed. */
    @Column(nullable = false)
    private boolean completed;

    /** Timestamp when the student completed the session (null if not completed). */
    @Column
    private LocalDateTime completedAt;

    /** Duration in seconds the student engaged with the kit (reported on completion). */
    @Column
    private Integer durationSeconds;

    /** Student's self-reported feeling after completing: "better", "same", "worse" (optional). */
    @Column(length = 20)
    private String feedbackRating;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
