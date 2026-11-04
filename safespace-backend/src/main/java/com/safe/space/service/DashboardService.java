package com.safe.space.service;

import com.safe.space.dto.*;
import com.safe.space.model.CalmDownSession;
import com.safe.space.model.ChatSession;
import com.safe.space.model.CrisisAlert;
import com.safe.space.model.Post;
import com.safe.space.model.User;
import com.safe.space.repository.*;
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
@Slf4j
public class DashboardService {

    private final PostRepository postRepository;
    private final AutoReplyLogRepository autoReplyLogRepository;
    private final CalmDownSessionRepository calmDownSessionRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final UserRepository userRepository;
    private final CrisisAlertRepository crisisAlertRepository;

    public DashboardService(
            PostRepository postRepository,
            AutoReplyLogRepository autoReplyLogRepository,
            CalmDownSessionRepository calmDownSessionRepository,
            ChatSessionRepository chatSessionRepository,
            UserRepository userRepository,
            CrisisAlertRepository crisisAlertRepository) {
        this.postRepository = postRepository;
        this.autoReplyLogRepository = autoReplyLogRepository;
        this.calmDownSessionRepository = calmDownSessionRepository;
        this.chatSessionRepository = chatSessionRepository;
        this.userRepository = userRepository;
        this.crisisAlertRepository = crisisAlertRepository;
    }

    // ── 1. OVERVIEW ──

