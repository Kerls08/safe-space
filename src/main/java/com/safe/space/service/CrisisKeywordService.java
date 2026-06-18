package com.safe.space.service;

import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Scans post content for crisis-related keywords across three languages:
 * English, Tagalog, and Bisaya.
 *
 * Mirrors the keyword set used in the Cloud Functions (keywords.json)
 * so that the Spring Boot backend produces identical flagging results.
 */
@Service
public class CrisisKeywordService {

    public record KeywordMatch(String language, String category, String phrase) {}

    private static final Map<String, Map<String, List<String>>> KEYWORDS = new LinkedHashMap<>();

    static {
        // ── English ──
        Map<String, List<String>> english = new LinkedHashMap<>();
        english.put("explicit", List.of(
                "suicide", "suicidal", "want to die", "i want to die",
                "kill myself", "i will kill myself", "i'm going to kill myself",
                "end my life", "i want to end my life",
                "i can't go on", "can't go on",
                "i don't want to live", "i don't want to live anymore",
                "i'm done with life", "i want to die by suicide",
                "thinking about suicide", "i want to die today",
                "i'm going to end my life"
        ));
        english.put("selfharm", List.of(
                "hurt myself", "cut myself", "cutting myself",
                "slit my wrists", "burn myself",
                "self-harm", "self harm", "overdose",
                "i will overdose", "i want to overdose",
                "poison myself", "hang myself", "shoot myself"
        ));
        KEYWORDS.put("english", english);

        // ── Tagalog ──
        Map<String, List<String>> tagalog = new LinkedHashMap<>();
        tagalog.put("explicit", List.of(
                "magpakamatay", "magpapakamatay", "magpapatiwakal",
                "gusto kong mamatay", "gusto kong mamatay na",
                "gusto ko mamatay",
                "patayin ko ang sarili ko", "patayin ang sarili",
                "tatapusin ko na ang buhay ko", "tapos na ako",
                "ayaw ko nang mabuhay",
                "wala na akong dahilan mabuhay", "wala na akong silbi"
        ));
        tagalog.put("selfharm", List.of(
                "sasaktan ko ang sarili ko", "sisaktan ko ang sarili ko",
                "mag-o-overdose ako", "magpapakamatay na ako",
                "magpapatiwakal na ako", "mag-overdose ako",
                "susubukan kong magpakamatay", "patayin ang sarili ko"
        ));
        KEYWORDS.put("tagalog", tagalog);

        // ── Bisaya ──
        Map<String, List<String>> bisaya = new LinkedHashMap<>();
        bisaya.put("explicit", List.of(
                "gusto ko mamatay", "gusto nako mamatay",
                "magpakamatay ko", "mamatay na ko",
                "patyon nako ang akong kaugalingon",
                "patayon nako ang akong kaugalingon",
                "dili na ko gusto mabuhi",
                "wala na koy rason mabuhi", "wala na koy pulos"
        ));
        bisaya.put("selfharm", List.of(
                "mag-overdose ko", "mag-overdose nako",
                "magpakamatay na ko",
                "patyon nako ang akong kaugalingon",
                "gusto ko mopatay sa akong kaugalingon"
        ));
        KEYWORDS.put("bisaya", bisaya);
    }

    /**
     * Normalize text: lowercase, strip non-alphanumeric (keep spaces and apostrophes),
     * collapse whitespace.
     */
    private String normalize(String text) {
        if (text == null || text.isBlank()) return "";
        return text.toLowerCase()
                .replaceAll("[^a-z0-9\\s']", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /**
     * Scan the given text and return all matched crisis keywords.
     */
    public List<KeywordMatch> scan(String text) {
        List<KeywordMatch> matches = new ArrayList<>();
        String normalized = normalize(text);
        if (normalized.isEmpty()) return matches;

        for (var langEntry : KEYWORDS.entrySet()) {
            String lang = langEntry.getKey();
            for (var catEntry : langEntry.getValue().entrySet()) {
                String category = catEntry.getKey();
                for (String phrase : catEntry.getValue()) {
                    String normalizedPhrase = normalize(phrase);
                    if (!normalizedPhrase.isEmpty() && normalized.contains(normalizedPhrase)) {
                        matches.add(new KeywordMatch(lang, category, phrase));
                    }
                }
            }
        }

        return matches;
    }

    /**
     * Quick check: does the text contain any crisis keyword?
     */
    public boolean isCrisis(String text) {
        return !scan(text).isEmpty();
    }

    /**
     * Determine severity based on matched categories.
     * explicit / selfharm → "high", otherwise → "medium".
     */
    public String determineSeverity(List<KeywordMatch> matches) {
        boolean hasHighSeverity = matches.stream()
                .anyMatch(m -> "explicit".equals(m.category()) || "selfharm".equals(m.category()));
        return hasHighSeverity ? "high" : "medium";
    }
}
