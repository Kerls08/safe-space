package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * User entity for the Safe Space platform.
 *
 * Users self-register with their institutional credentials and chosen password.
 * Professionals (psychometricians) can also be registered by other professionals.
 *
 * Roles:
 *   STUDENT       — Anonymous rant posting, chat initiation
 *   PROFESSIONAL  — Chat acceptance, session management, monitoring, credential management
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Institutional ID (e.g., student number: 2021-00001). */
    @Column(nullable = false, unique = true, length = 50)
    private String institutionalId;

    /** Login username — defaults to institutional ID if not set. */
    @Column(nullable = false, unique = true, length = 50)
    private String username;

    /** BCrypt-hashed password. */
    @Column(nullable = false)
    private String passwordHash;

    /** Full name (from directory). */
    @Column(nullable = false, length = 200)
    private String fullName;

    /** Email (from directory). */
    @Column(length = 200)
    private String email;

    /** Mobile/Phone number for SMS alerts and account recovery. */
    @Column(length = 30)
    private String phoneNumber;

    /** Department / Program (from directory). */
    @Column(length = 200)
    private String department;

    /** Year level (for students). */
    @Column(length = 20)
    private String yearLevel;

    /** Role: STUDENT, PROFESSIONAL. */
    @Column(nullable = false, length = 20)
    private String role;

    /** Whether the account is active. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /** Whether the user has changed their initial password. */
    @Column(nullable = false)
    @Builder.Default
    private boolean passwordChanged = false;

    /** Whether the user must change password on next login. */
    @Column(nullable = false)
    @Builder.Default
    private boolean forcePasswordChange = true;

    /** Timestamp when the account was created. */
    @Column(nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Last login timestamp. */
    @Column
    private LocalDateTime lastLoginAt;

    /** Number of failed login attempts (for lockout). */
    @Column(nullable = false)
    @Builder.Default
    private int failedAttempts = 0;

    /** Account locked until this timestamp (null = not locked). */
    @Column
    private LocalDateTime lockedUntil;
}
