package com.safe.space.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Wellness Resource — represents a mental health support resource that can be
 * contextually linked to student emotional states and crisis levels.
 *
 * Types:
 *   HOTLINE       — Emergency numbers (e.g., 911, local crisis lines)
 *   CAMPUS        — On-campus services (counseling center, health clinic)
 *   ARTICLE       — DEPRECATED for student delivery (ethics review: risk of self-diagnosis)
 *   EXTERNAL_LINK — Third-party wellness platforms and tools
 *   CHAT_SERVICE  — Online chat/text support services
 *
 * Note: ARTICLE category resources are filtered out from all student-facing
 * endpoints per psychometrician ethics review. Articles presenting symptoms
 * or diagnostic content can trigger self-diagnosis in emotionally vulnerable
 * students, compromising Safe Space's ethical mandate. Students should be
 * directed to professional support (hotlines, campus services) instead.
 *
 * Resources are tagged with relevant emotions and energy thresholds so the
 * system can serve contextually appropriate resources to students based on
 * their current emotional state.
 */
@Entity
@Table(name = "wellness_resources", indexes = {
    @Index(name = "idx_wr_category", columnList = "category"),
    @Index(name = "idx_wr_active", columnList = "active"),
    @Index(name = "idx_wr_priority", columnList = "priority")
})
public class WellnessResource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Display title (e.g., "National Crisis Hotline") */
    @Column(nullable = false, length = 200)
    private String title;

    /** Brief description of the resource */
    @Column(length = 500)
    private String description;

    /** URL, phone number, or actionable link */
    @Column(nullable = false, length = 500)
    private String link;

    /**
     * Resource category.
     * HOTLINE | CAMPUS | ARTICLE | EXTERNAL_LINK | CHAT_SERVICE
     */
    @Column(nullable = false, length = 20)
    private String category;

    /**
     * Comma-separated emotion tags this resource is relevant to.
     * e.g., "Sad,Lonely,Anxious" — empty means relevant to all emotions.
     */
    @Column(name = "emotion_tags", length = 300)
    private String emotionTags;

    /**
     * Minimum energy score threshold for relevance.
     * Resources with minEnergy=8 only appear for high-distress students.
     * 0 means always relevant.
     */
    @Column(name = "min_energy")
    private int minEnergy = 0;

    /**
     * Maximum energy score threshold for relevance.
     * 10 means always relevant.
     */
    @Column(name = "max_energy")
    private int maxEnergy = 10;

    /**
     * Whether this resource is flagged for crisis situations only.
     */
    @Column(name = "crisis_only")
    private boolean crisisOnly = false;

    /**
     * Display priority (lower = shown first). Default 50.
     */
    @Column(nullable = false)
    private int priority = 50;

    /**
     * Icon class for frontend rendering (e.g., "fas fa-phone", "fas fa-building")
     */
    @Column(length = 50)
    private String icon;

    /** Active/soft-delete flag */
    @Column(nullable = false)
    private boolean active = true;

    /** Who created this resource */
    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── Getters & Setters ──

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getLink() { return link; }
    public void setLink(String link) { this.link = link; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getEmotionTags() { return emotionTags; }
    public void setEmotionTags(String emotionTags) { this.emotionTags = emotionTags; }

    public int getMinEnergy() { return minEnergy; }
    public void setMinEnergy(int minEnergy) { this.minEnergy = minEnergy; }

    public int getMaxEnergy() { return maxEnergy; }
    public void setMaxEnergy(int maxEnergy) { this.maxEnergy = maxEnergy; }

    public boolean isCrisisOnly() { return crisisOnly; }
    public void setCrisisOnly(boolean crisisOnly) { this.crisisOnly = crisisOnly; }

    public int getPriority() { return priority; }
    public void setPriority(int priority) { this.priority = priority; }

    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
