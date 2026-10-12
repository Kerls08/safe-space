package com.safe.space.service;

import com.safe.space.dto.AuthDTOs.*;
import com.safe.space.event.AdminAuditEvent;
import com.safe.space.model.User;
import com.safe.space.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
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
    private final EmailService emailService;
    private final ApplicationEventPublisher eventPublisher;

    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_MINUTES = 15;
    private static final int GENERATED_PASSWORD_LENGTH = 8;
    private static final int MIN_PASSWORD_LENGTH = 8;

    // Thread-safe in-memory token store with database fallback
    private final Map<String, String> activeTokens = new ConcurrentHashMap<>();

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

        // Generate session token & persist to DB to survive server restarts
        String token = UUID.randomUUID().toString();
        user.setSessionToken(token);
        userRepository.save(user);
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
        validatePasswordComplexity(request.getNewPassword());

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

        String rawPassword = generateDefaultPassword(request.getFullName(), request.getInstitutionalId());
        String role = normalizeRole(request.getRole());
        String cleanEmail = request.getEmail().trim();

        User user = User.builder()
                .institutionalId(request.getInstitutionalId().trim())
                .username(username)
                .passwordHash(ENCODER.encode(rawPassword))
                .fullName(request.getFullName().trim())
                .email(cleanEmail)
                .phoneNumber(request.getPhoneNumber())
                .department(request.getDepartment())
                .yearLevel(request.getYearLevel())
                .role(role)
                .active(true)
                .passwordChanged(false)
                .forcePasswordChange(true)
                .build();

        userRepository.save(user);

        // Send Welcome & Credential email via Brevo REST API (async)
        if ("PROFESSIONAL".equalsIgnoreCase(user.getRole()) || "SUPER_ADMIN".equalsIgnoreCase(user.getRole())) {
            emailService.sendProfessionalWelcomeEmail(
                    user.getEmail(),
                    user.getFullName(),
                    user.getInstitutionalId(),
                    user.getUsername(),
                    rawPassword,
                    user.getDepartment() != null ? user.getDepartment() : "Campus Mental Health Professional"
            );
        } else {
            emailService.sendWelcomeEmail(user.getEmail(), user.getFullName(), user.getUsername(), rawPassword);
        }

        log.info("User registered: institutionalId={}, username={}, role={}, email={}",
                user.getInstitutionalId(), user.getUsername(), user.getRole(), user.getEmail());

        return RegisterUserResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .username(user.getUsername())
                .generatedPassword(rawPassword)
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(user.getRole())
                .message("Account created successfully. Credentials email dispatched to " + user.getEmail())
                .build();
    }

    // ── 3c. Colleague Registration (Mental Health Professionals) ──

    /**
     * Register a fellow campus mental health professional colleague.
     * Easy to comprehend, human-friendly validation and messaging without overly technical jargon.
     * Accessible by registered professionals and system administrators.
     */
    @Transactional
    public RegisterUserResponse registerColleague(RegisterColleagueRequest request, String registeredByUsername) {
        if (request == null) {
            throw new IllegalArgumentException("Please provide your colleague's registration details.");
        }

        // 1. Validate full name
        if (request.getFullName() == null || request.getFullName().trim().isBlank()) {
            throw new IllegalArgumentException("Please enter your colleague's full name (e.g. Maria Santos or Dr. Clara Reyes).");
        }
        String cleanFullName = request.getFullName().trim();

        // 2. Validate campus / staff ID
        if (request.getInstitutionalId() == null || request.getInstitutionalId().trim().isBlank()) {
            throw new IllegalArgumentException("Please provide your colleague's Campus or Staff ID number.");
        }
        String cleanId = request.getInstitutionalId().trim();

        if (userRepository.existsByInstitutionalId(cleanId)) {
            throw new IllegalArgumentException("A campus staff member or student with ID '" + cleanId + "' is already registered in the system.");
        }

        // 3. Validate work email
        if (request.getEmail() == null || request.getEmail().trim().isBlank()) {
            throw new IllegalArgumentException("Please provide your colleague's work email address so their login details can be delivered.");
        }
        String cleanEmail = request.getEmail().trim();
        if (!cleanEmail.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Please check the email format (e.g. name@ustp.edu.ph or name@gmail.com).");
        }

        // 4. Clean professional role & office
        String title = (request.getTitle() != null && !request.getTitle().trim().isBlank())
                ? request.getTitle().trim()
                : "Psychometrician";

        String baseDept = (request.getDepartment() != null && !request.getDepartment().trim().isBlank())
                ? request.getDepartment().trim()
                : "Guidance & Counseling Center";

        String finalDepartment = baseDept.contains(title) ? baseDept : baseDept + " (" + title + ")";

        // 5. Clean optional phone
        String cleanPhone = null;
        if (request.getPhoneNumber() != null && !request.getPhoneNumber().isBlank()) {
            String p = request.getPhoneNumber().trim().replaceAll("[\\s\\-\\(\\)]", "");
            if (p.matches("^(09|\\+639)\\d{9}$")) {
                cleanPhone = p;
            }
        }

        // 6. Generate username & temporary password
        String username = cleanId;
        if (userRepository.existsByUsername(username)) {
            username = cleanId + "-" + RANDOM.nextInt(1000);
        }

        String rawPassword = generateDefaultPassword(cleanFullName, cleanId);

        String assignedRole = "SUPER_ADMIN".equalsIgnoreCase(request.getRole()) || "ADMIN".equalsIgnoreCase(request.getRole())
                ? "SUPER_ADMIN" : "PROFESSIONAL";

        // 7. Save user entity
        User colleague = User.builder()
                .institutionalId(cleanId)
                .username(username)
                .passwordHash(ENCODER.encode(rawPassword))
                .fullName(cleanFullName)
                .email(cleanEmail)
                .phoneNumber(cleanPhone)
                .department(finalDepartment)
                .yearLevel(null)
                .role(assignedRole)
                .active(true)
                .passwordChanged(false)
                .forcePasswordChange(true)
                .build();

        userRepository.save(colleague);

        // 8. Dispatch professional welcome email with credentials via Brevo
        emailService.sendProfessionalWelcomeEmail(
                colleague.getEmail(),
                colleague.getFullName(),
                colleague.getInstitutionalId(),
                colleague.getUsername(),
                rawPassword,
                title
        );

        eventPublisher.publishEvent(new AdminAuditEvent(
                registeredByUsername,
                "STAFF_REGISTERED",
                "INFO",
                "Provisioned " + assignedRole + ": " + cleanFullName + " (" + cleanId + ") as " + title,
                cleanId
        ));

        log.info("Colleague registered successfully: ID={}, name={}, email={}, role={}, title={}, by={}",
                colleague.getInstitutionalId(), colleague.getFullName(), colleague.getEmail(), assignedRole, title, registeredByUsername);

        String successMsg = ("SUPER_ADMIN".equals(assignedRole) || "ADMIN".equals(assignedRole))
                ? "Lead Administrator " + colleague.getFullName() + " was provisioned successfully! A welcome email with temporary sign-in instructions has been sent to " + colleague.getEmail() + "."
                : "Your colleague " + colleague.getFullName() + " (" + title + ") was registered successfully! A welcome email with temporary sign-in instructions has been sent to " + colleague.getEmail() + ".";

        return RegisterUserResponse.builder()
                .institutionalId(colleague.getInstitutionalId())
                .username(colleague.getUsername())
                .generatedPassword(rawPassword)
                .fullName(colleague.getFullName())
                .email(colleague.getEmail())
                .role(colleague.getRole())
                .message(successMsg)
                .build();
    }

    /**
     * Retrieve all registered campus colleagues (Mental Health Professionals and Lead Administrators).
     */
    @Transactional(readOnly = true)
    public List<UserProfileResponse> getColleagues() {
        return userRepository.findByRoleInOrderByFullNameAsc(List.of("PROFESSIONAL", "SUPER_ADMIN", "ADMIN")).stream()
                .map(this::toProfile)
                .collect(Collectors.toList());
    }

    /**
     * Resend a welcome email with temporary login credentials to a registered colleague.
     */
    @Transactional
    public Map<String, String> resendColleagueWelcome(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("Colleague not found with username: " + username));

        if (!"PROFESSIONAL".equalsIgnoreCase(user.getRole()) && !"SUPER_ADMIN".equalsIgnoreCase(user.getRole()) && !"ADMIN".equalsIgnoreCase(user.getRole())) {
            throw new IllegalArgumentException("Specified user is not a mental health professional colleague or administrator.");
        }
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new IllegalArgumentException("Colleague '" + user.getFullName() + "' does not have a work email recorded.");
        }

        String rawPassword = generateDefaultPassword(user.getFullName(), user.getInstitutionalId());
        user.setPasswordHash(ENCODER.encode(rawPassword));
        user.setPasswordChanged(false);
        user.setForcePasswordChange(true);
        userRepository.save(user);

        emailService.sendProfessionalWelcomeEmail(
                user.getEmail(),
                user.getFullName(),
                user.getInstitutionalId(),
                user.getUsername(),
                rawPassword,
                user.getDepartment() != null ? user.getDepartment() : "Campus Counseling Professional"
        );

        log.info("Colleague credentials email resent for {} ({})", user.getUsername(), user.getEmail());
        return Map.of(
                "message", "A new welcome email with sign-in instructions has been sent to " + user.getEmail() + ".",
                "email", user.getEmail(),
                "institutionalId", user.getInstitutionalId(),
                "generatedPassword", rawPassword
        );
    }

    /**
     * Transfer or assign administrative authority.
     * Can transfer primary ownership (caller demotes to PROFESSIONAL)
     * or appoint as co-admin (both remain ADMIN).
     */
    @Transactional
    public TransferAdminResponse transferAdmin(String targetUsername, boolean relinquishAdmin, String callerUsername) {
        if (callerUsername == null || callerUsername.isBlank()) {
            throw new IllegalStateException("Authentication required.");
        }
        User caller = userRepository.findByUsername(callerUsername)
                .orElseThrow(() -> new NoSuchElementException("Current administrator account not found."));

        if (!"SUPER_ADMIN".equalsIgnoreCase(caller.getRole()) && !"ADMIN".equalsIgnoreCase(caller.getRole())) {
            throw new IllegalStateException("Only the Lead Psychometrician (Super Admin) can transfer administrative roles.");
        }

        if (callerUsername.equalsIgnoreCase(targetUsername)) {
            throw new IllegalArgumentException("You are already the Lead Administrator.");
        }

        User target = userRepository.findByUsername(targetUsername)
                .orElseThrow(() -> new NoSuchElementException("Colleague not found with username: " + targetUsername));

        if (!target.isActive()) {
            throw new IllegalArgumentException("Cannot transfer administrative role to an inactive account.");
        }

        // Promote target to SUPER_ADMIN
        target.setRole("SUPER_ADMIN");
        userRepository.save(target);

        // If relinquishing, demote caller to PROFESSIONAL
        if (relinquishAdmin) {
            caller.setRole("PROFESSIONAL");
            userRepository.save(caller);
        }

        log.info("Admin role transfer: target={}, targetRole=SUPER_ADMIN, caller={}, callerRole={}, relinquish={}",
                target.getUsername(), caller.getUsername(), caller.getRole(), relinquishAdmin);

        eventPublisher.publishEvent(new AdminAuditEvent(
                caller.getUsername(),
                "ADMIN_ROLE_TRANSFERRED",
                "WARNING",
                String.format("Lead Admin role transferred to %s (%s). Relinquish=%s",
                        target.getFullName(), target.getUsername(), relinquishAdmin),
                target.getUsername()
        ));

        return TransferAdminResponse.builder()
                .targetUsername(target.getUsername())
                .targetFullName(target.getFullName())
                .targetRole(target.getRole())
                .callerUsername(caller.getUsername())
                .callerRole(caller.getRole())
                .message(relinquishAdmin
                        ? "Lead Admin role transferred successfully to " + target.getFullName() + ". Your account is now a Professional."
                        : "Lead Admin privileges granted successfully to " + target.getFullName() + ".")
                .build();
    }

    /**
     * Update a user's role (SUPER_ADMIN, MAINTENANCE, PROFESSIONAL, STUDENT).
     * Accessible strictly to SUPER_ADMIN, MAINTENANCE, or ADMIN. Primary maintenance account cannot be demoted.
     */
    @Transactional
    public Map<String, String> updateUserRole(String targetUsername, String newRole, String callerUsername) {
        if (targetUsername == null || targetUsername.isBlank()) {
            throw new IllegalArgumentException("Target username is required.");
        }
        if ("maintenance".equalsIgnoreCase(targetUsername)
                && !"MAINTENANCE".equalsIgnoreCase(newRole) && !"ADMIN".equalsIgnoreCase(newRole)) {
            throw new IllegalArgumentException("Cannot change role of primary system infrastructure account.");
        }
        User target = userRepository.findByUsername(targetUsername)
                .orElseThrow(() -> new NoSuchElementException("User not found with username: " + targetUsername));

        String normalizedRole = normalizeRole(newRole);
        String oldRole = target.getRole();
        target.setRole(normalizedRole);
        userRepository.save(target);

        log.info("Admin updated role for user {}: {} -> {} (by {})",
                target.getUsername(), oldRole, normalizedRole, callerUsername);

        eventPublisher.publishEvent(new AdminAuditEvent(
                callerUsername != null ? callerUsername : "SYSTEM",
                "USER_ROLE_UPDATED",
                "WARNING",
                String.format("User %s (%s) role changed from %s to %s",
                        target.getFullName(), target.getUsername(), oldRole, normalizedRole),
                target.getUsername()
        ));

        return Map.of(
                "message", "User " + target.getFullName() + " role updated to " + normalizedRole + ".",
                "username", target.getUsername(),
                "role", normalizedRole
        );
    }

    // ── 3b. Public Self-Registration ──

    @Transactional
    public RegisterUserResponse selfRegister(SelfRegisterRequest request) {
        // Validate required fields
        if (request.getInstitutionalId() == null || request.getInstitutionalId().isBlank())
            throw new IllegalArgumentException("Institutional ID is required.");
        if (request.getFullName() == null || request.getFullName().isBlank())
            throw new IllegalArgumentException("Full name is required.");
        if (request.getEmail() == null || request.getEmail().isBlank())
            throw new IllegalArgumentException("Email address is required.");

        String cleanEmail = request.getEmail().trim();
        if (!cleanEmail.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Please provide a valid email address (e.g. name@ustp.edu.ph or gmail.com).");
        }

        String cleanPhone = null;
        if (request.getPhoneNumber() != null && !request.getPhoneNumber().isBlank()) {
            String p = request.getPhoneNumber().trim().replaceAll("[\\s\\-\\(\\)]", "");
            if (p.matches("^(09|\\+639)\\d{9}$")) {
                cleanPhone = p;
            }
        }

        if (request.getRole() == null || request.getRole().isBlank())
            throw new IllegalArgumentException("Role is required.");
        validatePasswordComplexity(request.getPassword());
        if (!request.getPassword().equals(request.getConfirmPassword()))
            throw new IllegalArgumentException("Passwords do not match.");

        // Check for duplicates
        if (userRepository.existsByInstitutionalId(request.getInstitutionalId())) {
            throw new IllegalArgumentException("An account with this Institutional ID already exists.");
        }

        String username = request.getInstitutionalId();
        if (userRepository.existsByUsername(username)) {
            username = request.getInstitutionalId() + "-" + RANDOM.nextInt(1000);
        }

        // Security: Public self-registration is strictly restricted to STUDENT role only.
        // Professional accounts are provisioned exclusively by the System Administrator.
        String role = "STUDENT";

        User user = User.builder()
                .institutionalId(request.getInstitutionalId().trim())
                .username(username)
                .passwordHash(ENCODER.encode(request.getPassword()))
                .fullName(request.getFullName().trim())
                .email(cleanEmail)
                .phoneNumber(cleanPhone)
                .department(request.getDepartment())
                .yearLevel(request.getYearLevel())
                .role(role)
                .active(true)
                .passwordChanged(true)        // user chose their own password
                .forcePasswordChange(false)   // no forced change needed
                .build();

        userRepository.save(user);

        log.info("Self-registration: institutionalId={}, username={}, email={}, role={}",
                user.getInstitutionalId(), user.getUsername(), user.getEmail(), user.getRole());

        // Asynchronously dispatch official registration confirmation email
        emailService.sendRegistrationConfirmationEmail(
                user.getEmail(),
                user.getFullName(),
                user.getUsername(),
                user.getDepartment(),
                user.getYearLevel()
        );

        return RegisterUserResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .username(user.getUsername())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .role(user.getRole())
                .message("Registration successful! An official confirmation has been sent to your email.")
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
    public void deleteUser(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));
        if ("MAINTENANCE".equalsIgnoreCase(user.getRole()) && "maintenance".equalsIgnoreCase(user.getUsername())) {
            throw new IllegalArgumentException("Cannot delete primary system maintenance account.");
        }
        activeTokens.entrySet().removeIf(entry -> username.equals(entry.getValue()));
        userRepository.delete(user);
        log.info("User deleted by admin: username={}", username);
    }

    @Transactional
    public RegisterUserResponse resetPassword(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));

        String rawPassword = generateDefaultPassword(user.getFullName(), user.getInstitutionalId());
        user.setPasswordHash(ENCODER.encode(rawPassword));
        user.setPasswordChanged(false);
        user.setForcePasswordChange(true);
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        boolean hasEmail = user.getEmail() != null && !user.getEmail().isBlank();
        if (hasEmail) {
            // Send Password Reset email via Brevo REST API (async)
            emailService.sendPasswordResetEmail(user.getEmail(), user.getFullName(), user.getUsername(), rawPassword);
        } else {
            log.warn("Password reset by admin for {} without email. Generated temp password must be conveyed directly.", user.getUsername());
        }

        log.info("Password reset by admin: username={}, hasEmail={}", user.getUsername(), hasEmail);

        String statusMessage = hasEmail
                ? "Password reset successfully. A notification with sign-in instructions has been dispatched to " + user.getEmail() + "."
                : "Password reset successfully. User has no email on file — temporary password is: " + rawPassword;

        return RegisterUserResponse.builder()
                .institutionalId(user.getInstitutionalId())
                .username(user.getUsername())
                .generatedPassword(rawPassword)
                .fullName(user.getFullName())
                .role(user.getRole())
                .message(statusMessage)
                .build();
    }

    @Transactional
    public Map<String, String> resendWelcomeEmail(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + username));

        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new IllegalArgumentException("User '" + username + "' has no email address configured.");
        }

        String rawPassword = generateDefaultPassword(user.getFullName(), user.getInstitutionalId());
        user.setPasswordHash(ENCODER.encode(rawPassword));
        user.setPasswordChanged(false);
        user.setForcePasswordChange(true);
        userRepository.save(user);

        if ("PROFESSIONAL".equalsIgnoreCase(user.getRole()) || "SUPER_ADMIN".equalsIgnoreCase(user.getRole())) {
            emailService.sendProfessionalWelcomeEmail(
                    user.getEmail(),
                    user.getFullName(),
                    user.getInstitutionalId(),
                    user.getUsername(),
                    rawPassword,
                    user.getDepartment() != null ? user.getDepartment() : "Campus Mental Health Professional"
            );
        } else {
            emailService.sendWelcomeEmail(user.getEmail(), user.getFullName(), user.getUsername(), rawPassword);
        }
        log.info("Credentials email resent by admin for username={}, email={}", user.getUsername(), user.getEmail());

        return Map.of("message", "Credentials email with Institutional ID and initial password dispatched to " + user.getEmail(),
                "email", user.getEmail());
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

        // Phone number
        if (request.getPhoneNumber() != null) {
            String phone = request.getPhoneNumber().trim().replaceAll("[\\s\\-\\(\\)]", "");
            if (!phone.isEmpty() && !phone.matches("^(09|\\+639)\\d{9}$")) {
                throw new IllegalArgumentException("Invalid phone number format (e.g. 09123456789).");
            }
            user.setPhoneNumber(phone.isEmpty() ? null : phone);
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

        long students = 0, professionals = 0, admins = 0;
        for (Object[] row : userRepository.countByRole()) {
            String role = (String) row[0];
            long count = ((Number) row[1]).longValue();
            switch (role) {
                case "STUDENT" -> students += count;
                case "PROFESSIONAL" -> professionals += count;
                case "SUPER_ADMIN", "MAINTENANCE", "ADMIN" -> admins += count;
            }
        }

        long pwChanged = userRepository.findAll().stream()
                .filter(u -> u.isPasswordChanged()).count();
        long locked = userRepository.findAll().stream()
                .filter(u -> u.getLockedUntil() != null && u.getLockedUntil().isAfter(LocalDateTime.now()))
                .count();

        return CredentialStatsResponse.builder()
                .totalUsers(total)
                .activeUsers(active)
                .students(students)
                .professionals(professionals)
                .admins(admins)
                .passwordChangedCount(pwChanged)
                .lockedAccounts(locked)
                .build();
    }

    // ── Token Validation ──

    public String validateToken(String token) {
        if (token == null || token.isBlank()) return null;
        String username = activeTokens.get(token);
        if (username != null) return username;

        // Fallback to database lookup if server was restarted
        Optional<User> userOpt = userRepository.findBySessionToken(token);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user.isActive()) {
                activeTokens.put(token, user.getUsername());
                return user.getUsername();
            }
        }
        return null;
    }

    @Transactional
    public void logout(String token) {
        if (token == null || token.isBlank()) return;
        activeTokens.remove(token);
        userRepository.findBySessionToken(token).ifPresent(user -> {
            user.setSessionToken(null);
            userRepository.save(user);
        });
    }

    public int getActiveTokenCount() {
        return activeTokens.size();
    }

    public int purgeTokensExcept(String keepUsername) {
        int initial = activeTokens.size();
        activeTokens.entrySet().removeIf(entry -> keepUsername != null && !entry.getValue().equalsIgnoreCase(keepUsername));
        return initial - activeTokens.size();
    }

    // ── Helpers ──

    public static void validatePasswordComplexity(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("Password must be at least " + MIN_PASSWORD_LENGTH + " characters long.");
        }
        List<String> missing = new ArrayList<>();
        if (!password.matches(".*[A-Z].*")) {
            missing.add("an uppercase letter (A-Z)");
        }
        if (!password.matches(".*[0-9].*")) {
            missing.add("at least one number (0-9)");
        }
        if (!password.matches(".*[^A-Za-z0-9].*")) {
            missing.add("a special symbol (!@#$%...)");
        }
        if (!missing.isEmpty()) {
            throw new IllegalArgumentException("Password rejected: failed to comply with requirements. Missing: " + String.join(", ", missing) + ".");
        }
    }

    private void validateRegistration(RegisterUserRequest req) {
        if (req.getInstitutionalId() == null || req.getInstitutionalId().isBlank())
            throw new IllegalArgumentException("Institutional ID is required.");
        if (req.getFullName() == null || req.getFullName().isBlank())
            throw new IllegalArgumentException("Full Name is required.");
        if (req.getRole() == null || req.getRole().isBlank())
            throw new IllegalArgumentException("Role is required.");

        if (req.getEmail() == null || req.getEmail().isBlank()) {
            throw new IllegalArgumentException("Institutional Email is required so login credentials can be delivered.");
        }
        String cleanEmail = req.getEmail().trim();
        if (!cleanEmail.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Please provide a valid institutional email address (e.g. name@ustp.edu.ph).");
        }
    }

    private String normalizeRole(String role) {
        if (role == null) return "STUDENT";
        return switch (role.toUpperCase().trim()) {
            case "STUDENT", "S" -> "STUDENT";
            case "PROFESSIONAL", "PRO", "P", "COUNSELOR", "PSYCHOLOGIST", "STAFF" -> "PROFESSIONAL";
            case "SUPER_ADMIN", "SUPERADMIN", "LEAD", "LEAD_PSYCHOMETRICIAN" -> "SUPER_ADMIN";
            case "MAINTENANCE", "MAINT", "IT", "DEVOPS" -> "MAINTENANCE";
            case "ADMIN", "A", "SYSADMIN", "ADMINISTRATOR" -> "SUPER_ADMIN";
            default -> throw new IllegalArgumentException("Invalid role: " + role + ". Must be STUDENT, PROFESSIONAL, SUPER_ADMIN, or MAINTENANCE.");
        };
    }

    public String generateDefaultPassword(String fullName, String institutionalId) {
        String cleanLastName = "User";
        char firstInitial = 'U';

        if (fullName != null && !fullName.isBlank()) {
            String[] parts = fullName.trim().split("\\s+");
            String firstPart = parts[0].replaceAll("[^a-zA-Z]", "");
            if (!firstPart.isEmpty()) {
                firstInitial = Character.toUpperCase(firstPart.charAt(0));
            }

            String lastPart = parts[parts.length - 1].replaceAll("[^a-zA-Z0-9]", "");
            if (!lastPart.isEmpty()) {
                cleanLastName = Character.toUpperCase(lastPart.charAt(0)) +
                        (lastPart.length() > 1 ? lastPart.substring(1).toLowerCase() : "");
            }
        }

        String digitsOnly = (institutionalId != null) ? institutionalId.replaceAll("[^0-9]", "") : "";
        String last4Id;
        if (digitsOnly.length() >= 4) {
            last4Id = digitsOnly.substring(digitsOnly.length() - 4);
        } else if (!digitsOnly.isEmpty()) {
            last4Id = String.format("%4s", digitsOnly).replace(' ', '0');
        } else if (institutionalId != null && !institutionalId.isBlank()) {
            String alphaNum = institutionalId.replaceAll("[^a-zA-Z0-9]", "");
            if (alphaNum.length() >= 4) {
                last4Id = alphaNum.substring(alphaNum.length() - 4);
            } else {
                last4Id = String.format("%4s", alphaNum).replace(' ', '0');
            }
        } else {
            last4Id = "2026";
        }

        // Base pattern from Name & ID details: e.g. CruzJ@0452
        StringBuilder base = new StringBuilder();
        base.append(cleanLastName).append(firstInitial).append("@").append(last4Id);

        while (base.length() < MIN_PASSWORD_LENGTH) {
            base.append("0");
        }

        // Generate 4-character high-entropy cryptographic salt (upper, lower, digit, symbol)
        String saltPool = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
        StringBuilder salt = new StringBuilder();
        salt.append("#");
        for (int i = 0; i < 4; i++) {
            salt.append(saltPool.charAt(RANDOM.nextInt(saltPool.length())));
        }

        // Result e.g. CruzJ@0452#k9X!
        return base.toString() + salt.toString();
    }

    private UserProfileResponse toProfile(User u) {
        return UserProfileResponse.builder()
                .id(u.getId())
                .institutionalId(u.getInstitutionalId())
                .username(u.getUsername())
                .fullName(u.getFullName())
                .email(u.getEmail())
                .phoneNumber(u.getPhoneNumber())
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
