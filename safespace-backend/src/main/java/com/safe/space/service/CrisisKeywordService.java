package com.safe.space.service;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Scans post content for crisis-related keywords across three languages:
 * English, Tagalog, and Bisaya.
 *
 * Expanded to comprehensively capture multi-dialect student venting
 * (Bisaya/Cebuano, Tagalog/Filipino, and English).
 */
@Service
public class CrisisKeywordService {

    public record KeywordMatch(String language, String category, String phrase) {}

    private static final Map<String, Map<String, List<String>>> KEYWORDS = new LinkedHashMap<>();

    // Common harmless idioms using "mamatay" (e.g. laughing to death / dying of laughter)
    private static final List<String> SAFE_IDIOMS = List.of(
            "mamatay sa katawa", "mamatay kog katawa", "mamatay ku ug katawa",
            "mamatay ko sa katawa", "mamatay ku sa katawa", "mamatay sa tawa",
            "mamatay sa kilig", "mamatay ko sa kilig"
    );

    static {
        // ── English ──
        Map<String, List<String>> english = new LinkedHashMap<>();
        english.put("explicit", List.of(
                "suicide", "suicidal", "want to die", "i want to die",
                "kill myself", "i will kill myself", "i'm going to kill myself",
                "end my life", "i want to end my life", "end it all", "want to end it all",
                "i can't go on", "can't go on",
                "i don't want to live", "i don't want to live anymore", "don't want to live",
                "i'm done with life", "done with life", "i want to die by suicide",
                "thinking about suicide", "i want to die today",
                "i'm going to end my life",
                "better off dead", "better off without me",
                "tired of living", "tired of life", "no reason to live",
                "wish i was dead", "wish i were dead", "wish i was never born",
                "don't want to wake up", "hope i don't wake up", "done with everything"
        ));
        english.put("selfharm", List.of(
                "hurt myself", "cut myself", "cutting myself",
                "slit my wrists", "burn myself",
                "self-harm", "self harm", "overdose",
                "i will overdose", "i want to overdose",
                "poison myself", "hang myself", "shoot myself",
                "jump off a bridge", "jump off a building", "pull the trigger"
        ));
        KEYWORDS.put("english", english);

        // ── Tagalog ──
        Map<String, List<String>> tagalog = new LinkedHashMap<>();
        tagalog.put("explicit", List.of(
                "mamatay",
                "magpakamatay", "magpapakamatay", "magpapatiwakal",
                "magpapakamatay na ako", "magpakamatay na lang",
                "gusto kong mamatay", "gusto kong mamatay na",
                "gusto ko mamatay", "gusto ko na mamatay", "gusto ko nang mamatay",
                "mamatay na lang ako", "mamatay na sana ako", "sana mamatay na ako", "sana mamatay na lang",
                "patayin ko ang sarili ko", "patayin ang sarili", "patayin ang sarili ko",
                "tatapusin ko na ang buhay ko", "tapos na ako",
                "ayaw ko nang mabuhay", "ayaw ko na mabuhay", "ayoko na mabuhay", "ayoko na mabuhay pa",
                "wala na akong dahilan mabuhay", "wala na akong silbi", "pabigat lang ako",
                "gusto ko nang mawala", "gusto ko na mawala", "sana mawala na lang ako",
                "sana hindi na ako magising", "sana di na ako magising",
                "sana kunin na ako", "sana kunin na ako ni lord",
                "pagod na ako mabuhay", "pagod na akong mabuhay", "pagod na pagod na ako sa buhay"
        ));
        tagalog.put("selfharm", List.of(
                "sasaktan ko ang sarili ko", "sisaktan ko ang sarili ko",
                "mag-o-overdose ako", "mag-overdose ako", "mag-overdose",
                "susubukan kong magpakamatay",
                "magbigti", "magbibigti", "magbibigti ako", "magbigti na lang",
                "maglaslas", "maglalaslas", "laslas", "hiwain ang pulso", "hihiwain ko sarili ko",
                "tatalon ako sa tulay", "tatalon sa building", "magpapasagasa",
                "iinom ng lason", "inom ng lason", "lasunin ang sarili"
        ));
        KEYWORDS.put("tagalog", tagalog);

        // ── Bisaya ──
        Map<String, List<String>> bisaya = new LinkedHashMap<>();
        bisaya.put("explicit", List.of(
                "mamatay",
                "gusto ko mamatay", "gusto ku mamatay",
                "gusto nako mamatay", "gusto naku mamatay",
                "gusto na ko mamatay", "gusto na ku mamatay",
                "gusto nako mamatay na", "gusto naku mamatay na",
                "mamatay na ko", "mamatay na ku", "mamatay nako", "mamatay naku",
                "mamatay na lang ko", "mamatay na lang ku", "mamatay nlng ko", "mamatay nlng ku",
                "sana mamatay na ko", "sana mamatay na ku",
                "hikog", "maghikog", "maghikog ko", "maghikog ku", "maghikog nako", "maghikog naku",
                "maghikog na lang ko", "maghikog nlng ko", "ihikog", "naghikog",
                "magpakamatay ko", "magpakamatay ku", "magpakamatay na ko", "magpakamatay nako", "magpakamatay naku",
                "patyon nako ang akong kaugalingon", "patyon naku ang akong kaugalingon",
                "patyon nako akong kaugalingon", "patyon naku akong kaugalingon", "patyon naku akung kaugalingon",
                "patayon nako ang akong kaugalingon", "mopatay sa akong kaugalingon",
                "dili na ko gusto mabuhi", "di na ko gusto mabuhi", "di na ku ganahan mabuhi", "dili na ku ganahan mabuhi",
                "dili na nako kaya", "di na naku kaya", "di na nako makaya",
                "gikapoy na ko mabuhi", "kapoy na mabuhi", "gikapoy nako sa kinabuhi", "gikapoy naku sa kinabuhi",
                "wala na koy rason mabuhi", "wa na koy rason mabuhi", "wala na koy pulos", "wa na koy pulos",
                "wala nay gamit akong kinabuhi", "wa nay gamit akung kinabuhi",
                "gusto nako mawala", "gusto naku mawala", "gusto ko mawala", "gusto ku mawala"
        ));
        bisaya.put("selfharm", List.of(
                "mag-overdose ko", "mag-overdose nako", "mag-overdose naku",
                "maglaslas", "maglaslas ko", "maglaslas nako", "maglaslas naku", "laslas", "laslas pulso",
                "ambak sa tulay", "muambak sa tulay", "moambak sa tulay", "moambak sa building", "muambak ko",
                "iinom ug lason", "inom lason",
                "hikog", "maghikog", "magpakamatay"
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
                    if (!normalizedPhrase.isEmpty()) {
                        if (normalized.matches(".*\\b" + Pattern.quote(normalizedPhrase) + "\\b.*")) {
                            matches.add(new KeywordMatch(lang, category, phrase));
                        }
                    }
                }
            }
        }

