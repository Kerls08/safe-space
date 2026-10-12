package com.safe.space.service;

import com.safe.space.model.ChatSession;
import com.safe.space.repository.ChatMessageRepository;
import com.safe.space.repository.ChatSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AnonymousChatServiceDeleteTest {

    @Mock private ChatSessionRepository sessionRepository;
    @Mock private ChatMessageRepository messageRepository;
    @Mock private CrisisKeywordService crisisKeywordService;
    @Mock private FallbackResponseService fallbackResponseService;
    @Mock private org.springframework.beans.factory.ObjectProvider<CrisisAlertService> crisisAlertServiceProvider;

    private AnonymousChatService chatService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        chatService = new AnonymousChatService(
                sessionRepository,
                messageRepository,
                crisisKeywordService,
                fallbackResponseService,
                crisisAlertServiceProvider
        );
    }

    @Test
    @DisplayName("Student owner can delete their own session by matching username")
    void testStudentOwnerDeleteByUsername() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-123")
                .studentUserId("student")
                .studentPseudonym("Gentle-Turtle-12")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-123")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-123", "student", "2024-STU-001", "STUDENT", null));
        verify(messageRepository, times(1)).deleteBySessionId("chat-123");
        verify(sessionRepository, times(1)).delete(session);
    }

    @Test
    @DisplayName("Student can delete session by matching pseudonym even if studentUserId differs")
    void testStudentDeleteByPseudonym() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-123")
                .studentUserId("other-student")
                .studentPseudonym("SoftSky-2342")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-123")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-123", "7777777777", "7777777777", "STUDENT", "SoftSky-2342"));
        verify(messageRepository, times(1)).deleteBySessionId("chat-123");
        verify(sessionRepository, times(1)).delete(session);
    }

    @Test
    @DisplayName("Student can delete crisis outreach invitation (INVITED status)")
    void testStudentDeleteOutreachInvite() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-outreach-1")
                .studentUserId("student")
                .studentPseudonym("SoftSky-2342")
                .professionalId("psychometrician")
                .professionalName("Lead Psychometrician")
                .status("INVITED")
                .build();

        when(sessionRepository.findBySessionId("chat-outreach-1")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-outreach-1", "7777777777", "7777777777", "STUDENT", null));
        verify(messageRepository, times(1)).deleteBySessionId("chat-outreach-1");
        verify(sessionRepository, times(1)).delete(session);
    }

    @Test
    @DisplayName("Assigned professional or admin/maintenance can delete session")
    void testStaffDeleteSession() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-999")
                .studentUserId("student")
                .professionalId("psychologist")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-999")).thenReturn(Optional.of(session));

        // Assigned professional
        assertDoesNotThrow(() -> chatService.deleteSession("chat-999", "psychologist", null, "PROFESSIONAL", null));

        // Admin / Maintenance
        assertDoesNotThrow(() -> chatService.deleteSession("chat-999", "maintenance", null, "MAINTENANCE", null));
        assertDoesNotThrow(() -> chatService.deleteSession("chat-999", "psychometrician", null, "SUPER_ADMIN", null));
    }

    @Test
    @DisplayName("Unauthorized stranger student cannot delete an ACTIVE conversation of someone else without pseudonym")
    void testUnauthorizedStudentBlockedFromActiveConversation() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-secret")
                .studentUserId("student-alice")
                .studentPseudonym("SecretFox-11")
                .professionalId("psychologist")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-secret")).thenReturn(Optional.of(session));

        SecurityException ex = assertThrows(SecurityException.class, () ->
                chatService.deleteSession("chat-secret", "stranger-bob", "2024-BOB-999", "STUDENT", "WrongPseudonym")
        );
        assertTrue(ex.getMessage().contains("permission"));
        verify(sessionRepository, never()).delete(session);
    }

    @Test
    @DisplayName("Decline invite updates linked crisis alert with DECLINED outreachStatus")
    void testDeclineInviteUpdatesLinkedAlert() {
        CrisisAlertService mockAlertService = mock(CrisisAlertService.class);
        when(crisisAlertServiceProvider.getIfAvailable()).thenReturn(mockAlertService);

        ChatSession session = ChatSession.builder()
                .sessionId("chat-inv-1")
                .studentUserId("student-1")
                .studentPseudonym("SoftSparrow-99")
                .professionalId("counselor")
                .status("INVITED")
                .build();

        when(sessionRepository.findBySessionId("chat-inv-1")).thenReturn(Optional.of(session));

        chatService.declineInvite("chat-inv-1", "student-1");

        assertEquals("DECLINED", session.getStatus());
        verify(mockAlertService, times(1)).updateAlertOutreachStatus(
                eq("chat-inv-1"),
                eq("DECLINED"),
                contains("vent only")
        );
    }
}

