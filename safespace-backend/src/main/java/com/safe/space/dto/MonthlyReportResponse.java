package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Monthly Psychological & Emotional Climate Situationer DTO.
 * Formatted for Guidance Counselors and Psychometricians at USTP Balubal Campus.
 * Composed strictly with aggregated metrics and anonymized identifiers
 * in compliance with RA 10173 (Data Privacy Act of 2012) and RA 11036 (Mental Health Act).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MonthlyReportResponse {

    // ── 1. Institutional Metadata ──
    private int year;
    private int month;
    private String monthName; // e.g. "September 2026"
    private String startDate; // e.g. "2026-09-01"
    private String endDate;   // e.g. "2026-09-30"
    private String institution; // "University of Science and Technology of Southern Philippines"
    private String campus; // "Balubal Campus, Cagayan de Oro City"
    private String departmentUnit; // "Guidance & Counseling Center / Psychometrician Unit"
    private String confidentialityNotice;
    private LocalDateTime generatedAt;
    private String generatedBy;
    private String generatedByRole;

    // ── 2. Executive Key Metrics ──
    private long totalExpressions;
    private double averageEnergyScore;
    private String climateStatus; // "Calm & Stable", "Moderate Academic Tension", "Elevated Distress"
    private long totalCrisisAlerts;
    private long flaggedPosts;
    private long crisisChatSessions;
    private long totalSupportDialogues;
    private long activeSupportDialogues;
    private long closedSupportDialogues;
    private long groundingPrescriptions;
    private long groundingCompletions;
    private double groundingCompletionRate;
    private long uniqueActiveStudents;

    // ── 3. Energy Stratification ──
    private long energyLow;      // 1-3
    private long energyModerate; // 4-7
    private long energyHigh;     // 8-10
    private double energyLowPct;
    private double energyModeratePct;
    private double energyHighPct;

    // ── 4. Ranked Emotion Breakdown ──
    private List<EmotionStat> emotionBreakdown;

    // ── 5. Department & Academic Level Distribution ──
    private List<DepartmentStat> departmentBreakdown;
    private List<YearLevelStat> yearLevelBreakdown;

    // ── 6. Crisis Incidents & Trigger Audit (Strictly Anonymized) ──
    private List<CrisisIncidentItem> crisisIncidents;
    private long crisisReviewedCount;
    private long crisisPendingCount;

    // ── 7. Support Dialogues Breakdown ──
    private List<SupportDialogueItem> recentDialogues;
    private Double avgMessagesPerChat;

    // ── 8. Grounding Kit Modality Breakdown ──
    private List<KitModalityStat> kitModalities;

    // ── 9. Clinical Observations & Institutional Action Plan ──
    private List<String> clinicalObservations;
    private List<String> actionRecommendations;

    // ── Nested Classes ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class EmotionStat {
        private String emotion;
        private long count;
        private double percentage;
        private double avgEnergy;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DepartmentStat {
        private String department;
        private long count;
        private double percentage;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class YearLevelStat {
        private String yearLevel;
        private long count;
        private double percentage;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CrisisIncidentItem {
        private String incidentId;
        private String source; // "RANT_POST" or "SUPPORT_CHAT"
        private String pseudonym;
        private String severity; // "CRITICAL", "HIGH", "MODERATE"
        private String summary;
        private String flaggedKeywords;
        private String emotionTag;
        private int energyScore;
        private boolean reviewed;
        private String reviewedBy;
        private LocalDateTime timestamp;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class SupportDialogueItem {
        private String sessionId;
        private String studentPseudonym;
        private String professionalName;
        private String status;
        private String topic;
        private String emotionTag;
        private int messageCount;
        private boolean crisisFlag;
        private LocalDateTime createdAt;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class KitModalityStat {
        private String kitType;
        private long prescribedCount;
        private long completedCount;
        private double completionRate;
    }
}
