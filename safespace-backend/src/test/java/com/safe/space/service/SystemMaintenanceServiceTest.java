package com.safe.space.service;

import com.safe.space.dto.SystemMaintenanceDTOs.*;
import com.safe.space.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SystemMaintenanceServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private PostRepository postRepository;
    @Mock private ChatSessionRepository chatSessionRepository;
    @Mock private CrisisAlertRepository crisisAlertRepository;
    @Mock private WellnessResourceRepository wellnessResourceRepository;
    @Mock private EmailService emailService;
    @Mock private CredentialService credentialService;
    @Mock private AuditLogRepository auditLogRepository;

    private SystemMaintenanceService maintenanceService;
    private final List<com.safe.space.model.AuditLog> mockLogs = new java.util.ArrayList<>();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mockLogs.clear();
        when(auditLogRepository.save(any(com.safe.space.model.AuditLog.class))).thenAnswer(inv -> {
            com.safe.space.model.AuditLog log = inv.getArgument(0);
            mockLogs.add(0, log);
            return log;
        });
        when(auditLogRepository.findTop200ByOrderByTimestampDesc()).thenReturn(mockLogs);
        when(auditLogRepository.findAllByOrderByTimestampDesc()).thenReturn(mockLogs);

        maintenanceService = new SystemMaintenanceService(
                userRepository,
                postRepository,
                chatSessionRepository,
                crisisAlertRepository,
                wellnessResourceRepository,
                emailService,
                credentialService,
                auditLogRepository
        );
        maintenanceService.init();
    }

    @Test
    @DisplayName("Should return accurate system health diagnostics")
    void testGetSystemHealth() {
        when(userRepository.count()).thenReturn(15L);
        when(userRepository.countByActiveTrue()).thenReturn(14L);
        when(userRepository.countByRole()).thenReturn(List.of(
                new Object[]{"STUDENT", 10L},
                new Object[]{"PROFESSIONAL", 4L},
                new Object[]{"ADMIN", 1L}
        ));
        when(postRepository.count()).thenReturn(45L);
        when(chatSessionRepository.count()).thenReturn(8L);
        when(crisisAlertRepository.count()).thenReturn(2L);
        when(wellnessResourceRepository.count()).thenReturn(12L);
        when(credentialService.getActiveTokenCount()).thenReturn(3);
        when(emailService.isConfigured()).thenReturn(true);
        when(emailService.getFromAddress()).thenReturn("acoymo.kerlsan08@gmail.com");
        when(emailService.getFromName()).thenReturn("SafeSpace System");

        SystemHealthResponse health = maintenanceService.getSystemHealth();

        assertNotNull(health);
        assertNotNull(health.getJvm());
        assertTrue(health.getJvm().getUptimeSeconds() >= 0);
        assertNotNull(health.getJvm().getUptimeFormatted());

        assertEquals("ONLINE", health.getDatabase().getStatus());
        assertEquals(15L, health.getDatabase().getTotalUsers());
        assertEquals(10L, health.getDatabase().getStudents());
        assertEquals(4L, health.getDatabase().getProfessionals());
        assertEquals(1L, health.getDatabase().getAdmins());
        assertEquals(45L, health.getDatabase().getTotalPosts());

        assertTrue(health.getEmailGateway().isConfigured());
        assertEquals("ONLINE", health.getEmailGateway().getStatus());
    }

    @Test
    @DisplayName("Should toggle maintenance mode on and off with audit logging")
    void testSetMaintenanceMode() {
        assertFalse(maintenanceService.isMaintenanceActive());

        SetMaintenanceRequest enableReq = new SetMaintenanceRequest(true, "Routine server maintenance", "30 mins");
        OperationResult res = maintenanceService.setMaintenanceMode(enableReq, "admin");

        assertTrue(res.isSuccess());
        assertTrue(maintenanceService.isMaintenanceActive());
        assertEquals("Routine server maintenance", maintenanceService.getMaintenanceMessage());

        List<AuditLogResponse> logs = maintenanceService.getAuditLogs();
        assertFalse(logs.isEmpty());
        assertTrue(logs.stream().anyMatch(l -> "MAINTENANCE_ENABLED".equals(l.getAction())));

        // Disable maintenance
        SetMaintenanceRequest disableReq = new SetMaintenanceRequest(false, null, null);
        OperationResult disableRes = maintenanceService.setMaintenanceMode(disableReq, "admin");

        assertTrue(disableRes.isSuccess());
        assertFalse(maintenanceService.isMaintenanceActive());
        assertTrue(maintenanceService.getAuditLogs().stream().anyMatch(l -> "MAINTENANCE_DISABLED".equals(l.getAction())));
    }

    @Test
    @DisplayName("Should set and clear campus broadcast announcements")
    void testSetBroadcastBanner() {
        SetBroadcastRequest bannerReq = new SetBroadcastRequest(true, "Counseling office closed Friday", "WARNING");
        OperationResult res = maintenanceService.setBroadcastBanner(bannerReq, "admin");

        assertTrue(res.isSuccess());
        BroadcastBannerStatus status = maintenanceService.getBroadcastDetails();
        assertTrue(status.isActive());
        assertEquals("Counseling office closed Friday", status.getMessage());
        assertEquals("WARNING", status.getType());

        // Clear banner
        SetBroadcastRequest clearReq = new SetBroadcastRequest(false, "", "INFO");
        maintenanceService.setBroadcastBanner(clearReq, "admin");
        assertFalse(maintenanceService.getBroadcastDetails().isActive());
    }

    @Test
    @DisplayName("Should scan database trash with protected data breakdown")
    void testScanDatabaseTrash() {
        when(postRepository.count()).thenReturn(50L);
        when(chatSessionRepository.count()).thenReturn(10L);
        when(crisisAlertRepository.count()).thenReturn(5L);
        when(userRepository.count()).thenReturn(20L);

        com.safe.space.model.ChatSession abandoned = com.safe.space.model.ChatSession.builder()
                .sessionId("chat-abandoned-1")
                .messageCount(0)
                .crisisFlag(false)
                .status("WAITING")
                .build();
        when(chatSessionRepository.findAbandonedSessions(any())).thenReturn(List.of(abandoned));
        when(crisisAlertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc("chat-abandoned-1")).thenReturn(Optional.empty());

        when(credentialService.countStaleSessionTokens()).thenReturn(2);
        when(credentialService.countStaleLockoutEntries()).thenReturn(1);

        DatabaseCleanupScanResponse scan = maintenanceService.scanDatabaseTrash();

        assertNotNull(scan);
        assertEquals(50L, scan.getProtectedPosts());
        assertEquals(9L, scan.getProtectedChatSessions());
        assertEquals(5L, scan.getProtectedCrisisAlerts());
        assertEquals(20L, scan.getProtectedUsers());
        assertEquals(1, scan.getAbandonedEmptySessions());
        assertEquals(2, scan.getStaleTokens());
        assertEquals(1, scan.getExpiredLockouts());
        assertEquals(4, scan.getTotalTrashItems());
    }

    @Test
    @DisplayName("Should execute safe database cleanup without deleting real user data")
    void testExecuteDatabaseCleanup() {
        com.safe.space.model.ChatSession abandoned = com.safe.space.model.ChatSession.builder()
                .sessionId("chat-abandoned-2")
                .messageCount(0)
                .crisisFlag(false)
                .status("WAITING")
                .build();
        when(chatSessionRepository.findAbandonedSessions(any())).thenReturn(List.of(abandoned));
        when(crisisAlertRepository.findFirstByChatSessionIdOrderByCreatedAtDesc("chat-abandoned-2")).thenReturn(Optional.empty());

        when(credentialService.cleanStaleSessionTokens()).thenReturn(3);
        when(credentialService.cleanExpiredLockoutEntries()).thenReturn(2);

        DatabaseCleanupResult result = maintenanceService.executeDatabaseCleanup("admin");

        assertTrue(result.isSuccess());
        assertEquals(1, result.getPurgedAbandonedSessions());
        assertEquals(3, result.getPurgedStaleTokens());
        assertEquals(2, result.getPurgedExpiredLockouts());
        assertEquals(6, result.getTotalPurged());

        verify(chatSessionRepository, times(1)).delete(abandoned);
        verify(postRepository, never()).delete(any());
        verify(userRepository, never()).delete(any());
        verify(crisisAlertRepository, never()).delete(any());

        assertTrue(mockLogs.stream().anyMatch(l -> "DATABASE_CLEANED".equals(l.getAction())));
    }

    @Test
    @DisplayName("Should persist audit log and export CSV format")
    void testExportAuditLogsCsv() {
        maintenanceService.logAudit("admin", "TEST_ACTION", "INFO", "Testing audit CSV export", "target-user");

        String csv = maintenanceService.exportAuditLogsCsv();
        assertNotNull(csv);
        assertTrue(csv.contains("ID,Timestamp,Actor,Action,Severity,Target,Details"));
        assertTrue(csv.contains("TEST_ACTION"));
        assertTrue(csv.contains("admin"));
        assertTrue(csv.contains("target-user"));
    }
}
