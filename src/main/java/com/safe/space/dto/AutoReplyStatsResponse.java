package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Statistics on auto-reply usage: tier distribution, emotion distribution,
 * most-triggered rules, and daily volume trends.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AutoReplyStatsResponse {

    private long totalReplies;
    private long crisisReplies;
    private double crisisPercent;

    /** Counts per tier (low, mid, high, crisis). */
    private List<TierCount> tierDistribution;

    /** Counts per emotion tag. */
    private List<EmotionCount> emotionDistribution;

    /** Most frequently triggered rules. */
    private List<RuleCount> topRules;

    /** Daily reply volume. */
    private List<DailyCount> dailyVolume;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class TierCount {
        private String tier;
        private long count;
        private double percent;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class EmotionCount {
        private String emotion;
        private long count;
        private double percent;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class RuleCount {
        private String rule;
        private long count;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class DailyCount {
        private String date;
        private long count;
    }
}
