package com.safe.space.service;

import com.safe.space.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.*;

class CredentialServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private EmailService emailService;

    private CredentialService credentialService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        credentialService = new CredentialService(userRepository, emailService);
    }

    @Test
    @DisplayName("Should generate correct default password with name, ID details and high-entropy salt")
    void testStandardFullNameAndId() {
        String pwd = credentialService.generateDefaultPassword("Juan Dela Cruz", "2023-10452");
        assertTrue(pwd.startsWith("CruzJ@0452#"));
        assertTrue(pwd.length() >= 14);
        assertTrue(pwd.matches("^CruzJ@0452#[a-zA-Z0-9!@#$%^&*]{4}$"));
    }

    @Test
    @DisplayName("Should generate correct default password for simple two-word name and student ID")
    void testTwoWordName() {
        String pwd = credentialService.generateDefaultPassword("John Doe", "2021-0089");
        assertTrue(pwd.startsWith("DoeJ@0089#"));
        assertTrue(pwd.length() >= 13);
    }

    @Test
    @DisplayName("Should handle names with special characters cleanly with random salt")
    void testNameWithSpecialCharacters() {
        String pwd = credentialService.generateDefaultPassword("Jane O'Connor", "STU-998877");
        assertTrue(pwd.startsWith("OconnorJ@8877#"));
        assertTrue(pwd.length() >= 15);
    }

    @Test
    @DisplayName("Should handle single-word name and prefixed institutional ID")
    void testSingleWordName() {
        String pwd = credentialService.generateDefaultPassword("Administrator", "PROF-001");
        assertTrue(pwd.startsWith("AdministratorA@0001#"));
        assertTrue(pwd.length() >= 20);
    }

    @Test
    @DisplayName("Should pad short password outputs to satisfy minimum length requirement")
    void testShortNameAndShortId() {
        String pwd = credentialService.generateDefaultPassword("A B", "1");
        assertTrue(pwd.length() >= 12, "Generated password must be at least 12 characters long");
        assertTrue(pwd.startsWith("BA@00010#"));
    }

    @Test
    @DisplayName("Should handle null or empty inputs gracefully with fallback defaults and salt")
    void testNullAndEmptyInputs() {
        String pwdNull = credentialService.generateDefaultPassword(null, null);
        assertTrue(pwdNull.startsWith("UserU@2026#"));
        assertTrue(pwdNull.length() >= 14);

        String pwdBlank = credentialService.generateDefaultPassword("  ", "  ");
        assertTrue(pwdBlank.startsWith("UserU@2026#"));
        assertTrue(pwdBlank.length() >= 14);
    }

    @Test
    @DisplayName("Should reject passwords that fail to comply with complexity requirements")
    void testPasswordComplexityRejection() {
        // Lacks uppercase
        IllegalArgumentException exNoUpper = assertThrows(IllegalArgumentException.class, () ->
                CredentialService.validatePasswordComplexity("password123!"));
        assertTrue(exNoUpper.getMessage().contains("uppercase letter (A-Z)"));

        // Lacks number
        IllegalArgumentException exNoNum = assertThrows(IllegalArgumentException.class, () ->
                CredentialService.validatePasswordComplexity("Password!"));
        assertTrue(exNoNum.getMessage().contains("number (0-9)"));

        // Lacks special symbol
        IllegalArgumentException exNoSym = assertThrows(IllegalArgumentException.class, () ->
                CredentialService.validatePasswordComplexity("Password123"));
        assertTrue(exNoSym.getMessage().contains("special symbol (!@#$%...)"));

        // Too short (< 8 chars)
        IllegalArgumentException exTooShort = assertThrows(IllegalArgumentException.class, () ->
                CredentialService.validatePasswordComplexity("P@1a"));
        assertTrue(exTooShort.getMessage().contains("at least 8 characters"));

        // Null password
        assertThrows(IllegalArgumentException.class, () ->
                CredentialService.validatePasswordComplexity(null));
    }

    @Test
    @DisplayName("Should accept passwords that comply with all complexity requirements")
    void testPasswordComplexityAcceptance() {
        assertDoesNotThrow(() -> CredentialService.validatePasswordComplexity("ValidPass123!"));
        assertDoesNotThrow(() -> CredentialService.validatePasswordComplexity("SafeSpace@2026"));
    }

    @Test
    @DisplayName("Should successfully register a colleague with role PROFESSIONAL and send welcome email")
    void testRegisterColleagueSuccess() {
        org.mockito.Mockito.when(userRepository.existsByInstitutionalId("PROF-2026-01")).thenReturn(false);
        org.mockito.Mockito.when(userRepository.existsByUsername("PROF-2026-01")).thenReturn(false);

        com.safe.space.dto.AuthDTOs.RegisterColleagueRequest req = com.safe.space.dto.AuthDTOs.RegisterColleagueRequest.builder()
                .institutionalId("PROF-2026-01")
                .fullName("Dr. Maria Santos, RPsy")
                .email("maria.santos@ustp.edu.ph")
                .title("Psychologist")
                .department("Guidance & Counseling Center")
                .phoneNumber("09123456789")
                .build();

        com.safe.space.dto.AuthDTOs.RegisterUserResponse res = credentialService.registerColleague(req, "counselor1");

        assertNotNull(res);
        assertEquals("PROF-2026-01", res.getInstitutionalId());
        assertEquals("PROFESSIONAL", res.getRole());
        assertTrue(res.getMessage().contains("Dr. Maria Santos, RPsy"));
        assertNotNull(res.getGeneratedPassword());

        org.mockito.Mockito.verify(userRepository).save(org.mockito.ArgumentMatchers.argThat(u ->
                "PROFESSIONAL".equals(u.getRole()) &&
                "PROF-2026-01".equals(u.getInstitutionalId()) &&
                "maria.santos@ustp.edu.ph".equals(u.getEmail())
        ));

        org.mockito.Mockito.verify(emailService).sendProfessionalWelcomeEmail(
                org.mockito.ArgumentMatchers.eq("maria.santos@ustp.edu.ph"),
                org.mockito.ArgumentMatchers.eq("Dr. Maria Santos, RPsy"),
                org.mockito.ArgumentMatchers.eq("PROF-2026-01"),
                org.mockito.ArgumentMatchers.eq("PROF-2026-01"),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.eq("Psychologist")
        );
    }

    @Test
    @DisplayName("Should reject colleague registration if full name or email is missing")
    void testRegisterColleagueValidation() {
        com.safe.space.dto.AuthDTOs.RegisterColleagueRequest noName = com.safe.space.dto.AuthDTOs.RegisterColleagueRequest.builder()
                .institutionalId("PROF-002")
                .fullName("")
                .email("test@ustp.edu.ph")
                .build();
        IllegalArgumentException ex1 = assertThrows(IllegalArgumentException.class, () ->
                credentialService.registerColleague(noName, "counselor1"));
        assertTrue(ex1.getMessage().contains("full name"));

        com.safe.space.dto.AuthDTOs.RegisterColleagueRequest noEmail = com.safe.space.dto.AuthDTOs.RegisterColleagueRequest.builder()
                .institutionalId("PROF-002")
                .fullName("Jane Doe")
                .email("")
                .build();
        IllegalArgumentException ex2 = assertThrows(IllegalArgumentException.class, () ->
                credentialService.registerColleague(noEmail, "counselor1"));
        assertTrue(ex2.getMessage().contains("email"));
    }
}
