package com.safe.space.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Automated Fallback Response service.
 *
 * Secondary messaging logic within the chat module that acknowledges
 * a student's message when no psychometrician is available. The fallback
 * system uses three layers of intelligence:
 *
 *   1. Professional Presence Tracking — Heartbeat-based online/offline detection
 *   2. Contextual Response Engine     — Generates emotion-aware, energy-calibrated responses
 *   3. Crisis Escalation Override     — Forces safety-tier responses when crisis is detected
 *
 * Fallback triggers:
 *   - Session in WAITING status (no professional assigned yet)
 *   - Session in ACTIVE status but assigned professional has gone offline
 *
 * The service does NOT replace human counselors. It provides:
 *   - Immediate acknowledgment ("You are not alone")
 *   - Emotional validation ("It's okay to feel this way")
 *   - Safety resources (when crisis is detected)
 *   - ETA messaging ("A counselor will be with you shortly")
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FallbackResponseService {

    private final CrisisKeywordService crisisKeywordService;

    /**
     * Tracks professional online status.
     * Key: professionalId, Value: last heartbeat timestamp.
     */
    private final ConcurrentHashMap<String, LocalDateTime> professionalHeartbeats = new ConcurrentHashMap<>();

    /** Professional considered offline after this many seconds without heartbeat. */
    private static final int HEARTBEAT_TIMEOUT_SECONDS = 60;

    // ── Professional Presence ──

    /**
     * Records a heartbeat from a professional, marking them as online.
     */
    public void recordHeartbeat(String professionalId) {
        professionalHeartbeats.put(professionalId, LocalDateTime.now());
        log.debug("Heartbeat recorded: professionalId={}", professionalId);
    }

    /**
     * Checks if a professional is currently online (heartbeat within timeout).
     */
    public boolean isProfessionalOnline(String professionalId) {
        if (professionalId == null || professionalId.isBlank()) return false;
        LocalDateTime lastBeat = professionalHeartbeats.get(professionalId);
        if (lastBeat == null) return false;
        return lastBeat.plusSeconds(HEARTBEAT_TIMEOUT_SECONDS).isAfter(LocalDateTime.now());
    }

    /**
     * Checks if ANY professional is currently online.
     */
    public boolean isAnyProfessionalOnline() {
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(HEARTBEAT_TIMEOUT_SECONDS);
        return professionalHeartbeats.values().stream()
                .anyMatch(ts -> ts.isAfter(cutoff));
    }

    /**
     * Returns the online status of all tracked professionals.
     */
    public Map<String, Object> getProfessionalStatus() {
        Map<String, Object> result = new LinkedHashMap<>();
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(HEARTBEAT_TIMEOUT_SECONDS);
        long onlineCount = 0;

        List<Map<String, Object>> professionals = new ArrayList<>();
        for (Map.Entry<String, LocalDateTime> entry : professionalHeartbeats.entrySet()) {
            boolean online = entry.getValue().isAfter(cutoff);
            if (online) onlineCount++;
            professionals.add(Map.of(
                    "professionalId", entry.getKey(),
                    "lastHeartbeat", entry.getValue().toString(),
                    "online", online
            ));
        }

        result.put("totalTracked", professionalHeartbeats.size());
        result.put("onlineCount", onlineCount);
        result.put("anyOnline", onlineCount > 0);
        result.put("professionals", professionals);
        return result;
    }

    // ── Fallback Response Generation ──

    /**
     * Determines if a fallback response should be triggered.
     *
     * @param sessionStatus     current session status (WAITING, ACTIVE)
     * @param professionalId    assigned professional (null if WAITING)
     * @return true if fallback should be sent
     */
    public boolean shouldTriggerFallback(String sessionStatus, String professionalId) {
        // Always trigger for WAITING sessions (no professional assigned)
        if ("WAITING".equals(sessionStatus)) {
            return true;
        }

        // For ACTIVE sessions, trigger if the assigned professional is offline
        if ("ACTIVE".equals(sessionStatus)) {
            return !isProfessionalOnline(professionalId);
        }

        // Never trigger for CLOSED sessions
        return false;
    }

    /**
     * Generates a contextual fallback response based on the student's
     * emotional state, energy score, and message content.
     * Analyzes the actual message for meaningfulness and responds accordingly.
     */
    public FallbackResult generateFallback(String emotionTag, Integer energyScore,
                                            String messageContent, String sessionStatus,
                                            boolean isFirstMessage) {
        int energy = energyScore != null ? energyScore : 5;
        String emotion = emotionTag != null ? emotionTag : "Neutral";

        // Check for crisis content
        boolean crisisDetected = messageContent != null
                && crisisKeywordService.isCrisis(messageContent);

        // Analyze message content quality
        MessageAnalysis analysis = analyzeMessage(messageContent);

        // Build response
        StringBuilder response = new StringBuilder();
        String responseType;

        if (crisisDetected) {
            // CRISIS OVERRIDE — immediate safety response
            responseType = "crisis_fallback";
            response.append("🚨 I hear you, and I want you to know that you are not alone. ");
            response.append("Your safety matters more than anything else right now.\n\n");
            response.append("📞 Please reach out to these resources immediately:\n");
            response.append("• National Mental Health Crisis Hotline: 1553\n");
            response.append("• Crisis Text Line: Text HELLO to 741741\n");
            response.append("• Emergency Services: 911\n\n");
            response.append("A counselor has been notified and will prioritize your session. ");
            response.append("Please stay with us — help is on the way.");
        } else if (analysis.isGibberish) {
            // GIBBERISH / RANDOM TEXT — gentle clarification
            responseType = "clarification_fallback";
            response.append(getClarificationResponse(sessionStatus));
        } else if (analysis.isTooShort) {
            // VERY SHORT MESSAGE — encourage elaboration
            responseType = "short_fallback";
            response.append(getShortMessageResponse(messageContent, sessionStatus));
        } else if (analysis.isGreeting) {
            // GREETING — respond warmly
            responseType = "greeting_fallback";
            response.append(getGreetingResponse(sessionStatus));
        } else if (analysis.isQuestion) {
            // QUESTION — acknowledge and redirect
            responseType = "question_fallback";
            response.append(getQuestionResponse(sessionStatus));
        } else if (isFirstMessage && "WAITING".equals(sessionStatus)) {
            // FIRST MEANINGFUL MESSAGE — warm welcome + content acknowledgment
            responseType = "welcome_fallback";
            response.append(getContextualWelcome(messageContent, emotion, energy));
        } else if ("WAITING".equals(sessionStatus)) {
            // SUBSEQUENT MEANINGFUL MESSAGE while waiting
            responseType = "waiting_fallback";
            response.append(getContextualWaitingResponse(messageContent, emotion, energy));
        } else {
            // ACTIVE but professional offline
            responseType = "offline_fallback";
            response.append(getOfflineResponse(emotion, energy));
        }

        FallbackResult result = new FallbackResult(
                response.toString(),
                responseType,
                crisisDetected,
                emotion,
                energy
        );

        log.info("Fallback generated: type={}, crisis={}, analysis=[gibberish={},short={},greeting={},question={}]",
                responseType, crisisDetected, analysis.isGibberish, analysis.isTooShort, analysis.isGreeting, analysis.isQuestion);

        return result;
    }

    // ── Message Content Analysis ──

    private static class MessageAnalysis {
        boolean isGibberish;
        boolean isTooShort;
        boolean isGreeting;
        boolean isQuestion;
    }

    /**
     * Analyzes message content to determine its nature and meaningfulness.
     */
    private MessageAnalysis analyzeMessage(String content) {
        MessageAnalysis a = new MessageAnalysis();
        if (content == null || content.isBlank()) {
            a.isTooShort = true;
            return a;
        }

        String trimmed = content.trim();
        String lower = trimmed.toLowerCase();

        // Check greeting
        List<String> greetings = List.of("hi", "hello", "hey", "good morning", "good afternoon",
                "good evening", "yo", "sup", "hiya", "howdy", "greetings", "hi there", "hello there");
        a.isGreeting = greetings.stream().anyMatch(g ->
                lower.equals(g) || lower.equals(g + "!") || lower.equals(g + ".") || lower.equals(g + "!!"));

        // Check question
        a.isQuestion = trimmed.endsWith("?") || lower.startsWith("how ") || lower.startsWith("what ")
                || lower.startsWith("why ") || lower.startsWith("when ") || lower.startsWith("where ")
                || lower.startsWith("can ") || lower.startsWith("is ") || lower.startsWith("do ");

        // Check too short (less than 3 real words, not a greeting)
        String[] words = trimmed.split("\\s+");
        if (words.length < 3 && !a.isGreeting && !a.isQuestion) {
            a.isTooShort = true;
        }

        // Check gibberish — detect random character strings
        if (!a.isGreeting && !a.isQuestion && !a.isTooShort) {
            a.isGibberish = isGibberishText(trimmed);
        }

        return a;
    }

    /**
     * Heuristic gibberish detection: checks for consonant clusters,
     * lack of vowels, and repetitive random patterns.
     */
    private boolean isGibberishText(String text) {
        String lower = text.toLowerCase().replaceAll("[^a-z\\s]", "");
        if (lower.isBlank()) return false;

        String[] words = lower.split("\\s+");
        int gibberishWords = 0;

        for (String word : words) {
            if (word.length() < 2) continue;
            // Count vowel ratio
            long vowels = word.chars().filter(c -> "aeiou".indexOf(c) >= 0).count();
            double vowelRatio = (double) vowels / word.length();

            // Count max consecutive consonants
            int maxConsonants = 0, currentConsonants = 0;
            for (char c : word.toCharArray()) {
                if ("aeiou".indexOf(c) < 0) {
                    currentConsonants++;
                    maxConsonants = Math.max(maxConsonants, currentConsonants);
                } else {
                    currentConsonants = 0;
                }
            }

            // Gibberish indicators: very low vowel ratio OR very long consonant clusters
            if ((word.length() > 3 && vowelRatio < 0.15) || maxConsonants >= 4) {
                gibberishWords++;
            }
        }

        // If majority of words are gibberish
        return words.length > 0 && (double) gibberishWords / words.length > 0.5;
    }

    // ── Context-Aware Response Builders ──

    private String getClarificationResponse(String sessionStatus) {
        List<String> responses = List.of(
                "I'm here to help, but I wasn't quite able to understand your message. Could you try rephrasing what you'd like to share? A counselor will be with you soon. 💚",
                "It seems like your message may not have come through clearly. Could you tell me more about what's on your mind? I want to make sure you get the right support.",
                "I want to make sure I understand you correctly. Could you share a bit more about how you're feeling or what you need help with? A counselor is on the way. 🌿",
                "I noticed your message might not have conveyed what you intended. Feel free to share your thoughts — whether it's about stress, feelings, or anything at all. We're here for you."
        );
        return responses.get(new Random().nextInt(responses.size()));
    }

    private String getShortMessageResponse(String content, String sessionStatus) {
        String escaped = content != null ? content.trim() : "";
        List<String> responses = List.of(
                "Thanks for reaching out! Could you share a bit more about what's going on? The more context you provide, the better a counselor can help you. 💚",
                "I'm listening. Feel free to share more details about what you're experiencing — there's no judgment here, and everything stays confidential.",
                "I'd love to help you better. Could you elaborate a little more on what's on your mind? A counselor will join soon and will want to understand your situation."
        );
        return responses.get(new Random().nextInt(responses.size()));
    }

    private String getGreetingResponse(String sessionStatus) {
        if ("WAITING".equals(sessionStatus)) {
            return "Hi there! 👋 Welcome to Safe Space. A counselor will be with you shortly. In the meantime, feel free to share what's on your mind — everything here is anonymous and confidential. 💚";
        }
        return "Hi! 👋 Your counselor has stepped away briefly, but they'll be back soon. Feel free to share what's on your mind while you wait.";
    }

    private String getQuestionResponse(String sessionStatus) {
        if ("WAITING".equals(sessionStatus)) {
            return "That's a great question! A counselor will be with you shortly and will be able to give you a thorough answer. Feel free to share any additional details while you wait. 💚";
        }
        return "Good question! Your counselor has stepped away briefly but will be back to answer that soon. Your message has been saved for them. 🌿";
    }

    private String getContextualWelcome(String messageContent, String emotion, int energy) {
        StringBuilder sb = new StringBuilder();
        sb.append("Thank you for sharing that with us. ");

        // Add emotion-aware acknowledgment
        if (!"Neutral".equals(emotion)) {
            sb.append(getEmotionAcknowledgment(emotion, energy));
            sb.append(" ");
        } else {
            sb.append("It takes courage to open up, and you've taken an important first step by being here. ");
        }

        sb.append("\n\nA counselor will be with you as soon as possible. ");
        sb.append("Everything you share here is completely anonymous and confidential. 💚");
        return sb.toString();
    }

    private String getContextualWaitingResponse(String messageContent, String emotion, int energy) {
        List<String> responses = List.of(
                "Thank you for sharing more. Your messages are being saved and a counselor will review everything when they join. You're not alone in this. 💚",
                "I appreciate you continuing to open up. A professional is being notified and will be with you soon. Everything you've shared will help them understand your situation better.",
                "Thank you for trusting us with this. Your counselor will see all your messages when they arrive. Keep sharing if it helps — we're here for you. 🌿",
                "Your words matter, and they're being heard. A counselor is on the way and will have the full context of everything you've shared. Hang in there. 💚"
        );
        return responses.get(new Random().nextInt(responses.size()));
    }

    // ── Emotion-Aware Response Builders ──

    private String getEmotionAcknowledgment(String emotion, int energy) {
        return switch (emotion) {
            case "Anxious" -> energy >= 7
                    ? "I can sense you're feeling really anxious right now, and that takes a lot of courage to share. Take a slow breath — you're in a safe space."
                    : "Thank you for reaching out. Feeling anxious can be overwhelming, but you've taken an important step by being here.";
            case "Sad" -> energy >= 7
                    ? "I hear that you're going through a really tough time. It's okay to feel sad — your feelings are completely valid."
                    : "Thank you for sharing. It's okay to feel down sometimes, and I'm glad you chose to reach out.";
            case "Angry" -> energy >= 7
                    ? "I can tell you're feeling really frustrated right now. That's completely understandable, and it's good that you're expressing it here."
                    : "Thank you for being here. It takes courage to talk about what's bothering you.";
            case "Lonely" -> energy >= 7
                    ? "Loneliness can feel so heavy, especially when it feels like no one understands. But you're not alone right now — you're here, and someone cares."
                    : "I'm glad you reached out. Feeling lonely is more common than you might think, and talking about it is the first step.";
            case "Frustrated" -> energy >= 7
                    ? "I hear your frustration, and it's completely valid. Sometimes things pile up and it all feels like too much."
                    : "It sounds like things have been challenging. Thank you for reaching out — let's work through this together.";
            case "Happy" -> "That's wonderful to hear! I'm glad you're in a good space. A counselor will be happy to chat with you.";
            case "Relieved" -> "I'm glad you're feeling some relief. A counselor will be with you shortly if you'd like to talk more.";
            default -> "Thank you for reaching out. You've taken a brave step, and someone will be with you shortly.";
        };
    }

    private String getWaitingResponse(String emotion, int energy) {
        List<String> responses;

        if (energy >= 7) {
            responses = List.of(
                    "I hear you. Your feelings are valid, and a counselor is being notified right now. Please stay with us. 💚",
                    "Thank you for continuing to share. You're being incredibly brave. A professional will join very soon.",
                    "I'm still here with you. A counselor has been alerted and will prioritize connecting with you.",
                    "Your messages are being received. Someone who can help is on their way. You are not alone in this."
            );
        } else {
            responses = List.of(
                    "Thank you for sharing. A counselor will be available soon. Everything you share here stays confidential. 💚",
                    "I'm here with you while we wait. A professional will join your conversation shortly.",
                    "Your message has been received. A counselor is on the way — in the meantime, feel free to share as much as you'd like.",
                    "Thank you for your patience. A professional will be with you soon. This is a safe space for you. 🌿"
            );
        }

        return responses.get(new Random().nextInt(responses.size()));
    }

    private String getOfflineResponse(String emotion, int energy) {
        List<String> responses;

        if (energy >= 7) {
            responses = List.of(
                    "Your counselor has momentarily stepped away. Your message has been saved, and they will see it as soon as they return. You are not forgotten. 💚",
                    "It looks like your counselor is briefly unavailable, but your message is important and has been recorded. They'll respond as soon as possible.",
                    "Your counselor will be right back. In the meantime, please know that everything you've shared is safe and will be reviewed. You matter. 🌿"
            );
        } else {
            responses = List.of(
                    "Your counselor is briefly away. Your message has been saved, and they'll respond when they return. Thank you for your patience. 💚",
                    "It seems your counselor has stepped away momentarily. Don't worry — your message is safe and they'll follow up soon.",
                    "Your counselor will return shortly. Feel free to keep sharing — everything is saved for when they're back. 🌿"
            );
        }

        return responses.get(new Random().nextInt(responses.size()));
    }

    // ── Result Record ──

    /**
     * Encapsulates a fallback response with metadata.
     */
    public record FallbackResult(
            String message,
            String responseType,
            boolean crisisDetected,
            String emotionTag,
            int energyScore
    ) {}
}
