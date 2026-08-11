package com.safe.space.service;

import com.safe.space.dto.AutoReplyRequest;
import com.safe.space.dto.AutoReplyResponse;
import com.safe.space.dto.AutoReplyStatsResponse;
import com.safe.space.model.AutoReplyLog;
import com.safe.space.repository.AutoReplyLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Rule-Based Auto-Reply engine.
 *
 * Rules are evaluated in priority order:
 *   1. CRISIS — content contains crisis keywords → override with crisis reply
 *   2. HIGH   — energy 8–10 → urgent support + grounding exercises + resources
 *   3. MID    — energy 5–7  → guided breathing + coping suggestions
 *   4. LOW    — energy 1–4  → gentle validation + self-care prompts
 *
 * Each tier provides:
 *   - A message tailored to the specific emotion (8 emotions × 4 tiers = 32 rules)
 *   - Suggested actions (breathing, grounding, journaling, contact professional)
 *   - Support resources (hotlines, email, campus links)
 *
 * Every reply is logged to auto_reply_logs for analytics.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AutoReplyService {

    private final CrisisKeywordService crisisKeywordService;
    private final AutoReplyLogRepository autoReplyLogRepository;

    // ── Crisis override replies ──
    private static final Map<String, String> CRISIS = Map.of(
            "Angry",      "We hear you. What you're feeling is serious. Please reach out to a crisis professional now — you don't have to face this alone.",
            "Sad",        "We're concerned about you. Please contact emergency services or a campus counselor immediately. You matter and help is available right now.",
            "Anxious",    "This sounds like a crisis. Please reach out to the crisis hotline or your campus psychometrician immediately. You deserve support.",
            "Lonely",     "You are not alone in this. Please call the crisis hotline or contact campus support now — someone is ready to listen.",
            "Frustrated", "We can see you're in deep pain. Please contact a professional immediately — the crisis resources below are here for you.",
            "Neutral",    "Your words indicate you may need immediate support. Please use the crisis resources below or call for help now.",
            "Relieved",   "Even if you feel some relief, the words you shared concern us. Please reach out to a crisis professional to talk through what you're experiencing.",
            "Happy",      "We noticed some concerning language in your post. Please reach out to a crisis professional if you're having thoughts of harm."
    );

    // ── High energy replies (8–10) ──
    private static final Map<String, String> HIGH = Map.of(
            "Angry",      "I can tell you're really hurting right now. Please look at the resources below and consider contacting someone immediately.",
            "Sad",        "You seem deeply distressed. If you're in danger, call emergency services now. Resources are shown below.",
            "Anxious",    "This looks severe — please review immediate resources and consider contacting support.",
            "Lonely",     "This indicates high distress. Support resources are available — please check them now.",
            "Frustrated", "You're experiencing high emotional intensity. Please see the resources and consider reaching out.",
            "Neutral",    "Your intensity is high — please consider immediate support options.",
            "Relieved",   "Even strong relief can be intense; if you feel unsafe, use resources below.",
            "Happy",      "High-intensity feelings present — if this feels overwhelming please consider support resources."
    );

    // ── Mid energy replies (5–7) ──
    private static final Map<String, String> MID = Map.of(
            "Angry",      "I can see you're upset. Try a 4-4-4 breathing cycle and come back when calmer.",
            "Sad",        "This seems heavy. Try the breathing exercise below or a short grounding technique.",
            "Anxious",    "You're showing notable anxiety. Guided breathing can help reduce intensity.",
            "Lonely",     "Consider a quick grounding exercise or contact someone you trust.",
            "Frustrated", "Try a breathing or movement break — small actions can reduce build-up.",
            "Neutral",    "You've noted your feelings — here are a few steps that might help.",
            "Relieved",   "Keep the practices that helped you reach relief.",
            "Happy",      "Enjoy the moment — breathing and reflection help build resilience."
    );

    // ── Low energy replies (1–4) ──
    private static final Map<String, String> LOW = Map.of(
            "Angry",      "It's okay to feel upset. Take a short pause and notice your breath.",
            "Sad",        "I'm sorry you're feeling sad — a small kindness to yourself can help.",
            "Anxious",    "A brief grounding or slow breath may lower your anxiety right now.",
            "Lonely",     "Feeling alone is valid — consider reaching out to a friend or trying a short grounding exercise.",
            "Frustrated", "Frustration is normal. Try stepping away for a minute and returning when ready.",
            "Neutral",    "Thanks for sharing — noticing your feelings is a helpful first step.",
            "Relieved",   "It's good to feel relief. Keep doing what helps you maintain balance.",
            "Happy",      "Nice to hear — celebrate this moment and the things that helped it happen."
    );
    // ── Content theme keywords for context-aware replies ──
    private static final Map<String, List<String>> CONTENT_THEMES = Map.of(
            "academic", List.of("exam", "test", "grade", "school", "class", "study", "homework",
                    "professor", "teacher", "fail", "failing", "dropped", "gpa", "thesis", "project"),
            "relationship", List.of("friend", "boyfriend", "girlfriend", "family", "parent", "mom",
                    "dad", "breakup", "broke up", "fight", "argument", "betrayed", "trust"),
            "loneliness", List.of("alone", "lonely", "nobody", "no one", "isolated", "left out",
                    "ignored", "invisible", "forgotten", "abandoned"),
            "overwhelm", List.of("stressed", "overwhelmed", "too much", "can't handle", "burned out",
                    "burnout", "exhausted", "tired", "drained", "pressure", "deadline"),
            "self_worth", List.of("worthless", "useless", "stupid", "ugly", "hate myself", "not good enough",
                    "failure", "loser", "burden", "nobody cares", "don't matter")
    );

    // ── Content-aware theme replies (override generic emotion-only replies) ──
    private static final Map<String, String> THEME_REPLIES = Map.of(
            "academic", "School pressures can feel heavy, but remember — one grade or one exam doesn't define your worth. Consider breaking tasks into smaller steps and reaching out to a classmate or tutor.",
            "relationship", "Relationship challenges are tough. It's okay to feel hurt. Give yourself space to process, and remember that your feelings are valid. Talking to someone you trust can help.",
            "loneliness", "Feeling alone is one of the hardest emotions. You've taken a brave step by sharing here. Consider reaching out through the Anonymous Chat — someone is ready to listen.",
            "overwhelm", "It sounds like you're carrying a lot right now. You don't have to solve everything at once. Try focusing on just the next small step, and give yourself permission to rest.",
            "self_worth", "You are more than what you feel right now. These thoughts don't define you. Please be gentle with yourself — and consider talking to the campus counselor for support."
    );

    /**
     * Content-aware reply (used by PostService).
     * Analyzes the actual post text to generate a contextually relevant response.
     */
    public String generateReply(String emotion, int energyScore, String content) {
        // 1. Check if content is gibberish or too vague to analyze
        ContentQuality quality = analyzeContentQuality(content);

        if (quality == ContentQuality.GIBBERISH) {
            return buildGibberishReply(emotion);
        }

        if (quality == ContentQuality.TOO_SHORT) {
            return buildShortReply(emotion, energyScore);
        }

        // 2. Detect themes in meaningful content
        String detectedTheme = detectTheme(content);

        if (detectedTheme != null && THEME_REPLIES.containsKey(detectedTheme)) {
            return THEME_REPLIES.get(detectedTheme);
        }

        // 3. Fall back to emotion + energy based reply
        return getEmotionEnergyReply(emotion, energyScore);
    }

    /**
     * Simple string-only reply (backward-compatible, no content).
     */
    public String generateReply(String emotion, int energyScore) {
        return getEmotionEnergyReply(emotion, energyScore);
    }

    /**
     * Get the standard emotion+energy reply from the rule maps.
     */
    private String getEmotionEnergyReply(String emotion, int energyScore) {
        return generateFullReply(AutoReplyRequest.builder()
                .emotionTag(emotion)
                .energyScore(energyScore)
                .build(), false).getMessage();
    }

    // ── Content Analysis ──

    private enum ContentQuality { MEANINGFUL, TOO_SHORT, GIBBERISH }

    /**
     * Analyze whether the content is meaningful text, gibberish, or too short.
     */
    private ContentQuality analyzeContentQuality(String content) {
        if (content == null || content.isBlank()) return ContentQuality.TOO_SHORT;

        String trimmed = content.trim();

        // Too short to be meaningful (less than 10 chars, e.g. "sad" or "hi")
        if (trimmed.length() < 10) return ContentQuality.TOO_SHORT;

        // Check for gibberish: no real words
        String[] words = trimmed.toLowerCase().split("\\s+");
        int realWordCount = 0;

        for (String word : words) {
            String clean = word.replaceAll("[^a-z]", "");
            if (clean.length() < 2) continue;
            if (isLikelyRealWord(clean)) realWordCount++;
        }

        // If less than 40% of words look real, it's probably gibberish
        if (words.length > 0 && (double) realWordCount / words.length < 0.4) {
            return ContentQuality.GIBBERISH;
        }

        return ContentQuality.MEANINGFUL;
    }

    /**
     * Simple heuristic: a "real word" has vowels and isn't just repeated characters.
     */
    private boolean isLikelyRealWord(String word) {
        if (word.length() < 2) return false;

        // Must contain at least one vowel
        boolean hasVowel = word.matches(".*[aeiouy].*");
        if (!hasVowel) return false;

        // Must not be all the same character repeated (e.g., "aaaa", "sss")
        if (word.chars().distinct().count() <= 1) return false;

        // Must not be a simple keyboard mash pattern (e.g., "asdf", "qwer")
        String[] mashPatterns = {"asdf", "qwer", "zxcv", "asd", "qwe", "jkl"};
        for (String p : mashPatterns) {
            if (word.contains(p)) return false;
        }

        return true;
    }

    /**
     * Detect the primary emotional theme from meaningful content.
     */
    private String detectTheme(String content) {
        if (content == null) return null;
        String lower = content.toLowerCase();

        String bestTheme = null;
        int bestScore = 0;

        for (Map.Entry<String, List<String>> entry : CONTENT_THEMES.entrySet()) {
            int score = 0;
            for (String keyword : entry.getValue()) {
                if (lower.contains(keyword)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestTheme = entry.getKey();
            }
        }

        return bestScore > 0 ? bestTheme : null;
    }

    /**
     * Reply for gibberish/random text — gently encourage the student to express themselves.
     */
    private String buildGibberishReply(String emotion) {
        return switch (emotion) {
            case "Sad" -> "It seems like it might be hard to put your feelings into words right now — that's okay. When you're ready, try describing what happened or what you're feeling. We're here to listen.";
            case "Angry" -> "Sometimes emotions are so intense that words don't come easily. Take a moment, breathe, and when you're ready, try sharing what's bothering you. This is a safe space.";
            case "Anxious" -> "It looks like you might be having trouble expressing what's on your mind. That's completely normal when you're anxious. Try starting with: 'I feel anxious because...'";
            case "Lonely" -> "We noticed you're reaching out, and that matters. If it's hard to find the right words, try starting with what happened today or how your day has been.";
            case "Frustrated" -> "It seems hard to express what you're going through. When frustration builds up, writing even a few honest words can help release it. Try again when you're ready.";
            case "Happy", "Relieved" -> "Thanks for sharing! If you'd like to tell us more about what's making you feel this way, we'd love to hear it.";
            default -> "Thanks for reaching out. If you'd like to share more about how you're feeling, try describing what's on your mind — even a few words can help.";
        };
    }

    /**
     * Reply for very short/vague posts — validate and encourage elaboration.
     */
    private String buildShortReply(String emotion, int energyScore) {
        if (energyScore >= 8) {
            return "We can see your energy is really high right now. If you're comfortable, try sharing a bit more about what you're going through — it can help to put it into words. We're listening.";
        }
        return switch (emotion) {
            case "Sad" -> "We hear you. Even a few words show courage. If you'd like to share more, we're here — there's no rush.";
            case "Angry" -> "Your feelings are valid. If you want to let more out, go ahead — this is your safe space.";
            case "Anxious" -> "It's okay to start small. If you'd like, try writing what's making you feel this way. We're listening.";
            case "Lonely" -> "We see you, and you're not invisible here. Feel free to share more whenever you're ready.";
            default -> "Thanks for sharing. If you feel like saying more, go ahead — this space is just for you.";
        };
    }

    /**
     * Generate a full structured auto-reply with message, actions, and resources.
     *
     * @param request    the auto-reply request
     * @param persist    whether to log this reply to the database
     * @return rich auto-reply response
     */
    @Transactional
    public AutoReplyResponse generateFullReply(AutoReplyRequest request, boolean persist) {
        String emotion = request.getEmotionTag();
        int energy = request.getEnergyScore();
        String content = request.getContent();

        // ── Rule evaluation (priority order) ──
        boolean crisisDetected = false;
        if (content != null && !content.isBlank()) {
            crisisDetected = crisisKeywordService.isCrisis(content);
        }

        String tier;
        String ruleMatched;
        String message;

        if (crisisDetected) {
            tier = "crisis";
            ruleMatched = "CRISIS_" + sanitizeEmotion(emotion);
            message = CRISIS.getOrDefault(emotion, CRISIS.get("Neutral"));
        } else if (energy >= 8) {
            tier = "high";
            ruleMatched = "HIGH_" + sanitizeEmotion(emotion);
            message = HIGH.getOrDefault(emotion, HIGH.get("Neutral"));
        } else if (energy >= 5) {
            tier = "mid";
            ruleMatched = "MID_" + sanitizeEmotion(emotion);
            message = MID.getOrDefault(emotion, MID.get("Neutral"));
        } else {
            tier = "low";
            ruleMatched = "LOW_" + sanitizeEmotion(emotion);
            message = LOW.getOrDefault(emotion, LOW.get("Neutral"));
        }

        // ── Build suggested actions ──
        List<AutoReplyResponse.SuggestedAction> actions = buildActions(tier, emotion);

        // ── Build support resources ──
        List<AutoReplyResponse.SupportResource> resources = buildResources(tier);

        // ── Log the reply ──
        if (persist) {
            AutoReplyLog replyLog = AutoReplyLog.builder()
                    .postId(request.getPostId())
                    .emotionTag(emotion)
                    .energyScore(energy)
                    .tier(tier)
                    .ruleMatched(ruleMatched)
                    .replyMessage(message)
                    .crisisDetected(crisisDetected)
                    .suggestedActionsCount(actions.size())
                    .build();
            autoReplyLogRepository.save(replyLog);

            log.info("Auto-reply generated: tier={}, rule={}, emotion={}, energy={}, crisis={}",
                    tier, ruleMatched, emotion, energy, crisisDetected);
        }

        return AutoReplyResponse.builder()
                .message(message)
                .tier(tier)
                .ruleMatched(ruleMatched)
                .emotionTag(emotion)
                .energyScore(energy)
                .crisisDetected(crisisDetected)
                .suggestedActions(actions)
                .resources(resources)
                .build();
    }

    /**
     * Get all available rules as a map of tier → emotion → message.
     * Used by the admin/professional interface to review the rule set.
     */
    public Map<String, Map<String, String>> getAllRules() {
        Map<String, Map<String, String>> rules = new LinkedHashMap<>();
        rules.put("crisis", new LinkedHashMap<>(CRISIS));
        rules.put("high", new LinkedHashMap<>(HIGH));
        rules.put("mid", new LinkedHashMap<>(MID));
        rules.put("low", new LinkedHashMap<>(LOW));
        return rules;
    }

    /**
     * Compute auto-reply analytics/statistics.
     */
    @Transactional(readOnly = true)
    public AutoReplyStatsResponse getStats() {
        long total = autoReplyLogRepository.count();
        long crisisCount = autoReplyLogRepository.countByCrisisDetectedTrue();

        // Tier distribution
        List<Object[]> tierRows = autoReplyLogRepository.countByTier();
        List<AutoReplyStatsResponse.TierCount> tierDist = tierRows.stream()
                .map(r -> AutoReplyStatsResponse.TierCount.builder()
                        .tier((String) r[0])
                        .count((Long) r[1])
                        .percent(total > 0 ? roundTwo(((Long) r[1]) * 100.0 / total) : 0)
                        .build())
                .collect(Collectors.toList());

        // Emotion distribution
        List<Object[]> emotionRows = autoReplyLogRepository.countByEmotion();
        List<AutoReplyStatsResponse.EmotionCount> emotionDist = emotionRows.stream()
                .map(r -> AutoReplyStatsResponse.EmotionCount.builder()
                        .emotion((String) r[0])
                        .count((Long) r[1])
                        .percent(total > 0 ? roundTwo(((Long) r[1]) * 100.0 / total) : 0)
                        .build())
                .collect(Collectors.toList());

        // Top rules
        List<Object[]> ruleRows = autoReplyLogRepository.countByRule();
        List<AutoReplyStatsResponse.RuleCount> topRules = ruleRows.stream()
                .limit(10)
                .map(r -> AutoReplyStatsResponse.RuleCount.builder()
                        .rule((String) r[0])
                        .count((Long) r[1])
                        .build())
                .collect(Collectors.toList());

        // Daily volume (last 30 days)
        List<Object[]> dailyRows = autoReplyLogRepository.countDailyReplies(
                LocalDate.now().minusDays(30).atStartOfDay());
        List<AutoReplyStatsResponse.DailyCount> dailyVolume = dailyRows.stream()
                .map(r -> AutoReplyStatsResponse.DailyCount.builder()
                        .date(r[0] != null ? r[0].toString() : "")
                        .count(r[1] != null ? (Long) r[1] : 0)
                        .build())
                .collect(Collectors.toList());

        return AutoReplyStatsResponse.builder()
                .totalReplies(total)
                .crisisReplies(crisisCount)
                .crisisPercent(total > 0 ? roundTwo(crisisCount * 100.0 / total) : 0)
                .tierDistribution(tierDist)
                .emotionDistribution(emotionDist)
                .topRules(topRules)
                .dailyVolume(dailyVolume)
                .build();
    }

    // ── Action builders ──

    private List<AutoReplyResponse.SuggestedAction> buildActions(String tier, String emotion) {
        List<AutoReplyResponse.SuggestedAction> actions = new ArrayList<>();

        switch (tier) {
            case "crisis" -> {
                actions.add(action("contact_pro", "Contact a Professional",
                        "Reach out to the campus psychometrician or call the crisis hotline immediately.", 1));
                actions.add(action("grounding", "5-4-3-2-1 Grounding",
                        "Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.", 2));
                actions.add(action("breathing", "Emergency Breathing",
                        "Breathe in for 4 seconds, hold for 4, breathe out for 4. Repeat 5 times.", 3));
                actions.add(action("safe_exit", "Safe Exit",
                        "If you need to leave this page quickly, use the Safe Exit button.", 4));
            }
            case "high" -> {
                actions.add(action("grounding", "5-4-3-2-1 Grounding Exercise",
                        "Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste.", 1));
                actions.add(action("breathing", "Box Breathing (4-4-4-4)",
                        "Inhale 4s, hold 4s, exhale 4s, hold 4s. Repeat for 2 minutes.", 2));
                actions.add(action("contact_pro", "Talk to Someone",
                        "Consider reaching out to a trusted person or the campus psychometrician.", 3));
            }
            case "mid" -> {
                actions.add(action("breathing", "Box Breathing (4-4-4)",
                        "Inhale 4s, hold 4s, exhale 4s. Repeat 3–5 times to reduce intensity.", 1));
                if ("Lonely".equals(emotion) || "Sad".equals(emotion)) {
                    actions.add(action("grounding", "Quick Grounding",
                            "Plant your feet on the floor, feel the contact, and take 3 slow breaths.", 2));
                }
                actions.add(action("journaling", "Reflective Writing",
                        "Write down what triggered this feeling and one thing you can do about it.", 2));
            }
            case "low" -> {
                actions.add(action("journaling", "Gratitude Check",
                        "Write down one thing you're grateful for today, no matter how small.", 1));
                actions.add(action("self_care", "Small Self-Care",
                        "Do one kind thing for yourself: a short walk, a warm drink, or a stretch.", 2));
            }
            default -> actions.add(action("breathing", "Simple Breathing",
                    "Take 3 slow, deep breaths and notice how you feel.", 1));
        }

        return actions;
    }

    private List<AutoReplyResponse.SupportResource> buildResources(String tier) {
        List<AutoReplyResponse.SupportResource> resources = new ArrayList<>();

        if ("crisis".equals(tier) || "high".equals(tier)) {
            resources.add(resource("hotline", "Emergency Services", "112", true));
            resources.add(resource("hotline", "USTP Crisis Hotline", "(088) 856-1738", true));
            resources.add(resource("email", "Campus Psychometrician", "psychometrician@ustp.edu.ph", true));
            resources.add(resource("hotline", "NCMH Crisis Hotline", "0917-899-8727", false));
            resources.add(resource("link", "Mental Health PH", "https://mentalhealthph.org", false));
        }

        if ("mid".equals(tier)) {
            resources.add(resource("email", "Campus Psychometrician", "psychometrician@ustp.edu.ph", false));
            resources.add(resource("link", "Calm-Down Kit", "/rant-board.html#calmKit", false));
        }

        if ("low".equals(tier)) {
            resources.add(resource("link", "Wellness Resources", "/resources.html", false));
        }

        return resources;
    }

    // ── Helpers ──

    private AutoReplyResponse.SuggestedAction action(String type, String title, String desc, int priority) {
        return AutoReplyResponse.SuggestedAction.builder()
                .type(type).title(title).description(desc).priority(priority).build();
    }

    private AutoReplyResponse.SupportResource resource(String type, String label, String value, boolean urgent) {
        return AutoReplyResponse.SupportResource.builder()
                .type(type).label(label).value(value).urgent(urgent).build();
    }

    private String sanitizeEmotion(String emotion) {
        if (emotion == null) return "Neutral";
        return emotion.replaceAll("[^a-zA-Z]", "");
    }

    private double roundTwo(double val) {
        return Math.round(val * 100.0) / 100.0;
    }
}
