package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Energy score trend data over time.
 * Contains daily data points for charting campus mood over days/weeks.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EnergyTrendResponse {

    private int days;                    // number of days covered
    private double overallAverage;
    private String trend;                // "rising", "falling", "stable"
    private List<DailyDataPoint> daily;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DailyDataPoint {
        private String date;             // yyyy-MM-dd
        private double averageEnergy;
        private long postCount;
        private String tier;             // "low", "mid", "high"
    }
}
