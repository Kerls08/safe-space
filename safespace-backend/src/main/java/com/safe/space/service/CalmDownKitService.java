package com.safe.space.service;

import com.safe.space.dto.CalmDownCompletionRequest;
import com.safe.space.dto.CalmDownPrescription;
import com.safe.space.dto.CalmDownStatsResponse;
import com.safe.space.model.CalmDownSession;
import com.safe.space.model.WellnessResource;
import com.safe.space.repository.CalmDownSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Adaptive Calm-Down Kit prescription engine.
 *
 * The system "prescribes" a calming intervention based on the student's
 * Rant Energy Score, making it an intelligent, adaptive response system:
 *
 *   Score 1–3 (Low)      → Positive quote + reflective prompt
 *   Score 4–7 (Moderate)  → Interactive breathing pacer (4-4-4-4 box breathing)
 *   Score 8–10 (High)     → 5-4-3-2-1 grounding technique + crisis resources
 *
 * Every prescription is tracked. Students can report completion and feedback,
 * enabling effectiveness analysis for the research component.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CalmDownKitService {

    private final CalmDownSessionRepository sessionRepository;
    private final CrisisKeywordService crisisKeywordService;
    private final ResourceLinkerService resourceLinkerService;

    // ── Positive Quotes Pool ──
    private static final List<QuoteEntry> QUOTES = List.of(
            new QuoteEntry("Take a moment to appreciate one good thing today, no matter how small.",
                    null, "What is one thing that went well today?"),
            new QuoteEntry("You are allowed to feel what you feel — small steps count.",
                    null, "What is one small step you can take right now?"),
            new QuoteEntry("Breathe in, notice one small positive detail, and breathe out.",
                    null, "What is something around you that brings you comfort?"),
            new QuoteEntry("This feeling is temporary. You have survived difficult moments before.",
                    null, "Think of a time you overcame something hard. What helped?"),
            new QuoteEntry("You don't have to have it all figured out. Just take the next step.",
                    null, "What is the very next thing you need to do?"),
            new QuoteEntry("It's okay to rest. You don't have to earn a break.",
                    null, "When was the last time you did something just for yourself?"),
            new QuoteEntry("Your feelings are valid, even if others don't understand them.",
                    null, "If you could tell someone how you feel, what would you say?"),
            new QuoteEntry("You are more resilient than you think. This moment will pass.",
                    null, "What is one thing you're proud of about yourself?"),
            new QuoteEntry("Healing is not linear. Bad days don't erase your progress.",
                    null, "What does progress look like for you right now?"),
            new QuoteEntry("You are not alone. Someone cares about you more than you know.",
                    null, "Who is someone you could reach out to today?")
    );

    private record QuoteEntry(String quote, String author, String prompt) {}

    /**
     * Prescribe a Calm-Down Kit based on energy score.
     * Called on the post-submission success screen.
     *
     * @param energyScore the student's rant energy score (1–10)
     * @param emotionTag  the emotion tag from the post
     * @param postId      optional link to the post
     * @param content     optional post content (for crisis detection)
     * @return adaptive prescription with structured kit content
     */
    @Transactional
    public CalmDownPrescription prescribe(int energyScore, String emotionTag, String postId, String content) {
        // ── Determine kit type ──
        String kitType;
        String tierLabel;
        String rationale;

        if (energyScore >= 8) {
            kitType = "grounding";
            tierLabel = "High Intensity (8–10)";
            rationale = "Your energy score indicates high emotional intensity. "
                    + "The 5-4-3-2-1 grounding technique can help bring you back to the present moment.";
        } else if (energyScore >= 4) {
            kitType = "breathing";
            tierLabel = "Moderate Intensity (4–7)";
            rationale = "Your energy level suggests you could benefit from a guided breathing exercise "
                    + "to help reduce tension and calm your nervous system.";
        } else {
            kitType = "quote";
            tierLabel = "Low Intensity (1–3)";
            rationale = "Your energy level is relatively low. "
                    + "A moment of positive reflection can help maintain your emotional balance.";
        }

        // ── Crisis detection ──
        boolean crisisDetected = false;
        if (content != null && !content.isBlank()) {
            crisisDetected = crisisKeywordService.isCrisis(content);
        }

        // If crisis detected, always escalate to grounding + resources
        if (crisisDetected && !"grounding".equals(kitType)) {
            kitType = "grounding";
            tierLabel = "Crisis Detected";
            rationale = "We detected words that concern us. "
                    + "Please try this grounding exercise and consider reaching out for support.";
        }

        // ── Generate session ID ──
        String sessionId = "calm-" + System.currentTimeMillis()
                + "-" + UUID.randomUUID().toString().substring(0, 8);

        // ── Build kit-specific content ──
        String contentId;
        CalmDownPrescription.QuoteContent quoteContent = null;
        CalmDownPrescription.BreathingContent breathingContent = null;
        CalmDownPrescription.GroundingContent groundingContent = null;

        switch (kitType) {
            case "quote" -> {
                int idx = new Random().nextInt(QUOTES.size());
                QuoteEntry entry = QUOTES.get(idx);
                contentId = "quote-" + idx;
                quoteContent = CalmDownPrescription.QuoteContent.builder()
                        .quote(entry.quote())
                        .author(entry.author())
                        .reflectivePrompt(entry.prompt())
                        .followUpTip(getFollowUpTip(emotionTag))
                        .build();
            }
            case "breathing" -> {
                contentId = "box-breathing-444";
                breathingContent = buildBoxBreathing(energyScore);
            }
            case "grounding" -> {
                contentId = "grounding-54321";
                groundingContent = buildGrounding54321();
            }
            default -> contentId = "unknown";
        }

        // ── Build resources ──
        List<CalmDownPrescription.Resource> resources = buildResources(kitType, crisisDetected);

        // ── Persist session ──
        CalmDownSession session = CalmDownSession.builder()
                .sessionId(sessionId)
                .postId(postId)
                .energyScore(energyScore)
                .emotionTag(emotionTag)
                .kitType(kitType)
                .contentId(contentId)
                .crisisDetected(crisisDetected)
                .completed(false)
                .build();
        sessionRepository.save(session);

        log.info("Calm-Down Kit prescribed: sessionId={}, kitType={}, energy={}, emotion={}, crisis={}",
                sessionId, kitType, energyScore, emotionTag, crisisDetected);

        return CalmDownPrescription.builder()
                .sessionId(sessionId)
                .kitType(kitType)
                .tierLabel(tierLabel)
                .energyScore(energyScore)
                .emotionTag(emotionTag)
                .crisisDetected(crisisDetected)
                .rationale(rationale)
                .quoteContent(quoteContent)
                .breathingContent(breathingContent)
                .groundingContent(groundingContent)
                .resources(resources)
                .build();
    }

    /**
     * Mark a session as completed with optional feedback.
     */
    @Transactional
    public Map<String, Object> completeSession(CalmDownCompletionRequest request) {
        CalmDownSession session = sessionRepository.findBySessionId(request.getSessionId())
                .orElseThrow(() -> new NoSuchElementException("Session not found: " + request.getSessionId()));

        if (session.isCompleted()) {
            return Map.of("status", "already_completed", "sessionId", session.getSessionId());
        }

        session.setCompleted(true);
        session.setCompletedAt(LocalDateTime.now());

        if (request.getDurationSeconds() != null && request.getDurationSeconds() > 0) {
            session.setDurationSeconds(request.getDurationSeconds());
        }

        if (request.getFeedbackRating() != null) {
            String rating = request.getFeedbackRating().toLowerCase().trim();
            if (List.of("better", "same", "worse").contains(rating)) {
                session.setFeedbackRating(rating);
            }
        }

        sessionRepository.save(session);

        log.info("Calm-Down session completed: sessionId={}, kitType={}, duration={}s, feedback={}",
                session.getSessionId(), session.getKitType(),
                session.getDurationSeconds(), session.getFeedbackRating());

        return Map.of(
                "status", "completed",
                "sessionId", session.getSessionId(),
                "kitType", session.getKitType(),
                "message", "Well done! Taking time for your mental health is an important step."
        );
    }

    /**
     * Compute Calm-Down Kit usage and effectiveness statistics.
     */
    @Transactional(readOnly = true)
    public CalmDownStatsResponse getStats() {
        long total = sessionRepository.count();
        long completed = sessionRepository.countByCompletedTrue();
        long crisis = sessionRepository.countByCrisisDetectedTrue();

        // Kit type distribution
        List<Object[]> kitRows = sessionRepository.countByKitType();
        List<CalmDownStatsResponse.KitTypeCount> kitDist = kitRows.stream()
                .map(r -> CalmDownStatsResponse.KitTypeCount.builder()
                        .kitType((String) r[0])
                        .count((Long) r[1])
                        .percent(total > 0 ? roundTwo(((Long) r[1]) * 100.0 / total) : 0)
                        .build())
                .collect(Collectors.toList());

        // Completion by kit type
        Map<String, Long> prescribedMap = kitRows.stream()
                .collect(Collectors.toMap(r -> (String) r[0], r -> (Long) r[1]));
        List<Object[]> completedRows = sessionRepository.countCompletedByKitType();
        Map<String, Long> completedMap = completedRows.stream()
                .collect(Collectors.toMap(r -> (String) r[0], r -> (Long) r[1]));

        List<CalmDownStatsResponse.KitTypeCompletion> kitCompletion = prescribedMap.entrySet().stream()
                .map(e -> {
                    long prescribed = e.getValue();
                    long comp = completedMap.getOrDefault(e.getKey(), 0L);
                    return CalmDownStatsResponse.KitTypeCompletion.builder()
                            .kitType(e.getKey())
                            .prescribed(prescribed)
                            .completed(comp)
                            .completionRate(prescribed > 0 ? roundTwo(comp * 100.0 / prescribed) : 0)
                            .build();
                })
                .collect(Collectors.toList());

        // Duration by kit type
        List<Object[]> durationRows = sessionRepository.avgDurationByKitType();
        List<CalmDownStatsResponse.KitTypeDuration> kitDuration = durationRows.stream()
                .map(r -> CalmDownStatsResponse.KitTypeDuration.builder()
                        .kitType((String) r[0])
                        .avgDurationSeconds(roundTwo((Double) r[1]))
                        .build())
                .collect(Collectors.toList());

        // Feedback distribution
        List<Object[]> feedbackRows = sessionRepository.countByFeedbackRating();
        long totalFeedback = feedbackRows.stream().mapToLong(r -> (Long) r[1]).sum();
        List<CalmDownStatsResponse.FeedbackCount> feedbackDist = feedbackRows.stream()
                .map(r -> CalmDownStatsResponse.FeedbackCount.builder()
                        .rating((String) r[0])
                        .count((Long) r[1])
                        .percent(totalFeedback > 0 ? roundTwo(((Long) r[1]) * 100.0 / totalFeedback) : 0)
                        .build())
                .collect(Collectors.toList());

        // Feedback by kit type
        List<Object[]> fbByKit = sessionRepository.countFeedbackByKitType();
        List<CalmDownStatsResponse.KitTypeFeedback> feedbackByKitType = fbByKit.stream()
                .map(r -> CalmDownStatsResponse.KitTypeFeedback.builder()
                        .kitType((String) r[0])
                        .rating((String) r[1])
                        .count((Long) r[2])
                        .build())
                .collect(Collectors.toList());

        // Daily volume
        List<Object[]> dailyRows = sessionRepository.countDailySessions(
                LocalDate.now().minusDays(30).atStartOfDay());
        List<CalmDownStatsResponse.DailyCount> dailyVolume = dailyRows.stream()
                .map(r -> CalmDownStatsResponse.DailyCount.builder()
                        .date(r[0] != null ? r[0].toString() : "")
                        .count(r[1] != null ? (Long) r[1] : 0)
                        .build())
                .collect(Collectors.toList());

        return CalmDownStatsResponse.builder()
                .totalPrescriptions(total)
                .totalCompleted(completed)
                .completionRate(total > 0 ? roundTwo(completed * 100.0 / total) : 0)
                .crisisSessions(crisis)
                .kitTypeDistribution(kitDist)
                .kitTypeCompletion(kitCompletion)
                .kitTypeDuration(kitDuration)
                .feedbackDistribution(feedbackDist)
                .feedbackByKitType(feedbackByKitType)
                .dailyVolume(dailyVolume)
                .build();
    }

    // ── Kit Content Builders ──

    private CalmDownPrescription.BreathingContent buildBoxBreathing(int energyScore) {
        // Adjust breathing pattern based on energy: higher energy = longer cycles
        int inhale, hold, exhale, holdAfter, cycles;
        String name, desc;

        if (energyScore >= 7) {
            inhale = 4; hold = 7; exhale = 8; holdAfter = 0; cycles = 4;
            name = "4-7-8 Relaxing Breath";
            desc = "A calming technique that activates your parasympathetic nervous system. "
                    + "Inhale through your nose, hold, then exhale slowly through your mouth.";
        } else {
            inhale = 4; hold = 4; exhale = 4; holdAfter = 4; cycles = 5;
            name = "Box Breathing (4-4-4-4)";
            desc = "A balanced breathing pattern used to reduce stress and improve focus. "
                    + "Breathe in, hold, breathe out, hold — each for 4 seconds.";
        }

        int cycleDuration = inhale + hold + exhale + holdAfter;
        List<CalmDownPrescription.BreathingStep> steps = new ArrayList<>();
        steps.add(CalmDownPrescription.BreathingStep.builder()
                .order(1).phase("inhale").durationSeconds(inhale)
                .instruction("Breathe in slowly through your nose for " + inhale + " seconds.")
                .build());
        steps.add(CalmDownPrescription.BreathingStep.builder()
                .order(2).phase("hold").durationSeconds(hold)
                .instruction("Hold your breath gently for " + hold + " seconds.")
                .build());
        steps.add(CalmDownPrescription.BreathingStep.builder()
                .order(3).phase("exhale").durationSeconds(exhale)
                .instruction("Exhale slowly through your mouth for " + exhale + " seconds.")
                .build());
        if (holdAfter > 0) {
            steps.add(CalmDownPrescription.BreathingStep.builder()
                    .order(4).phase("holdAfterExhale").durationSeconds(holdAfter)
                    .instruction("Hold empty for " + holdAfter + " seconds before the next cycle.")
                    .build());
        }

        return CalmDownPrescription.BreathingContent.builder()
                .patternName(name)
                .description(desc)
                .inhaleSeconds(inhale)
                .holdSeconds(hold)
                .exhaleSeconds(exhale)
                .holdAfterExhaleSeconds(holdAfter)
                .recommendedCycles(cycles)
                .totalDurationSeconds(cycleDuration * cycles)
                .steps(steps)
                .build();
    }

    private CalmDownPrescription.GroundingContent buildGrounding54321() {
        List<CalmDownPrescription.GroundingStep> steps = List.of(
                CalmDownPrescription.GroundingStep.builder()
                        .order(1).count(5).sense("see")
                        .instruction("Look around and name 5 things you can see right now.")
                        .placeholder("e.g. desk, window, phone, pen, ceiling")
                        .build(),
                CalmDownPrescription.GroundingStep.builder()
                        .order(2).count(4).sense("touch")
                        .instruction("Notice 4 things you can physically touch or feel.")
                        .placeholder("e.g. chair, keyboard, shirt fabric, cool air")
                        .build(),
                CalmDownPrescription.GroundingStep.builder()
                        .order(3).count(3).sense("hear")
                        .instruction("Listen carefully and identify 3 things you can hear.")
                        .placeholder("e.g. fan humming, birds, distant traffic")
                        .build(),
                CalmDownPrescription.GroundingStep.builder()
                        .order(4).count(2).sense("smell")
                        .instruction("Focus on 2 things you can smell (or imagine smelling).")
                        .placeholder("e.g. coffee, fresh air")
                        .build(),
                CalmDownPrescription.GroundingStep.builder()
                        .order(5).count(1).sense("taste")
                        .instruction("Notice 1 thing you can taste right now.")
                        .placeholder("e.g. water, toothpaste, gum")
                        .build()
        );

        return CalmDownPrescription.GroundingContent.builder()
                .techniqueName("5-4-3-2-1 Grounding Technique")
                .introduction("This exercise helps bring you back to the present moment by engaging all five senses. "
                        + "Take your time with each step — there are no wrong answers.")
                .steps(steps)
                .completionMessage("Well done! Grounding can help reduce the intensity of overwhelming feelings. "
                        + "If you still feel unsafe, please use the support resources below.")
                .build();
    }

    /**
     * Build resources from the Resource Linker database.
     * Falls back to hardcoded defaults if the DB is empty or unavailable.
     */
    private List<CalmDownPrescription.Resource> buildResources(String kitType, boolean crisisDetected) {
        try {
            List<WellnessResource> dbResources;

            if ("grounding".equals(kitType) || crisisDetected) {
                // High-intensity / crisis: fetch crisis resources + high-energy resources
                dbResources = resourceLinkerService.getContextualResources(null, 9, true);
            } else if ("breathing".equals(kitType)) {
                // Mid-intensity: fetch moderate-energy resources
                dbResources = resourceLinkerService.getContextualResources(null, 6, false);
            } else {
                // Low-intensity: fetch low-energy resources
                dbResources = resourceLinkerService.getContextualResources(null, 2, false);
            }

            if (dbResources != null && !dbResources.isEmpty()) {
                return dbResources.stream()
                        .limit(6) // Cap at 6 resources per prescription
                        .map(this::toKitResource)
                        .collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Resource Linker unavailable for Calm-Down Kit, using fallback: {}", e.getMessage());
        }

        // Fallback: hardcoded defaults if Resource Linker is unavailable
        return buildFallbackResources(kitType, crisisDetected);
    }

    /**
     * Convert a WellnessResource entity to the Calm-Down Kit's Resource DTO.
     */
    private CalmDownPrescription.Resource toKitResource(WellnessResource wr) {
        String type;
        String value = wr.getLink();

        // Map category + link protocol to resource type
        if ("HOTLINE".equals(wr.getCategory()) || "CHAT_SERVICE".equals(wr.getCategory())) {
            type = "hotline";
            // Strip tel: / sms: prefix for display
            if (value != null && value.startsWith("tel:")) value = value.substring(4);
            else if (value != null && value.startsWith("sms:")) value = value.substring(4);
        } else if (value != null && value.startsWith("mailto:")) {
            type = "email";
            value = value.substring(7);
        } else {
            type = "link";
        }

        return CalmDownPrescription.Resource.builder()
                .type(type)
                .label(wr.getTitle())
                .value(value)
                .urgent(wr.isCrisisOnly())
                .build();
    }

    /**
     * Fallback resources when the Resource Linker database is unavailable.
     */
    private List<CalmDownPrescription.Resource> buildFallbackResources(String kitType, boolean crisisDetected) {
        List<CalmDownPrescription.Resource> resources = new ArrayList<>();

        if ("grounding".equals(kitType) || crisisDetected) {
            resources.add(resource("hotline", "Emergency Services", "112", true));
            resources.add(resource("hotline", "USTP Crisis Hotline", "(088) 856-1738", true));
            resources.add(resource("email", "Campus Psychometrician", "psychometrician@ustp.edu.ph", true));
            resources.add(resource("hotline", "NCMH Crisis Hotline", "0917-899-8727", false));
            resources.add(resource("link", "Mental Health PH", "https://mentalhealthph.org", false));
        } else if ("breathing".equals(kitType)) {
            resources.add(resource("email", "Campus Psychometrician", "psychometrician@ustp.edu.ph", false));
            resources.add(resource("link", "USTP Wellness Center", "https://ustp.edu.ph/wellness", false));
        } else {
            resources.add(resource("link", "Wellness Tips", "https://ustp.edu.ph/wellness", false));
        }

        return resources;
    }

    private String getFollowUpTip(String emotion) {
        if (emotion == null) return "Consider jotting down your thoughts in a journal.";
        return switch (emotion) {
            case "Sad" -> "Try doing one small thing that usually brings you comfort — a warm drink, a song, or a walk.";
            case "Angry" -> "Physical movement like stretching or a short walk can help release tension.";
            case "Anxious" -> "Focus on what you can control right now. Make a short to-do list of just 1–2 items.";
            case "Lonely" -> "Consider sending a short message to someone you trust — even a simple 'hello' counts.";
            case "Frustrated" -> "Step away from what's frustrating you for 5 minutes. Come back with fresh eyes.";
            case "Relieved" -> "Take note of what helped create this relief so you can use it again.";
            case "Happy" -> "Enjoy this moment fully! Consider sharing this feeling with someone you care about.";
            default -> "Consider jotting down your thoughts in a journal.";
        };
    }

    // ── Helpers ──

    private CalmDownPrescription.Resource resource(String type, String label, String value, boolean urgent) {
        return CalmDownPrescription.Resource.builder()
                .type(type).label(label).value(value).urgent(urgent).build();
    }

    private double roundTwo(double val) {
        return Math.round(val * 100.0) / 100.0;
    }
}
