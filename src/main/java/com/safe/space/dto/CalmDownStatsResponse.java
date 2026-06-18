package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Analytics on Calm-Down Kit usage and effectiveness.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CalmDownStatsResponse {

    private long totalPrescriptions;
    private long totalCompleted;
    private double completionRate;
    private long crisisSessions;

    /** Prescription count per kit type. */
    private List<KitTypeCount> kitTypeDistribution;

    /** Completion rate per kit type. */
    private List<KitTypeCompletion> kitTypeCompletion;

    /** Average engagement duration per kit type (seconds). */
    private List<KitTypeDuration> kitTypeDuration;

    /** Feedback distribution (better/same/worse). */
    private List<FeedbackCount> feedbackDistribution;

    /** Feedback breakdown per kit type. */
    private List<KitTypeFeedback> feedbackByKitType;

    /** Daily prescription volume. */
    private List<DailyCount> dailyVolume;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class KitTypeCount {
        private String kitType;
        private long count;
        private double percent;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class KitTypeCompletion {
        private String kitType;
        private long prescribed;
        private long completed;
        private double completionRate;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class KitTypeDuration {
        private String kitType;
        private double avgDurationSeconds;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class FeedbackCount {
        private String rating;
        private long count;
        private double percent;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class KitTypeFeedback {
        private String kitType;
        private String rating;
        private long count;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DailyCount {
        private String date;
        private long count;
    }
}
