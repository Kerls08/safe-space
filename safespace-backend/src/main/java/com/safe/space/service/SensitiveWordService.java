package com.safe.space.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Unified Sensitive Word Filter.
 *
 * Treats BOTH crisis keywords AND profanity/hate-speech as "sensitive words."
 * Any post containing these words is BLOCKED from being published and made
 * visible to peers, following the ethical recommendation from the
 * psychometrician adviser.
 *
 * Rationale:
 * Showing phrases like "I want to die" on a public peer board can trigger
 * emotional contagion among vulnerable students. Instead of publishing these
 * posts, the system blocks them and silently generates a Crisis Alert
 * so professionals can reach out to the student privately.
 *
 * This service delegates to CrisisKeywordService for crisis-keyword detection
 * and adds its own profanity/hate-speech list on top.
 */
@Service
@RequiredArgsConstructor
public class SensitiveWordService {

    private final CrisisKeywordService crisisKeywordService;

    // ── Profanity & hate-speech words (English, Tagalog, Bisaya) ──
    private static final List<String> PROFANITY_WORDS = List.of(
            // English
            "fuck", "fucking", "fucker", "motherfucker",
            "shit", "bullshit", "bitch", "asshole", "cunt", "bastard", "dumbass", "jackass",
            "faggot", "retard", "nigger", "slut", "whore",

            // Tagalog
            "putangina", "tangina", "tang ina", "pota", "potangina", "tanginamo", "tangina mo",
            "gago", "gaga", "tarantado", "tarantada", "ulol", "bobo", "tanga", "inutil",
            "kupal", "pakyu", "pakshet", "punyeta", "leche", "lintik", "bwisit", "buwisit", "hinayupak", "hudas",
            "kantot", "kantutan", "pokpok", "bayag", "titi", "puke", "pepe",

            // Bisaya / Cebuano
            "esmeringhoy", "esmiringhoy", "esmiringkokiks", "esmeringkokes",
            "yawa", "ywa", "yw", "yua", "yawo", "yawaa", "kayawa", "giyawa", "pisting yawa",
            "boang", "buang", "bwang", "bwng", "boang-boang", "buang-buang",
            "pisti", "piste", "peste", "pisteha", "pisting",
            "giatay", "atay", "kayatay",
            "bilat", "burikat", "oten", "pukingkay", "bogo", "bugo"
    );

    /**
     * Result of a sensitive word scan.
     *
     * @param blocked       true if the content contains ANY sensitive word
     * @param hasCrisis     true if crisis keywords were detected
     * @param hasProfanity  true if profanity/hate-speech was detected
     * @param severity      crisis severity level (from CrisisKeywordService), or
     *                      "NONE"
     * @param detectedWords human-readable summary of what was detected
     */
    public record ScanResult(
            boolean blocked,
            boolean hasCrisis,
            boolean hasProfanity,
            String severity,
            String detectedWords) {
    }

    /**
     * Scan text for ALL sensitive words (crisis + profanity).
     * Returns a detailed result so the caller can generate the right alert.
     */
    public ScanResult scan(String text) {
        if (text == null || text.isBlank()) {
            return new ScanResult(false, false, false, "NONE", "");
        }

        // 1. Check crisis keywords via existing CrisisKeywordService
        List<CrisisKeywordService.KeywordMatch> crisisMatches = crisisKeywordService.scan(text);
        boolean hasCrisis = !crisisMatches.isEmpty();
        String severity = hasCrisis ? crisisKeywordService.determineSeverity(crisisMatches) : "NONE";

        List<String> detectedList = new ArrayList<>();
        if (hasCrisis) {
            for (CrisisKeywordService.KeywordMatch m : crisisMatches) {
                detectedList.add("[crisis/" + m.language() + "/" + m.category() + "] " + m.phrase());
            }
        }

        // 2. Check profanity/hate-speech
        boolean hasProfanity = false;
        String normalized = text.toLowerCase()
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();

        for (String word : PROFANITY_WORDS) {
            String normWord = word.toLowerCase()
                    .replaceAll("[^a-z0-9\\s]", " ")
                    .replaceAll("\\s+", " ")
                    .trim();
            if (!normWord.isEmpty() && normalized.matches(".*\\b" + Pattern.quote(normWord) + "\\b.*")) {
                hasProfanity = true;
                detectedList.add("[profanity] " + word);
            }
        }

        boolean blocked = hasCrisis || hasProfanity;
        String detectedWords = String.join("; ", detectedList);

        return new ScanResult(blocked, hasCrisis, hasProfanity, severity, detectedWords);
    }

    /**
     * Simple check: does the text contain any sensitive word?
     */
    public boolean containsSensitiveWords(String text) {
        return scan(text).blocked();
    }
}
