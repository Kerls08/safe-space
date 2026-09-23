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
 * Seeds the default System Administrator (admin) account on startup.
 *
 * The System Administrator is the sole technical custodian of accounts,
 * credential management, and user provisioning.
 * Clinical counseling is handled separately by registered professionals.
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
        userRepository.findByUsername("admin").ifPresentOrElse(
            admin -> {
                if (!"ADMIN".equals(admin.getRole())) {
                    admin.setRole("ADMIN");
                    admin.setFullName("System Administrator");
                    admin.setDepartment("Campus IT / System Administration");
                    userRepository.save(admin);
                    log.info("Migrated existing 'admin' user account to role=ADMIN");
                } else {
                    log.info("Default admin account already configured with role=ADMIN.");
                }
            },
            () -> {
                User admin = User.builder()
                        .institutionalId("ADMIN-001")
                        .username("admin")
                        .passwordHash(ENCODER.encode("SafeSpace2026!"))
                        .fullName("System Administrator")
                        .email("admin@safespace.edu")
                        .department("Campus IT / System Administration")
                        .role("ADMIN")
                        .active(true)
                        .passwordChanged(true)
                        .forcePasswordChange(false)
                        .build();

                userRepository.save(admin);
                log.info("Default System Administrator account created: username=admin, role=ADMIN");
            }
        );
    }
}

