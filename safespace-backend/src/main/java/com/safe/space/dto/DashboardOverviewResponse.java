package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Centralized dashboard response for the psychometrician.
 * Aggregates data from all subsystems: Posts, Energy, Auto-Reply,
 * Calm-Down Kit, and Anonymous Chat into a single monitoring view.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardOverviewResponse {

    // ── Campus-Wide Snapshot ──
    private long totalPosts;
    private long totalPostsToday;
    private long flaggedPosts;
    private double averageEnergyScore;
    private double averageEnergyToday;

    // ── Crisis Summary ──
    private long crisisPostsTotal;
    private long crisisChatSessions;
    private long crisisCalmDownSessions;
    private long totalCrisisEvents;

    // ── Energy Distribution ──
    private long energyLow;     // 1-3
    private long energyModerate; // 4-7
    private long energyHigh;    // 8-10

    // ── Emotion Breakdown ──
    private List<EmotionStat> emotionBreakdown;

    // ── Auto-Reply Engagement ──
    private long totalAutoReplies;
    private List<TierCount> replyTierDistribution;

    // ── Calm-Down Kit Effectiveness ──
    private long totalKitPrescriptions;
    private long kitCompletions;
    private double kitCompletionRate;

    // ── Chat Activity ──
    private long chatSessionsTotal;
    private long chatSessionsWaiting;
    private long chatSessionsActive;
    private long chatSessionsClosed;
    private Double avgMessagesPerChat;

    // ── Nested DTOs ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class EmotionStat {
        private String emotion;
        private long count;
        private double avgEnergy;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class TierCount {
        private String tier;
        private long count;
    }
}
