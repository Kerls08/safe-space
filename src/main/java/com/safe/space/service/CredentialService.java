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
import java.util.*;
import java.util.stream.Collectors;

/**
 * Pre-registered Credentials service.
 *
 * Manages credential lifecycle for the Safe Space platform:
 *
 *   1. Credential Generation — Admin creates accounts from institutional directory
 *   2. Authentication       — Validates login and issues session tokens
 *   3. Password Management  — First-login forced change, user-initiated change
 *   4. Account Security     — Failed attempt tracking, temporary lockout
 *   5. Batch Import         — Bulk creation from student directory CSV/JSON
 *
 * Password Policy:
 *   - Generated passwords: 8 alphanumeric chars
 *   - Minimum new password: 8 characters
 *   - BCrypt hashing (strength 12)
 *   - Forced change on first login
 *
 * Lockout Policy:
 *   - 5 consecutive failed attempts → 15-minute lockout
 *   - Lockout resets after successful login
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CredentialService {

    private final UserRepository userRepository;

    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_MINUTES = 15;
    private static final int GENERATED_PASSWORD_LENGTH = 8;
    private static final int MIN_PASSWORD_LENGTH = 8;

    // Simple in-memory token store (would be JWT/Redis in production)
    private final Map<String, String> activeTokens = new HashMap<>();

    // ── 1. Authentication ──

    @Transactional
    public LoginResponse login(LoginRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank()) {
            throw new IllegalArgumentException("Username is required.");
        }
        if (request.getPassword() == null || request.getPassword().isBlank()) {
            throw new IllegalArgumentException("Password is required.");
        }

        User user = userRepository.findByUsername(request.getUsername())
                .or(() -> userRepository.findByInstitutionalId(request.getUsername()))
                .orElseThrow(() -> new NoSuchElementException("Invalid credentials."));

        // Check account active
        if (!user.isActive()) {
            throw new IllegalStateException("Account is deactivated. Contact your administrator.");
        }

        // Check lockout
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            long minsLeft = java.time.Duration.between(LocalDateTime.now(), user.getLockedUntil()).toMinutes() + 1;
            throw new IllegalStateException("Account locked. Try again in " + minsLeft + " minutes.");
        }

        // Validate password
        if (!ENCODER.matches(request.getPassword(), user.getPasswordHash())) {
            user.setFailedAttempts(user.getFailedAttempts() + 1);
            if (user.getFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
                user.setLockedUntil(LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
                userRepository.save(user);
                log.warn("Account locked due to {} failed attempts: username={}", user.getFailedAttempts(), user.getUsername());
                throw new IllegalStateException("Too many failed attempts. Account locked for " + LOCKOUT_MINUTES + " minutes.");
            }
            userRepository.save(user);
            int remaining = MAX_FAILED_ATTEMPTS - user.getFailedAttempts();
            throw new IllegalArgumentException("Invalid credentials. " + remaining + " attempts remaining.");
        }

        // Success — reset failed attempts
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        // Generate session token
        String token = UUID.randomUUID().toString();
        activeTokens.put(token, user.getUsername());

        log.info("Login successful: username={}, role={}, forceChange={}",
                user.getUsername(), user.getRole(), user.isForcePasswordChange());

        return LoginResponse.builder()
                .token(token)
                .username(user.getUsername())
                .fullName(user.getFullName())
                .role(user.getRole())
                .forcePasswordChange(user.isForcePasswordChange())
                .message(user.isForcePasswordChange()
                        ? "Login successful. Please change your password."
                        : "Login successful.")
                .build();
    }

    // ── 2. Password Management ──

    @Transactional
    public Map<String, String> changePassword(ChangePasswordRequest request) {
        if (request.getNewPassword() == null || request.getNewPassword().length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("New password must be at least " + MIN_PASSWORD_LENGTH + " characters.");
        }

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new NoSuchElementException("User not found."));

        if (!ENCODER.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect.");
        }

        user.setPasswordHash(ENCODER.encode(request.getNewPassword()));
        user.setPasswordChanged(true);
        user.setForcePasswordChange(false);
        userRepository.save(user);

        log.info("Password changed: username={}", user.getUsername());
        return Map.of("message", "Password changed successfully.");
    }

    // ── 3. Admin: Single User Registration ──

    @Transactional
    public RegisterUserResponse registerUser(RegisterUserRequest request) {
        validateRegistration(request);

        if (userRepository.existsByInstitutionalId(request.getInstitutionalId())) {
            throw new IllegalArgumentException("Institutional ID already registered: " + request.getInstitutionalId());
        }

        String username = request.getInstitutionalId();
        if (userRepository.existsByUsername(username)) {
            username = request.getInstitutionalId() + "-" + RANDOM.nextInt(1000);
        }

        String rawPassword = generatePassword();
        String role = normalizeRole(request.getRole());

        User user = User.builder()
                .institutionalId(request.getInstitutionalId())
                .username(username)
                .passwordHash(ENCODER.encode(rawPassword))
                .fullName(request.getFullName())
                .email(request.getEmail())
                .department(request.getDepartment())
                .yearLevel(request.getYearLevel())
                .role(role)
                .active(true)
                .passwordChanged(false)
                .forcePasswordChange(true)
                .build();

        userRepository.save(user);

        log.info("User registered: institutionalId={}, username={}, role={}",
                user.getInstitutionalId(), user.getUsername(), user.getRole());

        return RegisterUserResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .username(user.getUsername())
                .generatedPassword(rawPassword)
                .fullName(user.getFullName())
                .role(user.getRole())
                .message("Account created. Password must be changed on first login.")
                .build();
    }

    // ── 4. Admin: Batch Import ──

    @Transactional
    public BatchImportResponse batchImport(BatchImportRequest request) {
        List<RegisterUserResponse> created = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        int skipped = 0;

        for (RegisterUserRequest user : request.getUsers()) {
            try {
                if (userRepository.existsByInstitutionalId(user.getInstitutionalId())) {
                    skipped++;
                    errors.add("Skipped (already exists): " + user.getInstitutionalId());
                    continue;
                }
                RegisterUserResponse result = registerUser(user);
                created.add(result);
            } catch (Exception e) {
                errors.add("Failed: " + user.getInstitutionalId() + " — " + e.getMessage());
            }
        }

        log.info("Batch import: requested={}, created={}, skipped={}, failed={}",
                request.getUsers().size(), created.size(), skipped, errors.size() - skipped);

        return BatchImportResponse.builder()
                .totalRequested(request.getUsers().size())
                .successCount(created.size())
                .skippedCount(skipped)
                .failedCount(errors.size() - skipped)
                .created(created)
                .errors(errors)
                .build();
    }

    // ── 5. User Management ──

    @Transactional(readOnly = true)
    public List<UserProfileResponse> getUsersByRole(String role) {
        return userRepository.findByRoleOrderByFullNameAsc(normalizeRole(role)).stream()
                .map(this::toProfile)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getUserProfile(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));
        return toProfile(user);
    }

    @Transactional(readOnly = true)
    public List<UserProfileResponse> searchUsers(String query) {
        return userRepository.searchByNameOrId(query).stream()
                .map(this::toProfile)
                .collect(Collectors.toList());
    }

    @Transactional
    public Map<String, String> toggleUserActive(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));
        user.setActive(!user.isActive());
        userRepository.save(user);
        log.info("User {} {}", user.getUsername(), user.isActive() ? "activated" : "deactivated");
        return Map.of("message", "User " + (user.isActive() ? "activated" : "deactivated") + ".",
                "active", String.valueOf(user.isActive()));
    }

    @Transactional
    public RegisterUserResponse resetPassword(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));

        String rawPassword = generatePassword();
        user.setPasswordHash(ENCODER.encode(rawPassword));
        user.setPasswordChanged(false);
        user.setForcePasswordChange(true);
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        log.info("Password reset by admin: username={}", user.getUsername());

        return RegisterUserResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .username(user.getUsername())
                .generatedPassword(rawPassword)
                .fullName(user.getFullName())
                .role(user.getRole())
                .message("Password reset. User must change on next login.")
                .build();
    }

    // ── 5b. Self-Service Profile Update ──

    @Transactional
    public UserProfileResponse updateProfile(String username, UpdateProfileRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));

        String oldUsername = user.getUsername();

        // Validate and set username
        if (request.getUsername() != null && !request.getUsername().isBlank()) {
            String newUsername = request.getUsername().trim();
            if (!newUsername.equals(oldUsername)) {
                // Check uniqueness
                if (userRepository.existsByUsername(newUsername)) {
                    throw new IllegalArgumentException("Username '" + newUsername + "' is already taken.");
                }
                // Minimum length
                if (newUsername.length() < 3) {
                    throw new IllegalArgumentException("Username must be at least 3 characters.");
                }
                user.setUsername(newUsername);
            }
        }

        // Validate fullName
        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName().trim());
        }

        // Validate and set email
        if (request.getEmail() != null) {
            String email = request.getEmail().trim();
            if (!email.isEmpty() && !email.matches("^[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$")) {
                throw new IllegalArgumentException("Invalid email format.");
            }
            user.setEmail(email.isEmpty() ? null : email);
        }

        // Department
        if (request.getDepartment() != null) {
            user.setDepartment(request.getDepartment().trim().isEmpty() ? null : request.getDepartment().trim());
        }

        // Year level
        if (request.getYearLevel() != null) {
            user.setYearLevel(request.getYearLevel().trim().isEmpty() ? null : request.getYearLevel().trim());
        }

        userRepository.save(user);

        // If username changed, re-map active tokens so the user stays logged in
        if (!oldUsername.equals(user.getUsername())) {
            for (Map.Entry<String, String> entry : activeTokens.entrySet()) {
                if (oldUsername.equals(entry.getValue())) {
                    entry.setValue(user.getUsername());
                }
            }
            log.info("Username changed: {} → {}", oldUsername, user.getUsername());
        }

        log.info("Profile updated: username={}", user.getUsername());

        return toProfile(user);
    }

    // ── 6. Statistics ──

    @Transactional(readOnly = true)
    public CredentialStatsResponse getStats() {
        long total = userRepository.count();
        long active = userRepository.countByActiveTrue();

        long students = 0, professionals = 0;
        for (Object[] row : userRepository.countByRole()) {
            String role = (String) row[0];
            long count = ((Number) row[1]).longValue();
            switch (role) {
                case "STUDENT" -> students = count;
                case "PROFESSIONAL" -> professionals = count;
            }
        }

        long pwChanged = userRepository.findAll().stream()
                .filter(User::isPasswordChanged).count();
        long locked = userRepository.findAll().stream()
                .filter(u -> u.getLockedUntil() != null && u.getLockedUntil().isAfter(LocalDateTime.now()))
                .count();

        return CredentialStatsResponse.builder()
                .totalUsers(total)
                .activeUsers(active)
                .students(students)
                .professionals(professionals)
                .admins(0)
                .passwordChangedCount(pwChanged)
                .lockedAccounts(locked)
                .build();
    }

    // ── Token Validation ──

    public String validateToken(String token) {
        return activeTokens.get(token);
    }

    public void logout(String token) {
        activeTokens.remove(token);
    }

    // ── Helpers ──

    private void validateRegistration(RegisterUserRequest req) {
        if (req.getInstitutionalId() == null || req.getInstitutionalId().isBlank())
            throw new IllegalArgumentException("institutionalId is required.");
        if (req.getFullName() == null || req.getFullName().isBlank())
            throw new IllegalArgumentException("fullName is required.");
        if (req.getRole() == null || req.getRole().isBlank())
            throw new IllegalArgumentException("role is required.");
    }

    private String normalizeRole(String role) {
        if (role == null) return "STUDENT";
        return switch (role.toUpperCase().trim()) {
            case "STUDENT", "S" -> "STUDENT";
            case "PROFESSIONAL", "PRO", "P", "COUNSELOR", "PSYCHOMETRICIAN" -> "PROFESSIONAL";
            default -> throw new IllegalArgumentException("Invalid role: " + role + ". Must be STUDENT or PROFESSIONAL.");
        };
    }

    private String generatePassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(GENERATED_PASSWORD_LENGTH);
        for (int i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
            sb.append(chars.charAt(RANDOM.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private UserProfileResponse toProfile(User u) {
        return UserProfileResponse.builder()
                .id(u.getId())
                .institutionalId(u.getInstitutionalId())
                .username(u.getUsername())
                .fullName(u.getFullName())
                .email(u.getEmail())
                .department(u.getDepartment())
                .yearLevel(u.getYearLevel())
                .role(u.getRole())
                .active(u.isActive())
                .passwordChanged(u.isPasswordChanged())
                .createdAt(u.getCreatedAt() != null ? u.getCreatedAt().toString() : null)
                .lastLoginAt(u.getLastLoginAt() != null ? u.getLastLoginAt().toString() : null)
                .build();
    }
}
