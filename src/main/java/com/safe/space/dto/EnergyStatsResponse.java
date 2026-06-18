package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Comprehensive energy score statistics response.
 * Provides overall stats, tier distribution, and per-emotion breakdown.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnergyStatsResponse {

    // ── Overall statistics ──
    private long totalPosts;
    private double averageEnergy;
    private double averageEnergyToday;
    private double averageEnergyThisWeek;

    // ── Tier distribution ──
    private TierDistribution tiers;

    // ── Per-emotion breakdown ──
    private List<EmotionEnergy> emotionBreakdown;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TierDistribution {
        private long lowCount;       // energy 1–4
        private long midCount;       // energy 5–7
        private long highCount;      // energy 8–10
        private double lowPercent;
        private double midPercent;
        private double highPercent;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class EmotionEnergy {
        private String emotion;
        private double averageEnergy;
        private long postCount;
        private String tier;         // "low", "mid", "high"
    }
}
