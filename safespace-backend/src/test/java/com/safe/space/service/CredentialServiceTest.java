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
}
