package com.safe.space.service;

import com.safe.space.dto.ChatSessionResponse;
import com.safe.space.model.ChatSession;
import com.safe.space.model.CrisisAlert;
import com.safe.space.repository.ChatSessionRepository;
import com.safe.space.repository.CrisisAlertRepository;
import com.safe.space.repository.PostRepository;
import com.safe.space.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CrisisAlertServiceTest {

    @Mock private CrisisAlertRepository alertRepository;
    @Mock private AnonymousChatService chatService;
    @Mock private ChatSessionRepository sessionRepository;
    @Mock private PostRepository postRepository;
    @Mock private EmailService emailService;
    @Mock private UserRepository userRepository;

    private CrisisAlertService alertService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        alertService = new CrisisAlertService(
                alertRepository,
                chatService,
                sessionRepository,
                postRepository,
                emailService,
                userRepository
        );
    }

    @Test
    @DisplayName("getInProgressAlerts returns only ACKNOWLEDGED alerts prioritized newest first")
    void testGetInProgressAlerts() {
        CrisisAlert alert1 = CrisisAlert.builder()
                .alertId("alt-001")
                .alertType("CRISIS_POST")
                .severity("CRITICAL")
                .status("ACKNOWLEDGED")
                .outreachStatus("DECLINED")
                .title("Urgent alert")
                .message("Test message")
                .pseudonym("Gentle-Sparrow-01")
                .createdAt(LocalDateTime.now().minusMinutes(10))
                .build();

        CrisisAlert alert2 = CrisisAlert.builder()
                .alertId("alt-002")
                .alertType("CRISIS_POST")
                .severity("HIGH")
                .status("ACKNOWLEDGED")
                .outreachStatus("INVITED")
                .title("Moderate alert")
                .message("Test message 2")
                .pseudonym("Calm-Breeze-02")
                .createdAt(LocalDateTime.now().minusMinutes(20))
                .build();

        when(alertRepository.findInProgressAlertsPrioritized()).thenReturn(List.of(alert1, alert2));

        List<Map<String, Object>> inProgress = alertService.getInProgressAlerts();
        assertEquals(2, inProgress.size());
        assertEquals("alt-001", inProgress.get(0).get("alertId"));
        assertEquals("ACKNOWLEDGED", inProgress.get(0).get("status"));
        assertEquals("DECLINED", inProgress.get(0).get("outreachStatus"));
        assertEquals("INVITED", inProgress.get(1).get("outreachStatus"));
        verify(alertRepository, times(1)).findInProgressAlertsPrioritized();
    }

    @Test
    @DisplayName("updateAlertOutreachStatus updates outreachStatus and appends resolutionNotes when linked alert exists")
    void testUpdateAlertOutreachStatusFound() {
        CrisisAlert alert = CrisisAlert.builder()
                .alertId("alt-100")
                .chatSessionId("session-xyz")
                .status("ACKNOWLEDGED")
                .outreachStatus("INVITED")
                .resolutionNotes("Initial outreach note.")
                .build();

        when(alertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc("session-xyz"))
                .thenReturn(Optional.of(alert));

        alertService.updateAlertOutreachStatus("session-xyz", "DECLINED", "Student declined counseling outreach (prefers to vent only).");

        assertEquals("DECLINED", alert.getOutreachStatus());
        assertTrue(alert.getResolutionNotes().contains("Student declined counseling outreach"));
        verify(alertRepository, times(1)).save(alert);
    }

    @Test
    @DisplayName("updateAlertOutreachStatus gracefully handles non-existent linked alert")
    void testUpdateAlertOutreachStatusNotFound() {
        when(alertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc("non-existent"))
                .thenReturn(Optional.empty());

        assertDoesNotThrow(() ->
                alertService.updateAlertOutreachStatus("non-existent", "DECLINED", "Notes")
        );
        verify(alertRepository, never()).save(any());
    }

    @Test
    @DisplayName("getAlertStats includes inProgress count matching acknowledged alerts")
    void testGetAlertStatsIncludesInProgress() {
        when(alertRepository.count()).thenReturn(10L);
        when(alertRepository.countByStatus("ACTIVE")).thenReturn(3L);
        when(alertRepository.countByStatus("ACKNOWLEDGED")).thenReturn(4L);
        when(alertRepository.countByStatus("RESOLVED")).thenReturn(2L);
        when(alertRepository.countByStatus("ESCALATED")).thenReturn(1L);
        when(alertRepository.countActiveBySeverity()).thenReturn(Collections.emptyList());
        when(alertRepository.countActiveByType()).thenReturn(Collections.emptyList());
        when(alertRepository.countSince(any())).thenReturn(0L);
        when(alertRepository.countCriticalSince(any())).thenReturn(0L);

        Map<String, Object> stats = alertService.getAlertStats();
        assertEquals(3L, stats.get("active"));
        assertEquals(4L, stats.get("acknowledged"));
        assertEquals(4L, stats.get("inProgress"));
        assertEquals(2L, stats.get("resolved"));
        assertEquals(1L, stats.get("escalated"));
    }

    @Test
    @DisplayName("initiateChatFromAlert creates outreach invitation, links chatSessionId, and sets outreachStatus to INVITED")
    void testInitiateChatFromAlertNewInvitation() {
        CrisisAlert alert = CrisisAlert.builder()
                .alertId("alt-200")
                .status("ACTIVE")
                .pseudonym("Quiet-River-88")
                .title("Distress reported")
                .emotionTag("ANXIOUS")
                .energyScore(7)
                .build();

        when(alertRepository.findByAlertId("alt-200")).thenReturn(Optional.of(alert));
        when(sessionRepository.findOpenSessionsForStudent(any(), eq("Quiet-River-88"))).thenReturn(Collections.emptyList());

        ChatSessionResponse mockResponse = ChatSessionResponse.builder()
                .sessionId("chat-session-new")
                .studentPseudonym("Quiet-River-88")
                .status("INVITED")
                .build();

        when(chatService.createOutreachInvite(
                any(), eq("Quiet-River-88"), anyString(), eq("ANXIOUS"), eq(7), eq("counselor1"), eq("Counselor One")))
                .thenReturn(mockResponse);

        Map<String, Object> result = alertService.initiateChatFromAlert("alt-200", "counselor1", "Counselor One");

        assertEquals("invite_sent", result.get("status"));
        assertEquals("chat-session-new", result.get("sessionId"));
        assertEquals("chat-session-new", alert.getChatSessionId());
        assertEquals("INVITED", alert.getOutreachStatus());
        assertEquals("ACKNOWLEDGED", alert.getStatus());
        assertEquals("counselor1", alert.getAcknowledgedBy());
        verify(alertRepository, times(1)).save(alert);
    }

    @Test
    @DisplayName("resolveAlert closes alert as RESOLVED and records resolutionNotes")
    void testResolveAlertSuccess() {
        CrisisAlert alert = CrisisAlert.builder()
                .alertId("alt-300")
                .status("ACKNOWLEDGED")
                .outreachStatus("DECLINED")
                .build();

        when(alertRepository.findByAlertId("alt-300")).thenReturn(Optional.of(alert));
        when(alertRepository.save(any(CrisisAlert.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CrisisAlert resolved = alertService.resolveAlert(
                "alt-300",
                "counselor1",
                "Student exercised autonomy to vent only (outreach declined). Verified safe to monitor."
        );

        assertEquals("RESOLVED", resolved.getStatus());
        assertEquals("counselor1", resolved.getResolvedBy());
        assertNotNull(resolved.getResolvedAt());
        assertTrue(resolved.getResolutionNotes().contains("autonomy to vent only"));
        verify(alertRepository, times(1)).save(alert);
    }
}
