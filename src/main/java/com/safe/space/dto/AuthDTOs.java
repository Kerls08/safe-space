package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * DTOs for the Pre-registered Credentials system.
 */
public class AuthDTOs {

    // ── Login ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class LoginRequest {
        private String username;
        private String password;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class LoginResponse {
        private String token;
        private String username;
        private String fullName;
        private String role;
        private boolean forcePasswordChange;
        private String message;
    }

    // ── Password Change ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class ChangePasswordRequest {
        private String username;
        private String currentPassword;
        private String newPassword;
    }

    // ── Admin: Single User Registration ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class RegisterUserRequest {
        private String institutionalId;
        private String fullName;
        private String email;
        private String department;
        private String yearLevel;
        private String role; // STUDENT, PROFESSIONAL
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class RegisterUserResponse {
        private String institutionalId;
        private String username;
        private String generatedPassword;
        private String fullName;
        private String role;
        private String message;
    }

    // ── Admin: Batch Import ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class BatchImportRequest {
        private List<RegisterUserRequest> users;
    }

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class BatchImportResponse {
        private int totalRequested;
        private int successCount;
        private int skippedCount;
        private int failedCount;
        private List<RegisterUserResponse> created;
        private List<String> errors;
    }

    // ── User Profile (safe view — no password) ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class UserProfileResponse {
        private Long id;
        private String institutionalId;
        private String username;
        private String fullName;
        private String email;
        private String department;
        private String yearLevel;
        private String role;
        private boolean active;
        private boolean passwordChanged;
        private String createdAt;
        private String lastLoginAt;
    }

    // ── Admin: Stats ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class CredentialStatsResponse {
        private long totalUsers;
        private long activeUsers;
        private long students;
        private long professionals;
        private long admins;
        private long passwordChangedCount;
        private long lockedAccounts;
    }
    // ── User Profile Update (self-service) ──

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class UpdateProfileRequest {
        private String username;
        private String fullName;
        private String email;
        private String department;
        private String yearLevel;
    }
}
