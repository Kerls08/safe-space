package com.safe.space.service;

import com.safe.space.dto.SystemMaintenanceDTOs.*;
import com.safe.space.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;

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

    private SystemMaintenanceService maintenanceService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        maintenanceService = new SystemMaintenanceService(
                userRepository,
                postRepository,
                chatSessionRepository,
                crisisAlertRepository,
                wellnessResourceRepository,
                emailService,
                credentialService
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
    @DisplayName("Should purge inactive tokens and record audit")
    void testPurgeInactiveSessions() {
        when(credentialService.getActiveTokenCount()).thenReturn(5, 1);
        when(credentialService.purgeTokensExcept("admin")).thenReturn(4);

        OperationResult result = maintenanceService.purgeInactiveSessions("admin");

        assertTrue(result.isSuccess());
        verify(credentialService).purgeTokensExcept("admin");
        assertTrue(maintenanceService.getAuditLogs().stream().anyMatch(l -> "SESSIONS_PURGED".equals(l.getAction())));
    }

    @Test
    @DisplayName("Should run database integrity check successfully")
    void testRunDatabaseCheck() {
        when(userRepository.count()).thenReturn(10L);
        when(postRepository.count()).thenReturn(20L);
        when(crisisAlertRepository.count()).thenReturn(1L);
        when(chatSessionRepository.count()).thenReturn(3L);

        OperationResult res = maintenanceService.runDatabaseCheck("admin");

        assertTrue(res.isSuccess());
        assertEquals("Database integrity verified. All tables and relationship constraints responsive.", res.getMessage());
    }

    @Test
    @DisplayName("Should export system diagnostics report")
    void testExportTelemetryReport() {
        var report = maintenanceService.exportTelemetryReport("admin");
        assertNotNull(report);
        assertEquals("admin", report.get("exportedBy"));
        assertNotNull(report.get("diagnostics"));
        assertNotNull(report.get("recentAuditLogs"));
    }
}
