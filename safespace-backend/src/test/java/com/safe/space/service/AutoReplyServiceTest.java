package com.safe.space.service;

import com.safe.space.dto.AutoReplyRequest;
import com.safe.space.dto.AutoReplyResponse;
import com.safe.space.repository.AutoReplyLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;

import static org.junit.jupiter.api.Assertions.*;

class AutoReplyServiceTest {

    private AutoReplyService autoReplyService;

    @BeforeEach
    void setUp() {
        CrisisKeywordService crisisKeywordService = new CrisisKeywordService();
        AutoReplyLogRepository autoReplyLogRepository = (AutoReplyLogRepository) Proxy.newProxyInstance(
                AutoReplyLogRepository.class.getClassLoader(),
                new Class<?>[]{AutoReplyLogRepository.class},
                (proxy, method, args) -> null
        );
        autoReplyService = new AutoReplyService(crisisKeywordService, autoReplyLogRepository);
    }

    @Test
    @DisplayName("Should reply with empathetic uncertainty response for 'i don't know' even with Happy tag and low energy")
    void testIDontKnowWithHappyTagAndLowEnergy() {
        String reply = autoReplyService.generateReply("Happy", 1, "i don't know");
        assertNotNull(reply);
        assertTrue(reply.contains("okay not to know") || reply.contains("hard to put into words"),
                "Reply should validate uncertainty instead of blindly celebrating: " + reply);
        assertFalse(reply.contains("celebrate this moment"),
                "Reply must not contain celebrate message: " + reply);
    }

    @Test
    @DisplayName("Should detect uncertainty for 'not sure' and 'idk'")
    void testUncertaintyVariations() {
        String reply1 = autoReplyService.generateReply("Neutral", 2, "not sure how I feel");
        assertTrue(reply1.contains("okay not to know"));

        String reply2 = autoReplyService.generateReply("Sad", 3, "idk what to do anymore");
        assertTrue(reply2.contains("okay not to know"));
    }

    @Test
    @DisplayName("Should ground low energy Happy posts without celebration")
    void testLowEnergyHappyCalibrated() {
        String reply = autoReplyService.generateReply("Happy", 1, "just sitting quietly");
        assertFalse(reply.contains("celebrate this moment"));
        assertTrue(reply.contains("checking in") || reply.contains("quiet"));
    }

    @Test
    @DisplayName("Should handle emotional discordance when tag is Happy but text is tired/sad")
    void testDiscordantHappyWithTiredText() {
        String reply = autoReplyService.generateReply("Happy", 2, "feeling so tired and drained");
        // Should match overwhelm or discordance, never celebration
        assertFalse(reply.contains("celebrate this moment"));
    }

    @Test
    @DisplayName("Should handle full structured reply for uncertainty theme")
    void testFullReplyForUncertainty() {
        AutoReplyRequest request = AutoReplyRequest.builder()
                .emotionTag("Happy")
                .energyScore(1)
                .content("i don't know")
                .build();

        AutoReplyResponse response = autoReplyService.generateFullReply(request, false);
        assertNotNull(response);
        assertEquals("THEME_UNCERTAINTY", response.getRuleMatched());
        assertTrue(response.getMessage().contains("okay not to know"));
    }
}
