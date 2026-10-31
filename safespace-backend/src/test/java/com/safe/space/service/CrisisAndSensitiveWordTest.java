package com.safe.space.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CrisisAndSensitiveWordTest {

    private CrisisKeywordService crisisKeywordService;
    private SensitiveWordService sensitiveWordService;

    @BeforeEach
    void setUp() {
        crisisKeywordService = new CrisisKeywordService();
        sensitiveWordService = new SensitiveWordService(crisisKeywordService);
    }

    @Test
    @DisplayName("Detects Bisaya suicidal phrases with 'naku' and 'nako' variations")
    void testBisayaCrisisVariations() {
        // The user's exact case from the photo
        assertTrue(crisisKeywordService.isCrisis("gusto naku mamatay"));
        assertTrue(crisisKeywordService.isCrisis("gusto nako mamatay"));
        assertTrue(crisisKeywordService.isCrisis("gusto ku mamatay"));
        assertTrue(crisisKeywordService.isCrisis("gusto ko mamatay"));
        assertTrue(crisisKeywordService.isCrisis("mamatay nlng ko"));
        assertTrue(crisisKeywordService.isCrisis("mamatay naku"));
        assertTrue(crisisKeywordService.isCrisis("mamatay"));

        List<CrisisKeywordService.KeywordMatch> matches = crisisKeywordService.scan("gusto naku mamatay");
        assertFalse(matches.isEmpty());
        assertEquals("critical", crisisKeywordService.determineSeverity(matches));
    }

    @Test
    @DisplayName("Detects Bisaya suicide term 'hikog' and lethal self-harm")
    void testBisayaHikogAndLethal() {
        assertTrue(crisisKeywordService.isCrisis("maghikog naku"));
        assertTrue(crisisKeywordService.isCrisis("maghikog ko"));
        assertTrue(crisisKeywordService.isCrisis("hikog"));
        assertTrue(crisisKeywordService.isCrisis("patyon naku akong kaugalingon"));
        assertTrue(crisisKeywordService.isCrisis("muambak ko sa tulay"));

        List<CrisisKeywordService.KeywordMatch> matches = crisisKeywordService.scan("maghikog naku");
        assertEquals("critical", crisisKeywordService.determineSeverity(matches));
    }

    @Test
    @DisplayName("Detects Tagalog crisis phrases including 'gusto ko na mamatay' and 'magbigti'")
    void testTagalogCrisis() {
        assertTrue(crisisKeywordService.isCrisis("gusto ko na mamatay"));
        assertTrue(crisisKeywordService.isCrisis("gusto ko nang mamatay"));
        assertTrue(crisisKeywordService.isCrisis("sana mamatay na ako"));
        assertTrue(crisisKeywordService.isCrisis("magbibigti ako"));
        assertTrue(crisisKeywordService.isCrisis("magpakamatay na ako"));

        List<CrisisKeywordService.KeywordMatch> matches = crisisKeywordService.scan("gusto ko na mamatay");
        assertFalse(matches.isEmpty());
        assertEquals("critical", crisisKeywordService.determineSeverity(matches));
    }

    @Test
    @DisplayName("Ignores harmless idioms with mamatay (e.g. laughing to death)")
    void testSafeIdioms() {
        assertFalse(crisisKeywordService.isCrisis("mamatay ko sa katawa"));
        assertFalse(crisisKeywordService.isCrisis("mamatay sa katawa"));
        assertFalse(crisisKeywordService.isCrisis("mamatay sa tawa"));
        assertFalse(crisisKeywordService.isCrisis("mamatay sa kilig"));
    }

    @Test
    @DisplayName("SensitiveWordService classifies crisis correctly and flags for counselor review")
    void testSensitiveWordCrisis() {
        SensitiveWordService.ScanResult result = sensitiveWordService.scan("gusto naku mamatay");
        assertTrue(result.blocked());
        assertTrue(result.hasCrisis());
        assertFalse(result.hasProfanity());
        assertEquals("critical", result.severity());
        assertTrue(result.detectedWords().contains("mamatay"));
    }

    @Test
    @DisplayName("SensitiveWordService detects Bisaya street profanities requested by user")
    void testBisayaStreetProfanity() {
        assertTrue(sensitiveWordService.scan("esmeringhoy").hasProfanity());
        assertTrue(sensitiveWordService.scan("esmiringhoy").hasProfanity());
        assertTrue(sensitiveWordService.scan("esmiringkokiks").hasProfanity());
        assertTrue(sensitiveWordService.scan("esmeringkokes").hasProfanity());

        assertTrue(sensitiveWordService.scan("yawa ka").hasProfanity());
        assertTrue(sensitiveWordService.scan("ywa man ni").hasProfanity());
        assertTrue(sensitiveWordService.scan("yw").hasProfanity());
        assertTrue(sensitiveWordService.scan("boang ka").hasProfanity());
        assertTrue(sensitiveWordService.scan("buang man ka").hasProfanity());
        assertTrue(sensitiveWordService.scan("yua").hasProfanity());
    }

    @Test
    @DisplayName("Word boundary check prevents false positives on clean words like 'anyway'")
    void testBoundaryCheckNoFalsePositive() {
        SensitiveWordService.ScanResult result = sensitiveWordService.scan("Anyway, I had a tough day studying.");
        assertFalse(result.blocked());
        assertFalse(result.hasCrisis());
        assertFalse(result.hasProfanity());
    }

    @Test
    @DisplayName("Clean student vents are not blocked")
    void testCleanVents() {
        SensitiveWordService.ScanResult result = sensitiveWordService.scan("Kapoy kaayo ang exams pero laban lang.");
        assertFalse(result.blocked());
        assertFalse(result.hasCrisis());
        assertFalse(result.hasProfanity());
    }
}

