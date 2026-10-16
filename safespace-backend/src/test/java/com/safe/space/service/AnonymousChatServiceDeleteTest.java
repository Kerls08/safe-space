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
    @DisplayName("Student owner deletes session: hides from student but preserves for professional")
    void testStudentOwnerDeleteByUsername() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-123")
                .studentUserId("student")
                .studentPseudonym("Gentle-Turtle-12")
                .professionalId("counselor-1")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-123")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-123", "student", "2024-STU-001", "STUDENT", null));
        assertTrue(session.isDeletedByStudent());
        assertFalse(session.isDeletedByProfessional());
        verify(sessionRepository, times(1)).save(session);
        verify(sessionRepository, never()).delete(session);
    }

    @Test
    @DisplayName("Student delete by matching pseudonym hides from student view")
    void testStudentDeleteByPseudonym() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-123")
                .studentUserId("other-student")
                .studentPseudonym("SoftSky-2342")
                .professionalId("counselor-1")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-123")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-123", "7777777777", "7777777777", "STUDENT", "SoftSky-2342"));
        assertTrue(session.isDeletedByStudent());
        verify(sessionRepository, times(1)).save(session);
        verify(sessionRepository, never()).delete(session);
    }

    @Test
    @DisplayName("Professional delete hides from professional view without affecting student")
    void testProfessionalDeletePreservesStudentView() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-outreach-1")
                .studentUserId("student")
                .studentPseudonym("SoftSky-2342")
                .professionalId("psychometrician")
                .professionalName("Lead Psychometrician")
                .status("INVITED")
                .build();

        when(sessionRepository.findBySessionId("chat-outreach-1")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-outreach-1", "psychometrician", null, "PROFESSIONAL", null));
        assertTrue(session.isDeletedByProfessional(), "Must be marked deleted for professional");
        assertFalse(session.isDeletedByStudent(), "Must NOT be deleted for student");
        verify(sessionRepository, times(1)).save(session);
        verify(sessionRepository, never()).delete(session);
    }

    @Test
    @DisplayName("When both student and professional delete, session is permanently wiped")
    void testBothPartiesDeletePermanentlyWipesSession() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-both")
                .studentUserId("student")
                .professionalId("psychologist")
                .status("ACTIVE")
                .deletedByStudent(true) // Student already deleted
                .build();

        when(sessionRepository.findBySessionId("chat-both")).thenReturn(Optional.of(session));

        // Now professional also deletes
        assertDoesNotThrow(() -> chatService.deleteSession("chat-both", "psychologist", null, "PROFESSIONAL", null));
        verify(messageRepository, times(1)).deleteBySessionId("chat-both");
        verify(sessionRepository, times(1)).delete(session);
    }

    @Test
    @DisplayName("Admin or maintenance deletion permanently purges session")
    void testAdminMaintenanceHardDelete() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-999")
                .studentUserId("student")
                .professionalId("psychologist")
                .status("ACTIVE")
                .build();

        when(sessionRepository.findBySessionId("chat-999")).thenReturn(Optional.of(session));

        assertDoesNotThrow(() -> chatService.deleteSession("chat-999", "admin", null, "ADMIN", null));
        verify(messageRepository, times(1)).deleteBySessionId("chat-999");
        verify(sessionRepository, times(1)).delete(session);
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

    @Test
    @DisplayName("Accept invite creates unread system message and updates alert to ACTIVE")
    void testAcceptInviteCreatesUnreadSystemMessage() {
        CrisisAlertService mockAlertService = mock(CrisisAlertService.class);
        when(crisisAlertServiceProvider.getIfAvailable()).thenReturn(mockAlertService);

        ChatSession session = ChatSession.builder()
                .sessionId("chat-inv-accept")
                .studentUserId("student-1")
                .studentPseudonym("Gentle-Sparrow-42")
                .professionalId("counselor-1")
                .status("INVITED")
                .messageCount(1)
                .build();

        when(sessionRepository.findBySessionId("chat-inv-accept")).thenReturn(Optional.of(session));

        chatService.acceptInvite("chat-inv-accept", "student-1");

        assertEquals("ACTIVE", session.getStatus());
        assertEquals(2, session.getMessageCount());
        assertNotNull(session.getAcceptedAt());

        // Verify system message was created with read = false
        verify(messageRepository, times(1)).save(argThat(msg ->
                "system".equals(msg.getSenderType()) &&
                !msg.isRead() &&
                msg.getContent().contains("accepted the invitation")
        ));

        // Verify alert service was updated
        verify(mockAlertService, times(1)).updateAlertOutreachStatus(
                eq("chat-inv-accept"),
                eq("ACTIVE"),
                contains("accepted outreach")
        );
    }

    @Test
    @DisplayName("Student viewer must NOT mark outreach acceptance notification as read")
    void testStudentViewerDoesNotMarkAcceptNotificationAsRead() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-inv-2")
                .status("ACTIVE")
                .build();
        when(sessionRepository.findBySessionId("chat-inv-2")).thenReturn(Optional.of(session));

        com.safe.space.model.ChatMessage sysMsg = com.safe.space.model.ChatMessage.builder()
                .messageId("msg-sys-1")
                .sessionId("chat-inv-2")
                .senderType("system")
                .senderName("System")
                .content("Student accepted the invitation and joined the chat.")
                .read(false)
                .build();

        when(messageRepository.findBySessionIdOrderBySentAtAsc("chat-inv-2"))
                .thenReturn(java.util.List.of(sysMsg));

        // Student fetches messages
        var result = chatService.getMessages("chat-inv-2", "student");

        assertNotNull(result);
        assertFalse(sysMsg.isRead(), "System notification for professional must NOT be marked read by student");
        verify(messageRepository, never()).save(sysMsg);
    }

    @Test
    @DisplayName("Professional viewer marks outreach acceptance notification as read")
    void testProfessionalViewerMarksAcceptNotificationAsRead() {
        ChatSession session = ChatSession.builder()
                .sessionId("chat-inv-3")
                .status("ACTIVE")
                .build();
        when(sessionRepository.findBySessionId("chat-inv-3")).thenReturn(Optional.of(session));

        com.safe.space.model.ChatMessage sysMsg = com.safe.space.model.ChatMessage.builder()
                .messageId("msg-sys-2")
                .sessionId("chat-inv-3")
                .senderType("system")
                .senderName("System")
                .content("Student accepted the invitation and joined the chat.")
                .read(false)
                .build();

        when(messageRepository.findBySessionIdOrderBySentAtAsc("chat-inv-3"))
                .thenReturn(java.util.List.of(sysMsg));

        // Professional fetches messages
        var result = chatService.getMessages("chat-inv-3", "professional");

        assertNotNull(result);
        assertTrue(sysMsg.isRead(), "Professional viewer MUST mark message as read");
        verify(messageRepository, times(1)).save(sysMsg);
    }
}

