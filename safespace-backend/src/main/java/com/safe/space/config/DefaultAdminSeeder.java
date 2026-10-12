package com.safe.space.config;

import com.safe.space.model.User;
import com.safe.space.repository.UserRepository;
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
@Slf4j
public class DefaultAdminSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);
    private static final String DEFAULT_PASSWORD = "SafeSpace2026!";

    @Override
    public void run(ApplicationArguments args) {
        log.info("── Initializing Safe Space Test Database Seeder ──");

        String encodedPassword = ENCODER.encode(DEFAULT_PASSWORD);

        // Check for optional real email override from environment
        String alertEmailOverride = System.getenv("PROFESSIONAL_ALERT_EMAIL");
        if (alertEmailOverride == null || alertEmailOverride.isBlank()) {
            alertEmailOverride = System.getProperty("PROFESSIONAL_ALERT_EMAIL");
        }
        String psychometricianEmail = (alertEmailOverride != null && !alertEmailOverride.isBlank()) ? alertEmailOverride.trim() : "psychometrician@safespace.edu";
        String psychologistEmail = (alertEmailOverride != null && !alertEmailOverride.isBlank()) ? alertEmailOverride.trim() : "psychologist@safespace.edu";

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
        userRepository.findByUsername(username)
            .or(() -> userRepository.findByInstitutionalId(institutionalId))
            .ifPresentOrElse(
            existing -> {
                existing.setInstitutionalId(institutionalId);
                existing.setUsername(username);
                existing.setFullName(fullName);
                existing.setEmail(email);
                existing.setDepartment(department);
                existing.setYearLevel(yearLevel);
                existing.setRole(role);
                existing.setActive(true);
                existing.setPasswordChanged(true);
                existing.setForcePasswordChange(false);
                userRepository.save(existing);
            },
            () -> {
                User user = User.builder()
                        .institutionalId(institutionalId)
                        .username(username)
                        .passwordHash(encodedPassword)
                        .fullName(fullName)
                        .email(email)
                        .department(department)
                        .yearLevel(yearLevel)
                        .role(role)
                        .active(true)
                        .passwordChanged(true)
                        .forcePasswordChange(false)
                        .build();
                userRepository.save(user);
            }
        );
    }
}
