package com.safe.space.service;

import com.safe.space.dto.AuthDTOs.*;
import com.safe.space.model.CrisisAlert;
import com.safe.space.model.User;
import com.safe.space.repository.CrisisAlertRepository;
import com.safe.space.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EmailAndSecurityTest {

    @Mock private UserRepository userRepository;
    @Mock private EmailService emailService;
    @Mock private CrisisAlertRepository alertRepository;

    private PasswordResetService passwordResetService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        passwordResetService = new PasswordResetService(userRepository, emailService);
    }

    @Test
    @DisplayName("PasswordResetService: sendOtp must NOT expose raw OTP and must dispatch email")
    void testSendOtpSecurityAndDelivery() {
        User user = User.builder()
                .institutionalId("2024-STU-001")
                .username("student")
                .fullName("Juan Dela Cruz")
                .email("juan@university.edu.ph")
                .build();

        when(userRepository.findByInstitutionalId("2024-STU-001")).thenReturn(Optional.of(user));

        SendOtpRequest request = new SendOtpRequest("2024-STU-001", "EMAIL");
        SendOtpResponse response = passwordResetService.sendOtp(request);

        assertTrue(response.isSuccess());
        assertEquals("EMAIL", response.getMethod());
        assertEquals(300, response.getExpiresInSeconds());
        assertTrue(response.getDestinationMasked().contains("***"));

        // Verify that emailService was called with an OTP code
        ArgumentCaptor<String> otpCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailService, times(1)).sendOtpEmail(eq("juan@university.edu.ph"), eq("Juan Dela Cruz"), otpCaptor.capture());
        assertNotNull(otpCaptor.getValue());
        assertEquals(6, otpCaptor.getValue().length());
    }

    @Test
    @DisplayName("PasswordResetService: sendOtp must reject immediate second request within 60s cooldown")
    void testSendOtpRateLimiting() {
        User user = User.builder()
                .institutionalId("2024-STU-002")
                .username("student2")
                .fullName("Maria Santos")
                .email("maria@university.edu.ph")
                .build();

        when(userRepository.findByInstitutionalId("2024-STU-002")).thenReturn(Optional.of(user));

        SendOtpRequest request = new SendOtpRequest("2024-STU-002", "EMAIL");
        // First request succeeds
        SendOtpResponse first = passwordResetService.sendOtp(request);
        assertTrue(first.isSuccess());

        // Second immediate request must throw IllegalArgumentException with cooldown message
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> {
            passwordResetService.sendOtp(request);
        });

        assertTrue(ex.getMessage().contains("Please wait") && ex.getMessage().contains("seconds before requesting another verification code"));
    }

    @Test
    @DisplayName("EmailService.maskEmail should correctly mask email addresses")
    void testMaskEmail() {
        assertEquals("k***n@gmail.com", EmailService.maskEmail("kerlsan@gmail.com"));
        assertEquals("j***@ustp.edu.ph", EmailService.maskEmail("jd@ustp.edu.ph"));
        assertNull(EmailService.maskEmail(null));
        assertNull(EmailService.maskEmail("invalid-email"));
    }

    @Test
    @DisplayName("CrisisAlertService: notifyProfessionalsByEmail must notify both PROFESSIONAL and SUPER_ADMIN")
    void testCrisisAlertNotifiesSuperAdminAndProfessional() {
        User psychologist = User.builder()
                .institutionalId("RPSY-001")
                .username("psychologist")
                .fullName("Dr. Clara Reyes")
                .email("dr.clara@gmail.com")
                .role("PROFESSIONAL")
                .active(true)
                .build();

        User psychometrician = User.builder()
                .institutionalId("RPM-001")
                .username("psychometrician")
                .fullName("Lead Psychometrician, RPM")
                .email("lead.rpm@gmail.com")
                .role("SUPER_ADMIN")
                .active(true)
                .build();

        when(userRepository.findByRoleInAndActiveTrueAndEmailIsNotNull(List.of("PROFESSIONAL", "SUPER_ADMIN")))
                .thenReturn(List.of(psychologist, psychometrician));

        when(alertRepository.existsByReferenceIdAndReferenceTypeAndStatusIn(anyString(), anyString(), anyList()))
                .thenReturn(false);

        when(alertRepository.save(any(CrisisAlert.class))).thenAnswer(invocation -> {
            CrisisAlert a = invocation.getArgument(0);
            return a;
        });

        CrisisAlertService crisisAlertService = new CrisisAlertService(
                alertRepository,
                null,
                null,
                null,
                emailService,
                userRepository
        );

        CrisisAlert createdAlert = crisisAlertService.alertCrisisChat("chat-123", "Echo", "I feel overwhelmed and hopeless", "Crisis", 9);

        assertNotNull(createdAlert);
        assertEquals("CRISIS_CHAT", createdAlert.getAlertType());
        assertEquals("CRITICAL", createdAlert.getSeverity());

        // Verify email dispatched to BOTH staff members
        verify(emailService, times(1)).sendCrisisAlertEmail(
                eq("dr.clara@gmail.com"),
                eq("Dr. Clara Reyes"),
                eq("CRISIS_CHAT"),
                eq("CRITICAL"),
                eq("Echo"),
                anyString(),
                anyString(),
                any(),
                any(),
                any(),
                any()
        );

        verify(emailService, times(1)).sendCrisisAlertEmail(
                eq("lead.rpm@gmail.com"),
                eq("Lead Psychometrician, RPM"),
                eq("CRISIS_CHAT"),
                eq("CRITICAL"),
                eq("Echo"),
                anyString(),
                anyString(),
                any(),
                any(),
                any(),
                any()
        );
    }

    @Test
    @DisplayName("CrisisAlertService: alertHighEnergyPost dynamically triages severity based on energy score")
    void testAlertHighEnergyPostDynamicSeverityTriage() {
        User psychologist = User.builder()
                .institutionalId("RPSY-001")
                .username("psychologist")
                .fullName("Dr. Clara Reyes")
                .email("dr.clara@gmail.com")
                .role("PROFESSIONAL")
                .active(true)
                .build();

        when(userRepository.findByRoleInAndActiveTrueAndEmailIsNotNull(List.of("PROFESSIONAL", "SUPER_ADMIN")))
                .thenReturn(List.of(psychologist));

        when(alertRepository.existsByReferenceIdAndReferenceTypeAndStatusIn(anyString(), anyString(), anyList()))
                .thenReturn(false);

        when(alertRepository.save(any(CrisisAlert.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CrisisAlertService crisisAlertService = new CrisisAlertService(
                alertRepository,
                null,
                null,
                null,
                emailService,
                userRepository
        );

        // Test Energy 10 -> CRITICAL
        CrisisAlert alert10 = crisisAlertService.alertHighEnergyPost("post-10", "StressedStudent", "I can't take this anymore", "Despair", 10);
        assertNotNull(alert10);
        assertEquals("HIGH_ENERGY_POST", alert10.getAlertType());
        assertEquals("CRITICAL", alert10.getSeverity());
        assertEquals(10, alert10.getEnergyScore());

        // Test Energy 9 -> HIGH
        CrisisAlert alert9 = crisisAlertService.alertHighEnergyPost("post-9", "AnxiousStudent", "So overwhelmed with finals", "Anxious", 9);
        assertNotNull(alert9);
        assertEquals("HIGH_ENERGY_POST", alert9.getAlertType());
        assertEquals("HIGH", alert9.getSeverity());
        assertEquals(9, alert9.getEnergyScore());

        // Test Energy 8 -> MODERATE
        CrisisAlert alert8 = crisisAlertService.alertHighEnergyPost("post-8", "FrustratedStudent", "Everything is piling up", "Frustrated", 8);
        assertNotNull(alert8);
        assertEquals("HIGH_ENERGY_POST", alert8.getAlertType());
        assertEquals("MODERATE", alert8.getSeverity());
        assertEquals(8, alert8.getEnergyScore());

        // Verify email dispatched for energy 10 with CRITICAL severity
        verify(emailService, times(1)).sendCrisisAlertEmail(
                eq("dr.clara@gmail.com"),
                eq("Dr. Clara Reyes"),
                eq("HIGH_ENERGY_POST"),
                eq("CRITICAL"),
                eq("StressedStudent"),
                anyString(),
                anyString(),
                eq("Despair"),
                eq(10),
                isNull(),
                anyString()
        );

        // Verify email dispatched for energy 9 with HIGH severity
        verify(emailService, times(1)).sendCrisisAlertEmail(
                eq("dr.clara@gmail.com"),
                eq("Dr. Clara Reyes"),
                eq("HIGH_ENERGY_POST"),
                eq("HIGH"),
                eq("AnxiousStudent"),
                anyString(),
                anyString(),
                eq("Anxious"),
                eq(9),
                isNull(),
                anyString()
        );
    }
}