        // If the only matches are generic "mamatay", check if it was used in an explicit safe idiom
        // like "mamatay sa katawa" (dying of laughter)
        if (!matches.isEmpty()) {
            boolean allMamatayOnly = matches.stream().allMatch(m -> "mamatay".equalsIgnoreCase(m.phrase()));
            if (allMamatayOnly) {
                for (String idiom : SAFE_IDIOMS) {
                    if (normalized.contains(idiom)) {
                        return Collections.emptyList();
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
     * Determine severity based on matched categories:
     * - explicit suicidal ideation / lethal self-harm → "critical"
     * - non-lethal self-harm / physical injury → "high"
     * - otherwise → "medium"
     */
    public String determineSeverity(List<KeywordMatch> matches) {
        if (matches == null || matches.isEmpty()) {
            return "medium";
        }

        // 1. Critical: Explicit suicidal ideation or lethal self-harm statements
        boolean hasCritical = matches.stream().anyMatch(m -> {
            if ("explicit".equalsIgnoreCase(m.category())) {
                return true;
            }
            if ("selfharm".equalsIgnoreCase(m.category())) {
                String phrase = m.phrase().toLowerCase();
                return phrase.contains("overdose")
                        || phrase.contains("slit")
                        || phrase.contains("poison")
                        || phrase.contains("hang")
                        || phrase.contains("shoot")
                        || phrase.contains("magpakamatay")
                        || phrase.contains("magpapatiwakal")
                        || phrase.contains("patayin")
                        || phrase.contains("patyon")
                        || phrase.contains("mopatay")
                        || phrase.contains("hikog")
                        || phrase.contains("bigti")
                        || phrase.contains("ambak")
                        || phrase.contains("lason");
            }
            return false;
        });

        if (hasCritical) {
            return "critical";
        }

        // 2. High: Non-lethal self-injury or physical self-harm expressions
        boolean hasHigh = matches.stream()
                .anyMatch(m -> "selfharm".equalsIgnoreCase(m.category()));
        if (hasHigh) {
            return "high";
        }

        return "medium";
    }
}
