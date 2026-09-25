package com.safe.space.service;

import com.safe.space.dto.*;
import com.safe.space.model.CalmDownSession;
import com.safe.space.model.ChatSession;
import com.safe.space.model.Post;
import com.safe.space.model.User;
import com.safe.space.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.TextStyle;
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
    private final UserRepository userRepository;

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

    // ── 4. MONTHLY REPORT ──

    @Transactional(readOnly = true)
    public MonthlyReportResponse getMonthlyReport(int year, int month, User currentUser) {
        if (year <= 0) {
            year = LocalDate.now().getYear();
        }
        if (month < 1 || month > 12) {
            month = LocalDate.now().getMonthValue();
        }

        LocalDate firstDay = LocalDate.of(year, month, 1);
        LocalDate lastDay = firstDay.withDayOfMonth(firstDay.lengthOfMonth());
        LocalDateTime startOfMonth = firstDay.atStartOfDay();
        LocalDateTime endOfMonth = lastDay.atTime(LocalTime.MAX);

        String monthName = firstDay.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " " + year;

        // 1. Fetch Month Posts
        List<Post> posts = postRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(startOfMonth, endOfMonth);
        long totalPosts = posts.size();
        long flaggedPosts = posts.stream().filter(Post::isFlagged).count();

        double avgEnergy = totalPosts > 0
                ? posts.stream().mapToInt(Post::getEnergyScore).average().orElse(0.0)
                : 0.0;
        avgEnergy = Math.round(avgEnergy * 10.0) / 10.0;

        String climateStatus;
        if (avgEnergy >= 7.5) {
            climateStatus = "Acute Student Stress / High Crisis Potential";
        } else if (avgEnergy >= 5.0) {
            climateStatus = "Moderate Academic Tension / Mid-Level Pressure";
        } else if (totalPosts == 0) {
            climateStatus = "No Activity Recorded";
        } else {
            climateStatus = "Calm, Stable & Emotionally Resilient";
        }

        // Energy Distribution
        long energyLow = posts.stream().filter(p -> p.getEnergyScore() >= 1 && p.getEnergyScore() <= 3).count();
        long energyMod = posts.stream().filter(p -> p.getEnergyScore() >= 4 && p.getEnergyScore() <= 7).count();
        long energyHigh = posts.stream().filter(p -> p.getEnergyScore() >= 8 && p.getEnergyScore() <= 10).count();

        double energyLowPct = totalPosts > 0 ? Math.round((energyLow * 1000.0) / totalPosts) / 10.0 : 0.0;
        double energyModPct = totalPosts > 0 ? Math.round((energyMod * 1000.0) / totalPosts) / 10.0 : 0.0;
        double energyHighPct = totalPosts > 0 ? Math.round((energyHigh * 1000.0) / totalPosts) / 10.0 : 0.0;

        long uniqueStudents = posts.stream().map(Post::getPseudonym).filter(Objects::nonNull).distinct().count();

        // 2. Emotion Breakdown
        Map<String, List<Post>> postsByEmotion = posts.stream()
                .filter(p -> p.getEmotionTag() != null && !p.getEmotionTag().isBlank())
                .collect(Collectors.groupingBy(Post::getEmotionTag));

        List<MonthlyReportResponse.EmotionStat> emotionStats = postsByEmotion.entrySet().stream()
                .map(entry -> {
                    String em = entry.getKey();
                    List<Post> group = entry.getValue();
                    double avgE = group.stream().mapToInt(Post::getEnergyScore).average().orElse(0.0);
                    return MonthlyReportResponse.EmotionStat.builder()
                            .emotion(em)
                            .count(group.size())
                            .percentage(totalPosts > 0 ? Math.round((group.size() * 1000.0) / totalPosts) / 10.0 : 0.0)
                            .avgEnergy(Math.round(avgE * 10.0) / 10.0)
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getCount(), a.getCount()))
                .collect(Collectors.toList());

        // 3. Department & Year Level Distribution
        Map<String, User> userMap = userRepository.findAll().stream()
                .filter(u -> u.getUsername() != null)
                .collect(Collectors.toMap(User::getUsername, u -> u, (u1, u2) -> u1));

        Map<String, Long> deptCounts = new HashMap<>();
        Map<String, Long> yearCounts = new HashMap<>();

        for (Post p : posts) {
            String dept = "General / Unspecified";
            String yearLvl = "General / Unspecified";
            if (p.getOwnerUsername() != null && userMap.containsKey(p.getOwnerUsername())) {
                User u = userMap.get(p.getOwnerUsername());
                if (u.getDepartment() != null && !u.getDepartment().isBlank()) dept = u.getDepartment();
                if (u.getYearLevel() != null && !u.getYearLevel().isBlank()) yearLvl = u.getYearLevel();
            }
            deptCounts.put(dept, deptCounts.getOrDefault(dept, 0L) + 1);
            yearCounts.put(yearLvl, yearCounts.getOrDefault(yearLvl, 0L) + 1);
        }

        List<MonthlyReportResponse.DepartmentStat> deptStats = deptCounts.entrySet().stream()
                .map(e -> MonthlyReportResponse.DepartmentStat.builder()
                        .department(e.getKey())
                        .count(e.getValue())
                        .percentage(totalPosts > 0 ? Math.round((e.getValue() * 1000.0) / totalPosts) / 10.0 : 0.0)
                        .build())
                .sorted((a, b) -> Long.compare(b.getCount(), a.getCount()))
                .collect(Collectors.toList());

        List<MonthlyReportResponse.YearLevelStat> yearStats = yearCounts.entrySet().stream()
                .map(e -> MonthlyReportResponse.YearLevelStat.builder()
                        .yearLevel(e.getKey())
                        .count(e.getValue())
                        .percentage(totalPosts > 0 ? Math.round((e.getValue() * 1000.0) / totalPosts) / 10.0 : 0.0)
                        .build())
                .sorted((a, b) -> Long.compare(b.getCount(), a.getCount()))
                .collect(Collectors.toList());

        // 4. Support Dialogues (Chat Sessions)
        List<ChatSession> chats = chatSessionRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(startOfMonth, endOfMonth);
        long totalChats = chats.size();
        long activeChats = chats.stream().filter(c -> "ACTIVE".equalsIgnoreCase(c.getStatus())).count();
        long closedChats = chats.stream().filter(c -> "CLOSED".equalsIgnoreCase(c.getStatus())).count();
        long crisisChats = chats.stream().filter(ChatSession::isCrisisFlag).count();
        Double avgMsgs = totalChats > 0
                ? Math.round(chats.stream().mapToInt(ChatSession::getMessageCount).average().orElse(0.0) * 10.0) / 10.0
                : 0.0;

        List<MonthlyReportResponse.SupportDialogueItem> dialogueItems = chats.stream()
                .map(c -> MonthlyReportResponse.SupportDialogueItem.builder()
                        .sessionId(c.getSessionId())
                        .studentPseudonym(c.getStudentPseudonym())
                        .professionalName(c.getProfessionalName() != null ? c.getProfessionalName() : "Awaiting Counselor")
                        .status(c.getStatus())
                        .topic(truncate(c.getTopic(), 100))
                        .emotionTag(c.getEmotionTag())
                        .messageCount(c.getMessageCount())
                        .crisisFlag(c.isCrisisFlag())
                        .createdAt(c.getCreatedAt())
                        .build())
                .collect(Collectors.toList());

        // 5. Calm-Down Kits
        List<CalmDownSession> kits = calmDownSessionRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(startOfMonth, endOfMonth);
        long kitPrescribed = kits.size();
        long kitCompleted = kits.stream().filter(CalmDownSession::isCompleted).count();
        double kitRate = kitPrescribed > 0
                ? Math.round(((double) kitCompleted / kitPrescribed) * 1000.0) / 10.0
                : 0.0;

        Map<String, List<CalmDownSession>> kitsByType = kits.stream()
                .collect(Collectors.groupingBy(k -> k.getKitType() != null ? k.getKitType() : "other"));

        List<MonthlyReportResponse.KitModalityStat> kitStats = kitsByType.entrySet().stream()
                .map(e -> {
                    long done = e.getValue().stream().filter(CalmDownSession::isCompleted).count();
                    long total = e.getValue().size();
                    return MonthlyReportResponse.KitModalityStat.builder()
                            .kitType(e.getKey())
                            .prescribedCount(total)
                            .completedCount(done)
                            .completionRate(total > 0 ? Math.round((done * 1000.0) / total) / 10.0 : 0.0)
                            .build();
                })
                .sorted((a, b) -> Long.compare(b.getPrescribedCount(), a.getPrescribedCount()))
                .collect(Collectors.toList());

        // 6. Crisis Incidents & Trigger Audit
        List<MonthlyReportResponse.CrisisIncidentItem> crisisItems = new ArrayList<>();

        for (Post p : posts) {
            if (p.isFlagged() || p.getEnergyScore() >= 8) {
                crisisItems.add(MonthlyReportResponse.CrisisIncidentItem.builder()
                        .incidentId(p.getPostId())
                        .source("RANT_POST")
                        .pseudonym(p.getPseudonym())
                        .severity(p.isFlagged() ? (p.getSeverity() != null ? p.getSeverity() : "CRITICAL") : "MODERATE")
                        .summary(truncate(p.getContent(), 120))
                        .flaggedKeywords(p.getFlaggedKeywords() != null ? p.getFlaggedKeywords() : (p.getEnergyScore() >= 8 ? "High Energy (Level " + p.getEnergyScore() + "/10)" : "None"))
                        .emotionTag(p.getEmotionTag())
                        .energyScore(p.getEnergyScore())
                        .reviewed(p.isReviewed())
                        .reviewedBy(p.getReviewedBy())
                        .timestamp(p.getCreatedAt())
                        .build());
            }
        }

        for (ChatSession cs : chats) {
            if (cs.isCrisisFlag()) {
                crisisItems.add(MonthlyReportResponse.CrisisIncidentItem.builder()
                        .incidentId(cs.getSessionId())
                        .source("SUPPORT_CHAT")
                        .pseudonym(cs.getStudentPseudonym())
                        .severity("CRITICAL")
                        .summary("Support Dialogue: " + truncate(cs.getTopic(), 100))
                        .flaggedKeywords("Crisis Keywords Detected")
                        .emotionTag(cs.getEmotionTag())
                        .energyScore(cs.getEnergyScore() != null ? cs.getEnergyScore() : 10)
                        .reviewed("CLOSED".equalsIgnoreCase(cs.getStatus()) || "ACTIVE".equalsIgnoreCase(cs.getStatus()))
                        .reviewedBy(cs.getProfessionalName())
                        .timestamp(cs.getCreatedAt())
                        .build());
            }
        }

        crisisItems.sort((a, b) -> {
            if (a.isReviewed() != b.isReviewed()) return a.isReviewed() ? 1 : -1;
            int s1 = severityOrder(a.getSeverity());
            int s2 = severityOrder(b.getSeverity());
            if (s1 != s2) return s1 - s2;
            return b.getTimestamp().compareTo(a.getTimestamp());
        });

        long crisisReviewed = crisisItems.stream().filter(MonthlyReportResponse.CrisisIncidentItem::isReviewed).count();
        long crisisPending = crisisItems.size() - crisisReviewed;

        // 7. Clinical Observations
        List<String> observations = new ArrayList<>();
        if (totalPosts == 0) {
            observations.add("No student expressions were logged on the platform during the month of " + monthName + ".");
        } else {
            observations.add(String.format("During %s, SafeSpace logged %d student expressions with an aggregate Campus Emotional Energy index of %.1f/10 (%s).",
                    monthName, totalPosts, avgEnergy, climateStatus));

            if (!emotionStats.isEmpty()) {
                MonthlyReportResponse.EmotionStat topEmotion = emotionStats.get(0);
                String secondEmotionStr = emotionStats.size() > 1
                        ? String.format(", followed by %s (%d expressions, %.1f%%)",
                        emotionStats.get(1).getEmotion(), emotionStats.get(1).getCount(), emotionStats.get(1).getPercentage())
                        : "";
                observations.add(String.format("Predominant affective state among USTP Balubal respondents is %s (%d expressions, %.1f%%%s).",
                        topEmotion.getEmotion(), topEmotion.getCount(), topEmotion.getPercentage(), secondEmotionStr));
            }

            if (!crisisItems.isEmpty()) {
                observations.add(String.format("Automated crisis sentinel intercepted %d high-risk indicators (%d flagged posts and %d crisis chats). %d of %d cases have been reviewed.",
                        crisisItems.size(), flaggedPosts, crisisChats, crisisReviewed, crisisItems.size()));
            } else {
                observations.add("Zero critical crisis incidents were detected during this reporting cycle, demonstrating emotional baseline stability.");
            }

            if (kitPrescribed > 0) {
                observations.add(String.format("Adaptive grounding kit interventions recorded %d prescriptions with an overall completion efficacy of %.1f%% (%d completions).",
                        kitPrescribed, kitRate, kitCompleted));
            }

            if (totalChats > 0) {
                observations.add(String.format("Professional support dialogues engaged %d sessions (average dialogue depth: %.1f messages), ensuring psychological safety without breaking anonymity.",
                        totalChats, avgMsgs));
            }
        }

        // 8. Institutional Recommendations
        List<String> recommendations = new ArrayList<>();
        if (energyHighPct >= 30.0 || flaggedPosts > 0) {
            recommendations.add("Schedule proactive stress-deceleration and test-anxiety coping sessions with academic units experiencing heightened emotional energy.");
        }
        if (!emotionStats.isEmpty() && emotionStats.get(0).getEmotion().equalsIgnoreCase("Anxious")) {
            recommendations.add("Deploy targeted psychoeducational campaigns addressing academic workload management and peer-support dynamics across campus bulletin channels.");
        } else if (!emotionStats.isEmpty() && emotionStats.get(0).getEmotion().equalsIgnoreCase("Lonely")) {
            recommendations.add("Coordinate with student organizations to initiate campus connectivity and communal engagement activities to mitigate isolation.");
        }
        if (crisisPending > 0) {
            recommendations.add(String.format("Prioritize immediate triage and review for the %d pending crisis alert(s) in the psychometrician priority queue.", crisisPending));
        }
        recommendations.add("Maintain continuous monitoring of anonymous student expressions leading up to institutional examination and project defense milestones.");
        recommendations.add("Promote SafeSpace grounding kit exercises in student orientations to reinforce proactive self-regulation habits.");

        String genName = (currentUser != null && currentUser.getFullName() != null && !currentUser.getFullName().isBlank())
                ? currentUser.getFullName()
                : "Harold B. Vicada, RPm";
        String genRole = (currentUser != null && currentUser.getRole() != null)
                ? currentUser.getRole()
                : "PROFESSIONAL";

        return MonthlyReportResponse.builder()
                .year(year)
                .month(month)
                .monthName(monthName)
                .startDate(firstDay.toString())
                .endDate(lastDay.toString())
                .institution("University of Science and Technology of Southern Philippines")
                .campus("Balubal Campus, Cagayan de Oro City")
                .departmentUnit("Guidance and Counseling Center / Psychometrician Unit")
                .confidentialityNotice("CONFIDENTIAL DOCUMENT // IN STRICT COMPLIANCE WITH RA 10173 (DATA PRIVACY ACT) & RA 11036 (MENTAL HEALTH ACT)")
                .generatedAt(LocalDateTime.now())
                .generatedBy(genName)
                .generatedByRole(genRole)
                .totalExpressions(totalPosts)
                .averageEnergyScore(avgEnergy)
                .climateStatus(climateStatus)
                .totalCrisisAlerts(crisisItems.size())
                .flaggedPosts(flaggedPosts)
                .crisisChatSessions(crisisChats)
                .totalSupportDialogues(totalChats)
                .activeSupportDialogues(activeChats)
                .closedSupportDialogues(closedChats)
                .groundingPrescriptions(kitPrescribed)
                .groundingCompletions(kitCompleted)
                .groundingCompletionRate(kitRate)
                .uniqueActiveStudents(uniqueStudents)
                .energyLow(energyLow)
                .energyModerate(energyMod)
                .energyHigh(energyHigh)
                .energyLowPct(energyLowPct)
                .energyModeratePct(energyModPct)
                .energyHighPct(energyHighPct)
                .emotionBreakdown(emotionStats)
                .departmentBreakdown(deptStats)
                .yearLevelBreakdown(yearStats)
                .crisisIncidents(crisisItems)
                .crisisReviewedCount(crisisReviewed)
                .crisisPendingCount(crisisPending)
                .recentDialogues(dialogueItems)
                .avgMessagesPerChat(avgMsgs)
                .kitModalities(kitStats)
                .clinicalObservations(observations)
                .actionRecommendations(recommendations)
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
