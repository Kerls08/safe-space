package com.safe.space.service;

import com.safe.space.dto.EnergyAlertResponse;
import com.safe.space.dto.EnergyStatsResponse;
import com.safe.space.dto.EnergyTrendResponse;
import com.safe.space.model.Post;
import com.safe.space.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for energy score analytics.
 *
 * Provides:
 *   1. Overall energy statistics with tier distribution
 *   2. Per-emotion energy breakdown
 *   3. Daily energy trends for charting
 *   4. High-energy alert listings for professionals
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EnergyScoreService {

    private final PostRepository postRepository;

    /**
     * Compute comprehensive energy statistics.
     *
     * Includes overall average, today's average, this week's average,
     * tier distribution (low/mid/high counts and percentages),
     * and per-emotion breakdown.
     */
    @Transactional(readOnly = true)
    public EnergyStatsResponse getEnergyStats() {
        long totalPosts = postRepository.count();

        if (totalPosts == 0) {
            return EnergyStatsResponse.builder()
                    .totalPosts(0)
                    .averageEnergy(0)
                    .averageEnergyToday(0)
                    .averageEnergyThisWeek(0)
                    .tiers(EnergyStatsResponse.TierDistribution.builder()
                            .lowCount(0).midCount(0).highCount(0)
                            .lowPercent(0).midPercent(0).highPercent(0)
                            .build())
                    .emotionBreakdown(List.of())
                    .build();
        }

        // ── Overall averages ──
        double avgAll = postRepository.findAverageEnergyScore();

        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        LocalDateTime todayEnd = LocalDate.now().atTime(LocalTime.MAX);
        double avgToday = postRepository.findAverageEnergyScoreBetween(todayStart, todayEnd);

        LocalDateTime weekStart = LocalDate.now().minusDays(7).atStartOfDay();
        double avgWeek = postRepository.findAverageEnergyScoreBetween(weekStart, todayEnd);

        // ── Tier distribution ──
        long lowCount = postRepository.countByEnergyScoreBetween(1, 4);
        long midCount = postRepository.countByEnergyScoreBetween(5, 7);
        long highCount = postRepository.countByEnergyScoreBetween(8, 10);

        EnergyStatsResponse.TierDistribution tiers = EnergyStatsResponse.TierDistribution.builder()
                .lowCount(lowCount)
                .midCount(midCount)
                .highCount(highCount)
                .lowPercent(percent(lowCount, totalPosts))
                .midPercent(percent(midCount, totalPosts))
                .highPercent(percent(highCount, totalPosts))
                .build();

        // ── Per-emotion breakdown ──
        List<Object[]> emotionRows = postRepository.findAverageEnergyByEmotion();
        List<EnergyStatsResponse.EmotionEnergy> emotionBreakdown = emotionRows.stream()
                .map(row -> EnergyStatsResponse.EmotionEnergy.builder()
                        .emotion((String) row[0])
                        .averageEnergy(roundTwo((Double) row[1]))
                        .postCount((Long) row[2])
                        .tier(tierLabel((Double) row[1]))
                        .build())
                .collect(Collectors.toList());

        log.info("Energy stats computed: totalPosts={}, avgAll={}, avgToday={}, low={}, mid={}, high={}",
                totalPosts, roundTwo(avgAll), roundTwo(avgToday), lowCount, midCount, highCount);

        return EnergyStatsResponse.builder()
                .totalPosts(totalPosts)
                .averageEnergy(roundTwo(avgAll))
                .averageEnergyToday(roundTwo(avgToday))
                .averageEnergyThisWeek(roundTwo(avgWeek))
                .tiers(tiers)
                .emotionBreakdown(emotionBreakdown)
                .build();
    }

    /**
     * Get daily energy trends over the past N days.
     * Returns data points suitable for line/bar chart rendering.
     *
     * @param days number of days to look back (default 30)
     */
    @Transactional(readOnly = true)
    public EnergyTrendResponse getEnergyTrends(int days) {
        if (days <= 0) days = 30;
        if (days > 365) days = 365;

        LocalDateTime since = LocalDate.now().minusDays(days).atStartOfDay();
        List<Object[]> dailyRows = postRepository.findDailyEnergyTrends(since);

        List<EnergyTrendResponse.DailyDataPoint> dataPoints = new ArrayList<>();
        for (Object[] row : dailyRows) {
            String date = row[0] != null ? row[0].toString() : "";
            double avg = row[1] != null ? (Double) row[1] : 0;
            long count = row[2] != null ? (Long) row[2] : 0;
            dataPoints.add(EnergyTrendResponse.DailyDataPoint.builder()
                    .date(date)
                    .averageEnergy(roundTwo(avg))
                    .postCount(count)
                    .tier(tierLabel(avg))
                    .build());
        }

        // ── Determine trend direction ──
        String trendDirection = "stable";
        if (dataPoints.size() >= 2) {
            // Compare first half average vs second half average
            int mid = dataPoints.size() / 2;
            double firstHalf = dataPoints.subList(0, mid).stream()
                    .mapToDouble(EnergyTrendResponse.DailyDataPoint::getAverageEnergy)
                    .average().orElse(0);
            double secondHalf = dataPoints.subList(mid, dataPoints.size()).stream()
                    .mapToDouble(EnergyTrendResponse.DailyDataPoint::getAverageEnergy)
                    .average().orElse(0);
            double diff = secondHalf - firstHalf;
            if (diff > 0.5) trendDirection = "rising";
            else if (diff < -0.5) trendDirection = "falling";
        }

        double overallAvg = dataPoints.stream()
                .mapToDouble(EnergyTrendResponse.DailyDataPoint::getAverageEnergy)
                .average().orElse(0);

        log.info("Energy trends computed: days={}, dataPoints={}, trend={}",
                days, dataPoints.size(), trendDirection);

        return EnergyTrendResponse.builder()
                .days(days)
                .overallAverage(roundTwo(overallAvg))
                .trend(trendDirection)
                .daily(dataPoints)
                .build();
    }

    /**
     * Get posts with energy score at or above the given threshold.
     * Used by professionals to identify students in high distress.
     *
     * @param threshold minimum energy score (default 8)
     */
    @Transactional(readOnly = true)
    public List<EnergyAlertResponse> getHighEnergyAlerts(int threshold) {
        if (threshold < 1) threshold = 8;
        if (threshold > 10) threshold = 10;

        List<Post> posts = postRepository.findByEnergyScoreGreaterThanEqualOrderByCreatedAtDesc(threshold);

        log.info("High-energy alerts: threshold={}, found={}", threshold, posts.size());

        return posts.stream()
                .map(this::toAlertResponse)
                .collect(Collectors.toList());
    }

    // ── Private helpers ──

    private EnergyAlertResponse toAlertResponse(Post post) {
        String preview = post.getContent();
        if (preview != null && preview.length() > 200) {
            preview = preview.substring(0, 200) + "…";
        }
        return EnergyAlertResponse.builder()
                .postId(post.getPostId())
                .pseudonym(post.getPseudonym())
                .emotionTag(post.getEmotionTag())
                .energyScore(post.getEnergyScore())
                .flagged(post.isFlagged())
                .contentPreview(preview)
                .autoReply(post.getAutoReply())
                .createdAt(post.getCreatedAt())
                .build();
    }

    private String tierLabel(double avg) {
        if (avg >= 8) return "high";
        if (avg >= 5) return "mid";
        return "low";
    }

    private double roundTwo(double val) {
        return Math.round(val * 100.0) / 100.0;
    }

    private double percent(long part, long total) {
        if (total == 0) return 0;
        return roundTwo((part * 100.0) / total);
    }
}
