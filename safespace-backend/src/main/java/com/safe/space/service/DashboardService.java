package com.safe.space.service;

import com.safe.space.dto.*;
import com.safe.space.model.ChatSession;
import com.safe.space.model.Post;
import com.safe.space.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Psychometrician Monitoring Dashboard service.
 *
 * Aggregates data from ALL subsystems (Posts, Auto-Reply, Calm-Down Kit,
 * Chat) into unified views for the administrative monitoring interface.
 *
 * Three primary views:
 *   1. Overview   — campus-wide snapshot with key metrics
 *   2. Alerts     — real-time crisis feed (flagged posts + crisis chats)
 *   3. Trends     — daily time-series for emotional climate tracking
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DashboardService {

    private final PostRepository postRepository;
    private final AutoReplyLogRepository autoReplyLogRepository;
    private final CalmDownSessionRepository calmDownSessionRepository;
    private final ChatSessionRepository chatSessionRepository;

    // ── 1. OVERVIEW ──

    @Transactional(readOnly = true)
    public DashboardOverviewResponse getOverview() {
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        LocalDateTime todayEnd = LocalDate.now().atTime(LocalTime.MAX);

        // Posts
        long totalPosts = postRepository.count();
        long totalPostsToday = postRepository.countByCreatedAtBetween(todayStart, todayEnd);
        long flaggedPosts = postRepository.countByFlaggedTrue();
        double avgEnergy = totalPosts > 0 ? postRepository.findAverageEnergyScore() : 0;
        double avgEnergyToday = totalPostsToday > 0
                ? postRepository.findAverageEnergyScoreBetween(todayStart, todayEnd) : 0;

        // Energy distribution
        long energyLow = postRepository.countByEnergyScoreBetween(1, 3);
        long energyMod = postRepository.countByEnergyScoreBetween(4, 7);
        long energyHigh = postRepository.countByEnergyScoreBetween(8, 10);

        // Crisis aggregation
        long crisisPosts = flaggedPosts;
        long crisisChats = chatSessionRepository.countByCrisisFlagTrue();
        long crisisKits = calmDownSessionRepository.countByCrisisDetectedTrue();

        // Emotion breakdown
        List<Object[]> emotionRows = postRepository.findAverageEnergyByEmotion();
        List<DashboardOverviewResponse.EmotionStat> emotionStats = emotionRows.stream()
                .map(r -> DashboardOverviewResponse.EmotionStat.builder()
                        .emotion((String) r[0])
                        .avgEnergy(((Number) r[1]).doubleValue())
                        .count(((Number) r[2]).longValue())
                        .build())
                .collect(Collectors.toList());

        // Auto-Reply
        long totalReplies = autoReplyLogRepository.count();
        List<Object[]> tierRows = autoReplyLogRepository.countByTier();
        List<DashboardOverviewResponse.TierCount> tierDist = tierRows.stream()
                .map(r -> DashboardOverviewResponse.TierCount.builder()
                        .tier((String) r[0])
                        .count(((Number) r[1]).longValue())
                        .build())
                .collect(Collectors.toList());

        // Calm-Down Kit
        long totalKits = calmDownSessionRepository.count();
        long kitDone = calmDownSessionRepository.countByCompletedTrue();
        double kitRate = totalKits > 0 ? Math.round(((double) kitDone / totalKits) * 1000.0) / 10.0 : 0;

        // Chat
        long chatTotal = chatSessionRepository.count();
        long chatWaiting = 0, chatActive = 0, chatClosed = 0;
        for (Object[] row : chatSessionRepository.countByStatus()) {
            String status = (String) row[0];
            long count = ((Number) row[1]).longValue();
            switch (status) {
                case "WAITING" -> chatWaiting = count;
                case "ACTIVE" -> chatActive = count;
                case "CLOSED" -> chatClosed = count;
            }
        }
        Double avgMsgs = chatSessionRepository.avgMessageCountClosed();

        return DashboardOverviewResponse.builder()
                .totalPosts(totalPosts)
                .totalPostsToday(totalPostsToday)
                .flaggedPosts(flaggedPosts)
                .averageEnergyScore(Math.round(avgEnergy * 10.0) / 10.0)
                .averageEnergyToday(Math.round(avgEnergyToday * 10.0) / 10.0)
                .crisisPostsTotal(crisisPosts)
                .crisisChatSessions(crisisChats)
                .crisisCalmDownSessions(crisisKits)
                .totalCrisisEvents(crisisPosts + crisisChats + crisisKits)
                .energyLow(energyLow)
                .energyModerate(energyMod)
                .energyHigh(energyHigh)
                .emotionBreakdown(emotionStats)
                .totalAutoReplies(totalReplies)
                .replyTierDistribution(tierDist)
                .totalKitPrescriptions(totalKits)
                .kitCompletions(kitDone)
                .kitCompletionRate(kitRate)
                .chatSessionsTotal(chatTotal)
                .chatSessionsWaiting(chatWaiting)
                .chatSessionsActive(chatActive)
                .chatSessionsClosed(chatClosed)
                .avgMessagesPerChat(avgMsgs)
                .build();
    }

    // ── 2. ALERTS ──

    @Transactional(readOnly = true)
    public DashboardAlertsResponse getAlerts() {
        List<DashboardAlertsResponse.Alert> alerts = new ArrayList<>();

        // Flagged posts → critical alerts
        List<Post> flagged = postRepository.findByFlaggedTrueOrderByCreatedAtDesc();
        for (Post p : flagged) {
            alerts.add(DashboardAlertsResponse.Alert.builder()
                    .alertType("flagged_post")
                    .severity("critical")
                    .referenceId(p.getPostId())
                    .summary(truncate(p.getContent(), 120))
                    .emotionTag(p.getEmotionTag())
                    .energyScore(p.getEnergyScore())
                    .flaggedKeywords(p.getFlaggedKeywords())
                    .status("needs_review")
                    .timestamp(p.getCreatedAt())
                    .build());
        }

        // Crisis chat sessions → critical alerts
        List<ChatSession> crisisWaiting = chatSessionRepository
                .findByStatusAndCrisisFlagTrueOrderByCreatedAtAsc("WAITING");
        for (ChatSession cs : crisisWaiting) {
            alerts.add(DashboardAlertsResponse.Alert.builder()
                    .alertType("crisis_chat")
                    .severity("critical")
                    .referenceId(cs.getSessionId())
                    .summary("Crisis chat waiting: " + truncate(cs.getTopic(), 100))
                    .emotionTag(cs.getEmotionTag())
                    .energyScore(cs.getEnergyScore())
                    .status("WAITING")
                    .timestamp(cs.getCreatedAt())
                    .build());
        }

        // Active crisis chats → high alerts
        List<ChatSession> allActive = chatSessionRepository.findByStatusOrderByCreatedAtAsc("ACTIVE");
        for (ChatSession cs : allActive) {
            if (cs.isCrisisFlag()) {
                alerts.add(DashboardAlertsResponse.Alert.builder()
                        .alertType("crisis_chat")
                        .severity("high")
                        .referenceId(cs.getSessionId())
                        .summary("Active crisis chat with " + cs.getProfessionalName()
                                + ": " + truncate(cs.getTopic(), 80))
                        .emotionTag(cs.getEmotionTag())
                        .energyScore(cs.getEnergyScore())
                        .status("ACTIVE")
                        .timestamp(cs.getCreatedAt())
                        .build());
            }
        }

        // High energy posts (8+) → moderate alerts
        List<Post> highEnergy = postRepository.findByEnergyScoreGreaterThanEqualOrderByCreatedAtDesc(8);
        for (Post p : highEnergy) {
            if (!p.isFlagged()) { // avoid duplicates with flagged
                alerts.add(DashboardAlertsResponse.Alert.builder()
                        .alertType("high_energy_post")
                        .severity("moderate")
                        .referenceId(p.getPostId())
                        .summary(truncate(p.getContent(), 120))
                        .emotionTag(p.getEmotionTag())
                        .energyScore(p.getEnergyScore())
                        .status("monitor")
                        .timestamp(p.getCreatedAt())
                        .build());
            }
        }

        // Sort: critical first, then high, then moderate; within same severity by newest
        alerts.sort((a, b) -> {
            int sevOrder = severityOrder(a.getSeverity()) - severityOrder(b.getSeverity());
            if (sevOrder != 0) return sevOrder;
            return b.getTimestamp().compareTo(a.getTimestamp());
        });

        return DashboardAlertsResponse.builder()
                .totalAlerts(alerts.size())
                .alerts(alerts)
                .build();
    }

    // ── 3. TRENDS ──

    @Transactional(readOnly = true)
    public DashboardTrendsResponse getTrends(int days) {
        LocalDateTime since = LocalDate.now().minusDays(days).atStartOfDay();

        // Daily post + energy trends
        List<Object[]> dailyEnergy = postRepository.findDailyEnergyTrends(since);
        List<Object[]> dailyReplies = autoReplyLogRepository.countDailyReplies(since);
        List<Object[]> dailyKits = calmDownSessionRepository.countDailySessions(since);

        // Index reply and kit counts by date string for merging
        Map<String, Long> replyByDate = new HashMap<>();
        for (Object[] r : dailyReplies) replyByDate.put(r[0].toString(), ((Number) r[1]).longValue());
        Map<String, Long> kitByDate = new HashMap<>();
        for (Object[] r : dailyKits) kitByDate.put(r[0].toString(), ((Number) r[1]).longValue());

        List<DashboardTrendsResponse.DailySnapshot> snapshots = new ArrayList<>();
        for (Object[] row : dailyEnergy) {
            String date = row[0].toString();
            snapshots.add(DashboardTrendsResponse.DailySnapshot.builder()
                    .date(date)
                    .postCount(((Number) row[2]).longValue())
                    .avgEnergy(Math.round(((Number) row[1]).doubleValue() * 10.0) / 10.0)
                    .replyCount(replyByDate.getOrDefault(date, 0L))
                    .kitPrescriptions(kitByDate.getOrDefault(date, 0L))
                    .build());
        }

        // Daily emotion breakdown
        List<Object[]> emotionRows = postRepository.findDailyEmotionBreakdown(since);
        List<DashboardTrendsResponse.EmotionTrendPoint> emotionTrend = emotionRows.stream()
                .map(r -> DashboardTrendsResponse.EmotionTrendPoint.builder()
                        .date(r[0].toString())
                        .emotion((String) r[1])
                        .count(((Number) r[2]).longValue())
                        .build())
                .collect(Collectors.toList());

        return DashboardTrendsResponse.builder()
                .daysIncluded(days)
                .dailySnapshots(snapshots)
                .emotionTrend(emotionTrend)
                .build();
    }

    // ── Helpers ──

    private int severityOrder(String severity) {
        return switch (severity) {
            case "critical" -> 0;
            case "high" -> 1;
            case "moderate" -> 2;
            default -> 3;
        };
    }

    private String truncate(String s, int len) {
        if (s == null) return "";
        return s.length() > len ? s.substring(0, len) + "…" : s;
    }
}
