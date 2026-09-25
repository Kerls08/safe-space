package com.safe.space.service;

import com.safe.space.dto.AuthDTOs.*;
import com.safe.space.model.User;
import com.safe.space.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Self-Service Password Recovery Service.
 *
 * Provides multi-factor account recovery:
 *   1. Account Lookup & Destination Masking
 *   2. Dual-mode OTP Dispatch (Email OTP / Phone SMS OTP)
 *   3. 6-digit OTP Code Verification (5-minute TTL)
 *   4. Secure Single-Use Reset Token Execution (10-minute TTL)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);
    private static final SecureRandom RANDOM = new SecureRandom();

    // In-memory OTP storage: institutionalId -> OtpEntry
    private final Map<String, OtpEntry> activeOtps = new ConcurrentHashMap<>();

    // In-memory Reset Token storage: resetToken -> ResetTokenEntry
    private final Map<String, ResetTokenEntry> activeResetTokens = new ConcurrentHashMap<>();

    private record OtpEntry(String code, String method, LocalDateTime expiresAt, int attempts) {}
    private record ResetTokenEntry(String institutionalId, LocalDateTime expiresAt) {}

    /**
     * 1. Search for account and return masked contact options.
     */
    @Transactional(readOnly = true)
    public ForgotPasswordLookupResponse lookupAccount(ForgotPasswordLookupRequest request) {
        if (request.getIdentifier() == null || request.getIdentifier().isBlank()) {
            throw new IllegalArgumentException("Please enter your Student ID or username.");
        }

        String id = request.getIdentifier().trim();
        User user = userRepository.findByInstitutionalId(id)
                .or(() -> userRepository.findByUsername(id))
                .orElseThrow(() -> new NoSuchElementException("No account found matching Institutional ID or username: " + id));

        boolean hasEmail = user.getEmail() != null && !user.getEmail().isBlank();
        boolean hasPhone = user.getPhoneNumber() != null && !user.getPhoneNumber().isBlank();

        if (!hasEmail && !hasPhone) {
            throw new IllegalStateException("This account does not have a recovery email or phone number on file. Please contact your campus administrator.");
        }

        return ForgotPasswordLookupResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .maskedEmail(EmailService.maskEmail(user.getEmail()))
                .maskedPhone(EmailService.maskPhoneNumber(user.getPhoneNumber()))
                .hasEmail(hasEmail)
                .hasPhone(hasPhone)
                .build();
    }

    /**
     * 2. Generate and dispatch a 6-digit OTP code to either Email or Phone Number.
     */
    public SendOtpResponse sendOtp(SendOtpRequest request) {
        if (request.getIdentifier() == null || request.getIdentifier().isBlank()) {
            throw new IllegalArgumentException("Identifier is required.");
        }
        if (request.getMethod() == null || request.getMethod().isBlank()) {
            throw new IllegalArgumentException("Recovery method (EMAIL or PHONE) is required.");
        }

        String id = request.getIdentifier().trim();
        User user = userRepository.findByInstitutionalId(id)
                .or(() -> userRepository.findByUsername(id))
                .orElseThrow(() -> new NoSuchElementException("No account found matching: " + id));

        String method = request.getMethod().trim().toUpperCase();
        if (!"EMAIL".equals(method) && !"PHONE".equals(method)) {
            throw new IllegalArgumentException("Invalid recovery method. Must be EMAIL or PHONE.");
        }

        // Generate 6-digit numeric OTP
        int codeInt = 100000 + RANDOM.nextInt(900000);
        String code = String.valueOf(codeInt);
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(5);

        activeOtps.put(user.getInstitutionalId(), new OtpEntry(code, method, expiresAt, 0));

        String destinationMasked;
        String message;

        if ("EMAIL".equals(method)) {
            if (user.getEmail() == null || user.getEmail().isBlank()) {
                throw new IllegalArgumentException("No registered email address found for this account.");
            }
            destinationMasked = EmailService.maskEmail(user.getEmail());
            message = "A 6-digit verification code has been dispatched to " + destinationMasked;
            emailService.sendOtpEmail(user.getEmail(), user.getFullName(), code);
        } else {
            if (user.getPhoneNumber() == null || user.getPhoneNumber().isBlank()) {
                throw new IllegalArgumentException("No registered mobile number found for this account.");
            }
            destinationMasked = EmailService.maskPhoneNumber(user.getPhoneNumber());
            message = "A 6-digit verification code has been dispatched via SMS to " + destinationMasked;
            emailService.sendOtpSms(user.getPhoneNumber(), code);
        }

        log.info("Password reset OTP requested: user={}, method={}, expiresAt={}",
                user.getInstitutionalId(), method, expiresAt);

        return SendOtpResponse.builder()
                .success(true)
                .method(method)
                .destinationMasked(destinationMasked)
                .message(message)
                .expiresInSeconds(300)
                .build();
    }

    /**
     * 3. Verify the 6-digit OTP code and issue a 10-minute single-use reset token.
     */
    public VerifyOtpResponse verifyOtp(VerifyOtpRequest request) {
        if (request.getIdentifier() == null || request.getIdentifier().isBlank()) {
            throw new IllegalArgumentException("Identifier is required.");
        }
        if (request.getOtpCode() == null || request.getOtpCode().isBlank()) {
            throw new IllegalArgumentException("Please enter the 6-digit verification code.");
        }

        String id = request.getIdentifier().trim();
        User user = userRepository.findByInstitutionalId(id)
                .or(() -> userRepository.findByUsername(id))
                .orElseThrow(() -> new NoSuchElementException("No account found matching: " + id));

        OtpEntry entry = activeOtps.get(user.getInstitutionalId());
        if (entry == null || LocalDateTime.now().isAfter(entry.expiresAt())) {
            activeOtps.remove(user.getInstitutionalId());
            throw new IllegalArgumentException("The verification code has expired or was not requested. Please request a new code.");
        }

        if (entry.attempts() >= 4) {
            activeOtps.remove(user.getInstitutionalId());
            throw new IllegalArgumentException("Too many incorrect attempts. For security reasons, please request a new verification code.");
        }

        String submittedCode = request.getOtpCode().trim();
        if (!entry.code().equals(submittedCode)) {
            activeOtps.put(user.getInstitutionalId(),
                    new OtpEntry(entry.code(), entry.method(), entry.expiresAt(), entry.attempts() + 1));
            throw new IllegalArgumentException("Incorrect verification code. Please check and try again.");
        }

        // OTP is valid — remove used OTP and generate single-use reset token
        activeOtps.remove(user.getInstitutionalId());

        String resetToken = UUID.randomUUID().toString();
        activeResetTokens.put(resetToken, new ResetTokenEntry(user.getInstitutionalId(), LocalDateTime.now().plusMinutes(10)));

        log.info("Password reset OTP verified successfully for user={}", user.getInstitutionalId());

        return VerifyOtpResponse.builder()
                .verified(true)
                .resetToken(resetToken)
                .message("Verification successful! You can now set a new password.")
                .build();
    }

    /**
     * 4. Reset the user's password using the validated reset token.
     */
    @Transactional
    public void resetPasswordWithToken(ResetPasswordWithTokenRequest request) {
        if (request.getIdentifier() == null || request.getIdentifier().isBlank()) {
            throw new IllegalArgumentException("Identifier is required.");
        }
        if (request.getResetToken() == null || request.getResetToken().isBlank()) {
            throw new IllegalArgumentException("Reset authorization token is missing.");
        }
        if (request.getNewPassword() == null || request.getNewPassword().isBlank()) {
            throw new IllegalArgumentException("New password is required.");
        }

        String id = request.getIdentifier().trim();
        User user = userRepository.findByInstitutionalId(id)
                .or(() -> userRepository.findByUsername(id))
                .orElseThrow(() -> new NoSuchElementException("No account found matching: " + id));

        ResetTokenEntry tokenEntry = activeResetTokens.get(request.getResetToken().trim());
        if (tokenEntry == null || LocalDateTime.now().isAfter(tokenEntry.expiresAt())) {
            if (tokenEntry != null) activeResetTokens.remove(request.getResetToken().trim());
            throw new IllegalArgumentException("The reset session has expired or is invalid. Please restart the password recovery process.");
        }

        if (!tokenEntry.institutionalId().equals(user.getInstitutionalId())) {
            throw new IllegalArgumentException("Reset token does not match this user account.");
        }

        validatePasswordComplexity(request.getNewPassword());

        if (!request.getNewPassword().equals(request.getConfirmPassword())) {
            throw new IllegalArgumentException("Passwords do not match.");
        }

        user.setPasswordHash(ENCODER.encode(request.getNewPassword()));
        user.setPasswordChanged(true);
        user.setForcePasswordChange(false);
        user.setFailedAttempts(0);
        user.setLockedUntil(null);

        userRepository.save(user);

        // Invalidate used reset token
        activeResetTokens.remove(request.getResetToken().trim());

        log.info("User {} successfully updated their password via self-service recovery.", user.getInstitutionalId());
    }

    private void validatePasswordComplexity(String password) {
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters long.");
        }
        if (!password.matches(".*[A-Z].*")) {
            throw new IllegalArgumentException("Password must contain at least one uppercase letter (A-Z).");
        }
        if (!password.matches(".*[0-9].*")) {
            throw new IllegalArgumentException("Password must contain at least one number (0-9).");
        }
        if (!password.matches(".*[^A-Za-z0-9].*")) {
            throw new IllegalArgumentException("Password must contain at least one special symbol (!@#$%...).");
        }
    }
}
