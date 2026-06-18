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
 * Seeds the default psychometrician (admin) account on startup.
 *
 * The psychometrician handles both counseling duties AND system
 * administration (credential management, user imports, etc.)
 * since the university has no dedicated MIS staff.
 *
 * Default credentials (for development):
 *   Username: admin
 *   Password: SafeSpace2026!
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DefaultAdminSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.existsByUsername("admin")) {
            log.info("Default admin account already exists — skipping seed.");
            return;
        }

        User admin = User.builder()
                .institutionalId("PROF-001")
                .username("admin")
                .passwordHash(ENCODER.encode("SafeSpace2026!"))
                .fullName("Psychometrician")
                .email("admin@safespace.edu")
                .department("Guidance & Counseling")
                .role("PROFESSIONAL")
                .active(true)
                .passwordChanged(true)
                .forcePasswordChange(false)
                .build();

        userRepository.save(admin);
        log.info("Default psychometrician (admin) account created: username=admin, role=PROFESSIONAL");
    }
}
