package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Anonymous Rant Board post entity.
 *
 * Privacy model:
 *   - ownerUsername is stored for audit/tracing but NEVER exposed in API responses
 *   - pseudonym is the only public-facing identity
 *   - Same user always gets the same pseudonym (session-persistent anonymity)
 *
 * Integration points:
 *   - CrisisKeywordService  → flagged, flaggedKeywords, severity
 *   - AutoReplyService      → autoReply (simple message stored, full response computed on read)
 *   - DashboardService      → emotion/energy trends, crisis alerts feed
 *   - EnergyScoreService    → energyScore analytics
 */
@Entity
@Table(name = "posts", indexes = {
        @Index(name = "idx_posts_created", columnList = "createdAt"),
        @Index(name = "idx_posts_flagged", columnList = "flagged"),
        @Index(name = "idx_posts_emotion", columnList = "emotionTag"),
        @Index(name = "idx_posts_owner", columnList = "ownerUsername")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String postId;

    /**
     * Authenticated username of the post creator.
     * NEVER exposed in API responses — used only for audit and pseudonym mapping.
     */
    @Column(length = 50)
    private String ownerUsername;

    /**
     * Public-facing anonymous identity. Generated deterministically per user
     * so the same user always gets the same pseudonym.
     */
    @Column(nullable = false, length = 100)
    private String pseudonym;

    @Column(nullable = false, length = 5000)
    private String content;

    @Column(nullable = false, length = 20)
    private String emotionTag;

    @Column(nullable = false)
    private int energyScore;

    @Column(nullable = false)
    private boolean flagged;

    @Column(length = 1000)
    private String flaggedKeywords;

    /**
     * Crisis severity level: NONE, LOW, MEDIUM, HIGH, CRITICAL.
     */
    @Column(length = 20)
    private String severity;

    @Column(length = 1000)
    private String autoReply;

    /**
     * Whether the post has been reviewed by a professional.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean reviewed = false;

    /**
     * Username of the professional who reviewed this post.
     */
    @Column(length = 50)
    private String reviewedBy;

    @Column
    private LocalDateTime reviewedAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
