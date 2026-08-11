package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Daily trend data for the monitoring dashboard.
 * Shows how emotional climate and engagement change over time.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardTrendsResponse {

    private int daysIncluded;
    private List<DailySnapshot> dailySnapshots;

    // ── Emotion trend over time ──
    private List<EmotionTrendPoint> emotionTrend;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DailySnapshot {
        private String date;
        private long postCount;
        private double avgEnergy;
        private long replyCount;
        private long kitPrescriptions;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class EmotionTrendPoint {
        private String date;
        private String emotion;
        private long count;
    }
}
