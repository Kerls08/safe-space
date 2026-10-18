package com.safe.space.config;

import com.safe.space.model.User;
import com.safe.space.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds exactly one default test account per role on startup:
 *   1. MAINTENANCE  - IT Infrastructure & System Maintenance (username: maintenance)
 *   2. SUPER_ADMIN  - Lead Psychometrician / Clinic Head (username: psychometrician)
 *   3. PROFESSIONAL - Staff Psychologist (username: psychologist)
 *   4. STUDENT      - University Student (username: student)
 *
 * All seeded test accounts share the unified password:
 *   Password: SafeSpace2026!
 */
@Component
@Slf4j
public class DefaultAdminSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final com.safe.space.service.CredentialService credentialService;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);
    private static final String DEFAULT_PASSWORD = "SafeSpace2026!";

    public DefaultAdminSeeder(UserRepository userRepository,
                              com.safe.space.service.CredentialService credentialService,
                              org.springframework.jdbc.core.JdbcTemplate jdbcTemplate) {
        this.userRepository = userRepository;
        this.credentialService = credentialService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("── Initializing Safe Space Test Database Seeder ──");

        try {
            jdbcTemplate.execute("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS deleted_by_student BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS deleted_by_professional BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("UPDATE chat_sessions SET deleted_by_student = FALSE WHERE deleted_by_student IS NULL");
            jdbcTemplate.execute("UPDATE chat_sessions SET deleted_by_professional = FALSE WHERE deleted_by_professional IS NULL");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived_by VARCHAR(50)");
            jdbcTemplate.execute("UPDATE crisis_alerts SET archived = FALSE WHERE archived IS NULL");
            jdbcTemplate.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP");
            jdbcTemplate.execute("UPDATE posts SET archived = FALSE WHERE archived IS NULL");
            jdbcTemplate.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delivered BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("UPDATE chat_messages SET delivered = FALSE WHERE delivered IS NULL");
            log.info("Schema integrity verified for chat_sessions, chat_messages, crisis_alerts, and posts tables.");
        } catch (Exception e) {
            log.warn("Database column check on schema tables: {}", e.getMessage());
        }

        String encodedPassword = ENCODER.encode(DEFAULT_PASSWORD);

        // Check for optional real email override from environment
        String alertEmailOverride = System.getenv("PROFESSIONAL_ALERT_EMAIL");
        if (alertEmailOverride == null || alertEmailOverride.isBlank()) {
            alertEmailOverride = System.getProperty("PROFESSIONAL_ALERT_EMAIL");
        }
        String psychometricianEmail = (alertEmailOverride != null && !alertEmailOverride.isBlank()) ? alertEmailOverride.trim() : "psychometrician@safespace.edu";
        String psychologistEmail = (alertEmailOverride != null && !alertEmailOverride.isBlank()) ? alertEmailOverride.trim() : "psychologist@safespace.edu";

        // Purge legacy "admin" / "ADMIN-001" account if present in the database
        userRepository.findByUsername("admin").ifPresent(legacy -> {
            log.info("Purging legacy admin account: username={}, id={}", legacy.getUsername(), legacy.getInstitutionalId());
            userRepository.delete(legacy);
        });
        userRepository.findByInstitutionalId("ADMIN-001").ifPresent(legacy -> {
            log.info("Purging legacy admin account by institutionalId: {}", legacy.getInstitutionalId());
            userRepository.delete(legacy);
        });

        // 1. Maintenance (IT / Developer - Infrastructure & Telemetry)
        seedUser("IT-DEV-001", "maintenance", "System Maintenance Engineer", "maintenance@safespace.edu",
                "IT & Platform Services", null, "MAINTENANCE", encodedPassword);

        // 2. Super Admin (Lead Psychometrician - Clinic & Counseling Head)
        seedUser("RPM-001", "psychometrician", "Lead Psychometrician, RPM", psychometricianEmail,
                "Guidance & Counseling Center (Clinic Head)", null, "SUPER_ADMIN", encodedPassword);

        // 3. Professional (Staff Psychologist)
        seedUser("RPSY-001", "psychologist", "Dr. Clara Reyes, RPsy", psychologistEmail,
                "Guidance & Counseling Center (Staff Psychologist)", null, "PROFESSIONAL", encodedPassword);

        // 4. Student (University Student)
        seedUser("2024-STU-001", "student", "Juan Dela Cruz", "student@safespace.edu",
                "College of Information Technology", "2nd Year", "STUDENT", encodedPassword);

        log.info("── Seeded 4 test accounts (1 Maintenance, 1 Super Admin Psychometrician, 1 Psychologist, 1 Student) ──");
    }

    private void seedUser(String institutionalId, String username, String fullName, String email,
                          String department, String yearLevel, String role, String encodedPassword) {
        String seedToken = "session-seed-" + username;

        userRepository.findByUsername(username)
            .or(() -> userRepository.findByInstitutionalId(institutionalId))
            .ifPresentOrElse(
            existing -> {
                existing.setInstitutionalId(institutionalId);
                existing.setUsername(username);
                existing.setFullName(fullName);
                // Update email if provided
                if (email != null && !email.isBlank()) {
                    existing.setEmail(email.trim());
                }
                existing.setDepartment(department);
                existing.setYearLevel(yearLevel);
                existing.setRole(role);
                existing.setActive(true);
                existing.setPasswordChanged(true);
                existing.setForcePasswordChange(false);

                // Preserve existing session token if already active, or establish deterministic seed token
                String effectiveToken = existing.getSessionToken();
                if (effectiveToken == null || effectiveToken.isBlank()) {
                    effectiveToken = seedToken;
                    existing.setSessionToken(effectiveToken);
                }
                userRepository.save(existing);

                // Register both the active token and the seed token for testing resilience
                credentialService.registerActiveToken(effectiveToken, username);
                credentialService.registerActiveToken(seedToken, username);
            },
            () -> {
                User user = User.builder()
                        .institutionalId(institutionalId)
                        .username(username)
                        .passwordHash(encodedPassword)
                        .fullName(fullName)
                        .email(email != null ? email.trim() : null)
                        .department(department)
                        .yearLevel(yearLevel)
                        .role(role)
                        .sessionToken(seedToken)
                        .active(true)
                        .passwordChanged(true)
                        .forcePasswordChange(false)
                        .build();
                userRepository.save(user);

                // Register token in memory
                credentialService.registerActiveToken(seedToken, username);
            }
        );
    }
}