    @Transactional(readOnly = true)
    public DashboardOverviewResponse getOverview() {
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        LocalDateTime todayEnd = LocalDate.now().atTime(LocalTime.MAX);

        // Posts
        long totalPosts = postRepository.count();
        long totalPostsToday = postRepository.countByCreatedAtBetween(todayStart, todayEnd);
        long flaggedPosts = crisisAlertRepository.countByStatus("ACTIVE");
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

        // Fetch unresolved crisis alerts (ACTIVE + ACKNOWLEDGED) that are not archived
        List<com.safe.space.model.CrisisAlert> unresolvedAlerts = crisisAlertRepository.findUnresolvedAlertsPrioritized();
        for (com.safe.space.model.CrisisAlert a : unresolvedAlerts) {
            if (a.isArchived()) continue;

            String alertType = a.getAlertType() != null ? a.getAlertType().toLowerCase() : "alert";
            String severity = a.getSeverity() != null ? a.getSeverity().toLowerCase() : "moderate";

            // Clinically calibrate severity by alert type and true stored severity
            if ("CRISIS_POST".equalsIgnoreCase(a.getAlertType()) || "CRISIS_CHAT".equalsIgnoreCase(a.getAlertType()) || "REPEAT_CRISIS".equalsIgnoreCase(a.getAlertType())) {
                severity = a.getSeverity() != null ? a.getSeverity().toLowerCase() : "critical";
            } else if (a.getEnergyScore() != null) {
                int score = a.getEnergyScore();
                if (score >= 9) {
                    severity = "high";
                } else if (score >= 8) {
                    severity = "elevated";
                }
            }

            alerts.add(DashboardAlertsResponse.Alert.builder()
                    .alertType(alertType)
                    .severity(severity)
                    .referenceId(a.getReferenceId() != null ? a.getReferenceId() : a.getAlertId())
                    .summary(truncate(a.getMessage() != null && !a.getMessage().isBlank() ? a.getMessage() : a.getTitle(), 120))
                    .emotionTag(a.getEmotionTag())
                    .energyScore(a.getEnergyScore())
                    .flaggedKeywords(a.getFlaggedKeywords())
                    .status(a.getStatus())
                    .timestamp(a.getCreatedAt())
                    .build());
        }

        // Sort: newest first by timestamp so incoming alerts appear on top
        alerts.sort((a, b) -> {
            if (a.getTimestamp() == null && b.getTimestamp() == null) return 0;
            if (a.getTimestamp() == null) return 1;
            if (b.getTimestamp() == null) return -1;
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

        // 3. Department & Academic Cohort Distribution (Cross-tabulated with Mood & Energy)
        Map<String, User> userMap = userRepository.findAll().stream()
                .filter(u -> u.getUsername() != null)
                .collect(Collectors.toMap(User::getUsername, u -> u, (u1, u2) -> u1));

        Map<String, List<Post>> postsByDept = new HashMap<>();
        Map<String, Long> yearCounts = new HashMap<>();

        for (Post p : posts) {
            String dept = "General / Unspecified";
            String yearLvl = "General / Unspecified";
            if (p.getOwnerUsername() != null && userMap.containsKey(p.getOwnerUsername())) {
                User u = userMap.get(p.getOwnerUsername());
                if (u.getDepartment() != null && !u.getDepartment().isBlank()) dept = u.getDepartment();
                if (u.getYearLevel() != null && !u.getYearLevel().isBlank()) yearLvl = u.getYearLevel();
            }
            postsByDept.computeIfAbsent(dept, k -> new ArrayList<>()).add(p);
            yearCounts.put(yearLvl, yearCounts.getOrDefault(yearLvl, 0L) + 1);
        }

        List<MonthlyReportResponse.DepartmentStat> deptStats = postsByDept.entrySet().stream()
                .map(e -> {
                    String dept = e.getKey();
                    List<Post> deptPosts = e.getValue();
                    long deptTotal = deptPosts.size();
                    long deptUniqueStudents = deptPosts.stream()
                            .map(Post::getPseudonym)
                            .filter(Objects::nonNull)
                            .distinct()
                            .count();

                    double deptAvgEnergy = deptTotal > 0
                            ? Math.round(deptPosts.stream().mapToInt(Post::getEnergyScore).average().orElse(0.0) * 10.0) / 10.0
                            : 0.0;

                    String deptClimate;
                    if (deptAvgEnergy >= 7.5) {
                        deptClimate = "Acute Tension / High Stress";
                    } else if (deptAvgEnergy >= 5.0) {
                        deptClimate = "Moderate Academic Tension";
                    } else {
                        deptClimate = "Calm & Resilient Baseline";
                    }

                    long eLow = deptPosts.stream().filter(p -> p.getEnergyScore() >= 1 && p.getEnergyScore() <= 3).count();
                    long eMod = deptPosts.stream().filter(p -> p.getEnergyScore() >= 4 && p.getEnergyScore() <= 7).count();
                    long eHigh = deptPosts.stream().filter(p -> p.getEnergyScore() >= 8 && p.getEnergyScore() <= 10).count();

                    // Emotion breakdown within this specific department
                    Map<String, List<Post>> byEmotion = deptPosts.stream()
                            .filter(p -> p.getEmotionTag() != null && !p.getEmotionTag().isBlank())
                            .collect(Collectors.groupingBy(Post::getEmotionTag));

                    List<MonthlyReportResponse.DepartmentEmotionStat> emotionBreakdown = byEmotion.entrySet().stream()
                            .map(emEntry -> {
                                String em = emEntry.getKey();
                                List<Post> emPosts = emEntry.getValue();
                                long emCount = emPosts.size();
                                double emPct = deptTotal > 0 ? Math.round((emCount * 1000.0) / deptTotal) / 10.0 : 0.0;
                                double emAvgE = Math.round(emPosts.stream().mapToInt(Post::getEnergyScore).average().orElse(0.0) * 10.0) / 10.0;

                                String intensity;
                                if (emAvgE >= 8.0) {
                                    intensity = "High Tension";
                                } else if (emAvgE >= 5.0) {
                                    intensity = "Moderate";
                                } else {
                                    intensity = "Low / Stable";
                                }

                                return MonthlyReportResponse.DepartmentEmotionStat.builder()
                                        .emotion(em)
                                        .count(emCount)
                                        .percentage(emPct)
                                        .avgEnergy(emAvgE)
                                        .intensityLevel(intensity)
                                        .build();
                            })
                            .sorted((a, b) -> Long.compare(b.getCount(), a.getCount()))
                            .collect(Collectors.toList());

                    return MonthlyReportResponse.DepartmentStat.builder()
                            .department(dept)
                            .count(deptTotal)
                            .expressionCount(deptTotal)
                            .uniqueStudents(deptUniqueStudents)
                            .percentage(totalPosts > 0 ? Math.round((deptTotal * 1000.0) / totalPosts) / 10.0 : 0.0)
                            .avgEnergyScore(deptAvgEnergy)
                            .climateStatus(deptClimate)
                            .energyLow(eLow)
                            .energyModerate(eMod)
                            .energyHigh(eHigh)
                            .emotionBreakdown(emotionBreakdown)
                            .build();
                })
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

        // 6. Crisis Incidents & Trigger Audit (Mapped from genuine CrisisAlert entities)
        List<CrisisAlert> monthAlerts = crisisAlertRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(startOfMonth, endOfMonth);

        // Pseudonym to Department mapping
        Map<String, String> pseudonymDeptMap = new HashMap<>();
        for (Post p : posts) {
            if (p.getPseudonym() != null && p.getOwnerUsername() != null && userMap.containsKey(p.getOwnerUsername())) {
                User u = userMap.get(p.getOwnerUsername());
                if (u.getDepartment() != null && !u.getDepartment().isBlank()) {
                    pseudonymDeptMap.put(p.getPseudonym(), u.getDepartment());
                }
            }
        }

        List<MonthlyReportResponse.CrisisIncidentItem> crisisItems = new ArrayList<>();

        for (CrisisAlert alert : monthAlerts) {
            String triage = alert.getStatus() != null ? alert.getStatus().toUpperCase() : "ACTIVE";
            String triageLabel = switch (triage) {
                case "ACTIVE" -> "Needs Action";
                case "ACKNOWLEDGED" -> "In Casework";
                case "RESOLVED" -> "Resolved";
                case "ESCALATED" -> "Escalated";
                default -> triage;
            };

            boolean isReviewed = !"ACTIVE".equalsIgnoreCase(triage);
            String officer = alert.getResolvedBy() != null && !alert.getResolvedBy().isBlank()
                    ? alert.getResolvedBy()
                    : (alert.getAcknowledgedBy() != null && !alert.getAcknowledgedBy().isBlank()
                    ? alert.getAcknowledgedBy()
                    : "Pending Assignment");

            String sourceLabel = switch (alert.getAlertType() != null ? alert.getAlertType() : "") {
                case "CRISIS_POST" -> "Rant Board Trigger";
                case "HIGH_ENERGY_POST" -> "High Tension Spike";
                case "CRISIS_CHAT" -> "Support Dialogue Flag";
                case "REPEAT_CRISIS" -> "Repeat Distress Pattern";
                case "ENERGY_SPIKE" -> "Sudden Emotional Spike";
                case "SYSTEM_EVENT" -> "System Sentinel Event";
                default -> alert.getAlertType() != null ? alert.getAlertType() : "Sentinel Alert";
            };

            // Categorical clinical trigger domain
            String triggerCategory;
            if (alert.getFlaggedKeywords() != null && !alert.getFlaggedKeywords().isBlank()) {
                triggerCategory = "Trigger Keywords: " + alert.getFlaggedKeywords();
            } else if ("HIGH_ENERGY_POST".equalsIgnoreCase(alert.getAlertType()) || (alert.getEnergyScore() != null && alert.getEnergyScore() >= 8)) {
                triggerCategory = "Acute Tension Spike (Energy Level " + (alert.getEnergyScore() != null ? alert.getEnergyScore() : "8+") + "/10)";
            } else if (alert.getTitle() != null && !alert.getTitle().isBlank()) {
                triggerCategory = alert.getTitle();
            } else {
                triggerCategory = "Elevated Psychological Risk Indicator";
            }

            String dept = alert.getPseudonym() != null ? pseudonymDeptMap.getOrDefault(alert.getPseudonym(), "General / Unspecified") : "General / Unspecified";

            crisisItems.add(MonthlyReportResponse.CrisisIncidentItem.builder()
                    .incidentId(alert.getAlertId())
                    .alertId(alert.getAlertId())
                    .source(alert.getAlertType())
                    .alertType(alert.getAlertType())
                    .alertTypeLabel(sourceLabel)
                    .pseudonym(alert.getPseudonym() != null ? alert.getPseudonym() : "Anonymous Student")
                    .department(dept)
                    .severity(alert.getSeverity() != null ? alert.getSeverity().toUpperCase() : "MODERATE")
                    .triageStatus(triage)
                    .triageStatusLabel(triageLabel)
                    .triggerCategory(triggerCategory)
                    .summary(truncate(alert.getTitle() != null ? alert.getTitle() : triggerCategory, 120))
                    .flaggedKeywords(alert.getFlaggedKeywords())
                    .emotionTag(alert.getEmotionTag())
                    .energyScore(alert.getEnergyScore() != null ? alert.getEnergyScore() : 8)
                    .reviewed(isReviewed)
                    .reviewedBy(officer)
                    .assignedOfficer(officer)
                    .outreachStatus(alert.getOutreachStatus() != null ? alert.getOutreachStatus() : "NONE")
                    .resolutionSummary(alert.getResolutionNotes() != null ? truncate(alert.getResolutionNotes(), 160) : null)
                    .timestamp(alert.getCreatedAt())
                    .resolvedAt(alert.getResolvedAt())
                    .build());
        }

        crisisItems.sort((a, b) -> {
            int p1 = triagePriority(a.getTriageStatus());
            int p2 = triagePriority(b.getTriageStatus());
            if (p1 != p2) return p1 - p2;
            int s1 = severityOrder(a.getSeverity());
            int s2 = severityOrder(b.getSeverity());
            if (s1 != s2) return s1 - s2;
            return b.getTimestamp().compareTo(a.getTimestamp());
        });

        long crisisPending = crisisItems.stream().filter(c -> "ACTIVE".equalsIgnoreCase(c.getTriageStatus())).count();
        long crisisInProgress = crisisItems.stream().filter(c -> "ACKNOWLEDGED".equalsIgnoreCase(c.getTriageStatus())).count();
        long crisisResolved = crisisItems.stream().filter(c -> "RESOLVED".equalsIgnoreCase(c.getTriageStatus())).count();
        long crisisEscalated = crisisItems.stream().filter(c -> "ESCALATED".equalsIgnoreCase(c.getTriageStatus())).count();
        long crisisReviewed = crisisInProgress + crisisResolved + crisisEscalated;

        // 7. Clinical Observations
        List<String> observations = new ArrayList<>();
        if (totalPosts == 0) {
            observations.add("No student expressions were logged on the platform during the month of " + monthName + ".");
        } else {
            observations.add(String.format("During %s, SafeSpace logged %d student expressions across %d active students with an aggregate Campus Emotional Energy index of %.1f/10 (%s).",
                    monthName, totalPosts, uniqueStudents, avgEnergy, climateStatus));

            if (!emotionStats.isEmpty()) {
                MonthlyReportResponse.EmotionStat topEmotion = emotionStats.get(0);
                String secondEmotionStr = emotionStats.size() > 1
                        ? String.format(", followed by %s (%d expressions, %.1f%%)",
                        emotionStats.get(1).getEmotion(), emotionStats.get(1).getCount(), emotionStats.get(1).getPercentage())
                        : "";
                observations.add(String.format("Predominant affective state among USTP Balubal respondents is %s (%d expressions, %.1f%%%s).",
                        topEmotion.getEmotion(), topEmotion.getCount(), topEmotion.getPercentage(), secondEmotionStr));
            }

            if (!deptStats.isEmpty()) {
                MonthlyReportResponse.DepartmentStat topDept = deptStats.get(0);
                observations.add(String.format("Highest student engagement was observed in %s (%d expressions, %.1f%% of campus volume; emotional energy baseline: %.1f/10 - %s).",
                        topDept.getDepartment(), topDept.getExpressionCount(), topDept.getPercentage(), topDept.getAvgEnergyScore(), topDept.getClimateStatus()));
            }

            if (!crisisItems.isEmpty()) {
                observations.add(String.format("Crisis sentinel intercepted %d high-risk alerts: %d require immediate triage, %d are under active casework, and %d have been successfully resolved or escalated.",
                        crisisItems.size(), crisisPending, crisisInProgress, crisisResolved + crisisEscalated));
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
                .crisisInProgressCount(crisisInProgress)
                .crisisResolvedCount(crisisResolved)
                .crisisEscalatedCount(crisisEscalated)
                .recentDialogues(dialogueItems)
                .avgMessagesPerChat(avgMsgs)
                .kitModalities(kitStats)
                .clinicalObservations(observations)
                .actionRecommendations(recommendations)
                .build();
    }

    // ── Helpers ──

    private int triagePriority(String status) {
        if (status == null) return 4;
        return switch (status.toUpperCase()) {
            case "ACTIVE" -> 0;       // Needs Action
            case "ACKNOWLEDGED" -> 1; // In Casework
            case "ESCALATED" -> 2;    // Escalated
            case "RESOLVED" -> 3;     // Resolved
            default -> 4;
        };
    }

    private int severityOrder(String severity) {
        if (severity == null) return 3;
        return switch (severity.toLowerCase()) {
            case "critical" -> 0;
            case "high" -> 1;
            case "moderate" -> 2;
            case "low" -> 3;
            default -> 4;
        };
    }

    private String truncate(String s, int len) {
        if (s == null) return "";
        return s.length() > len ? s.substring(0, len) + "…" : s;
    }
}
