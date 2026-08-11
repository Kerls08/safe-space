package com.safe.space.controller;

import com.safe.space.config.RbacPermissions;
import com.safe.space.dto.AuthDTOs.*;
import com.safe.space.model.User;
import com.safe.space.service.CredentialService;
import com.safe.space.service.FileImportService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST controller for Pre-registered Credentials.
 *
 * Authentication:
 *   POST   /api/auth/login                      — User login
 *   POST   /api/auth/logout                     — Logout (invalidate token)
 *   POST   /api/auth/change-password            — Change password
 *
 * User Management (Admin):
 *   POST   /api/auth/register                   — Register single user
 *   POST   /api/auth/batch-import               — Batch import users (JSON)
 *   POST   /api/auth/file-import                — Batch import from Excel/CSV file
 *   GET    /api/auth/import-template             — Download import template
 *   GET    /api/auth/users?role=STUDENT          — List users by role
 *   GET    /api/auth/users/{username}            — Get user profile
 *   GET    /api/auth/users/search?q=...          — Search users
 *   PUT    /api/auth/users/{username}/toggle     — Activate/deactivate user
 *   POST   /api/auth/users/{username}/reset      — Reset password (admin)
 *
 * Profile (self-service):
 *   PUT    /api/auth/me/profile                  — Update own profile
 *
 * Analytics:
 *   GET    /api/auth/stats                       — Credential statistics
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class CredentialController {

    private final CredentialService credentialService;
    private final FileImportService fileImportService;

    // ── Authentication ──

    /**
     * User login with pre-registered credentials.
     * Accepts both username and institutional ID as the login identifier.
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        LoginResponse response = credentialService.login(request);
        return ResponseEntity.ok(response);
    }

    /**
     * Logout — invalidate the session token.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestBody Map<String, String> body) {
        String token = body.getOrDefault("token", "");
        credentialService.logout(token);
        return ResponseEntity.ok(Map.of("message", "Logged out successfully."));
    }

    /**
     * Change password (user-initiated or forced on first login).
     */
    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(@RequestBody ChangePasswordRequest request) {
        return ResponseEntity.ok(credentialService.changePassword(request));
    }

    // ── Admin: User Registration ──

    /**
     * Register a single user from the institutional directory.
     * Returns the generated username and initial password.
     */
    @PostMapping("/register")
    public ResponseEntity<RegisterUserResponse> registerUser(@RequestBody RegisterUserRequest request) {
        RegisterUserResponse response = credentialService.registerUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Batch import users from the institutional student directory.
     * Accepts a list of user records and creates accounts with generated passwords.
     */
    @PostMapping("/batch-import")
    public ResponseEntity<BatchImportResponse> batchImport(@RequestBody BatchImportRequest request) {
        BatchImportResponse response = credentialService.batchImport(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Batch import users from an uploaded Excel (.xlsx/.xls) or CSV file.
     * The file should have columns: Institutional ID, Full Name, Email, Department, Year Level, Role.
     * Column headers are matched flexibly (case-insensitive, supports aliases).
     */
    @PostMapping("/file-import")
    public ResponseEntity<BatchImportResponse> fileImport(@RequestParam("file") MultipartFile file) {
        BatchImportResponse response = fileImportService.importFromFile(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Download an import template file.
     * @param format "xlsx" (default) or "csv"
     */
    @GetMapping("/import-template")
    public ResponseEntity<byte[]> downloadTemplate(
            @RequestParam(defaultValue = "xlsx") String format) {

        if ("csv".equalsIgnoreCase(format)) {
            String csv = fileImportService.generateCsvTemplate();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=safe-space-import-template.csv")
                    .contentType(MediaType.parseMediaType("text/csv"))
                    .body(csv.getBytes());
        } else {
            byte[] excel = fileImportService.generateExcelTemplate();
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=safe-space-import-template.xlsx")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(excel);
        }
    }

    // ── User Management ──

    /**
     * List users by role: STUDENT, PROFESSIONAL, ADMIN.
     */
    @GetMapping("/users")
    public ResponseEntity<List<UserProfileResponse>> getUsersByRole(
            @RequestParam(defaultValue = "STUDENT") String role) {
        return ResponseEntity.ok(credentialService.getUsersByRole(role));
    }

    /**
     * Get a specific user's profile.
     */
    @GetMapping("/users/{username}")
    public ResponseEntity<UserProfileResponse> getUserProfile(@PathVariable String username) {
        return ResponseEntity.ok(credentialService.getUserProfile(username));
    }

    /**
     * Search users by name or institutional ID.
     */
    @GetMapping("/users/search")
    public ResponseEntity<List<UserProfileResponse>> searchUsers(@RequestParam String q) {
        return ResponseEntity.ok(credentialService.searchUsers(q));
    }

    /**
     * Toggle user active/inactive status (admin action).
     */
    @PutMapping("/users/{username}/toggle")
    public ResponseEntity<Map<String, String>> toggleUserActive(@PathVariable String username) {
        return ResponseEntity.ok(credentialService.toggleUserActive(username));
    }

    /**
     * Admin-initiated password reset. Generates a new temporary password.
     */
    @PostMapping("/users/{username}/reset")
    public ResponseEntity<RegisterUserResponse> resetPassword(@PathVariable String username) {
        return ResponseEntity.ok(credentialService.resetPassword(username));
    }

    // ── Analytics ──

    /**
     * Credential system statistics.
     */
    @GetMapping("/stats")
    public ResponseEntity<CredentialStatsResponse> getStats() {
        return ResponseEntity.ok(credentialService.getStats());
    }

    // ── Validate Token (internal use) ──

    /**
     * Validate a session token and return the associated username.
     */
    @PostMapping("/validate-token")
    public ResponseEntity<Map<String, Object>> validateToken(@RequestBody Map<String, String> body) {
        String token = body.getOrDefault("token", "");
        String username = credentialService.validateToken(token);
        if (username != null) {
            return ResponseEntity.ok(Map.of("valid", true, "username", username));
        }
        return ResponseEntity.ok(Map.of("valid", false));
    }

    // ── RBAC: Current User Profile ──

    /**
     * Returns the authenticated user's profile, role, features, and accessible pages.
     * Requires a valid session token (any role).
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser(HttpServletRequest request) {
        User user = (User) request.getAttribute("auth.user");
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Not authenticated."));
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("username", user.getUsername());
        response.put("fullName", user.getFullName());
        response.put("email", user.getEmail());
        response.put("role", user.getRole());
        response.put("institutionalId", user.getInstitutionalId());
        response.put("department", user.getDepartment());
        response.put("yearLevel", user.getYearLevel());
        response.put("active", user.isActive());
        response.put("passwordChanged", user.isPasswordChanged());
        response.put("createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : null);
        response.put("lastLoginAt", user.getLastLoginAt() != null ? user.getLastLoginAt().toString() : null);
        response.put("features", RbacPermissions.getFeaturesForRole(user.getRole()));
        response.put("accessiblePages", RbacPermissions.getAccessiblePages(user.getRole()));
        response.put("permissions", RbacPermissions.ROLE_PERMISSIONS.getOrDefault(user.getRole(), List.of()));

        return ResponseEntity.ok(response);
    }

    /**
     * Update the authenticated user's own profile.
     * Only fullName, email, department, and yearLevel can be modified.
     */
    @PutMapping("/me/profile")
    public ResponseEntity<UserProfileResponse> updateProfile(
            HttpServletRequest request,
            @RequestBody UpdateProfileRequest profileRequest) {

        User user = (User) request.getAttribute("auth.user");
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        UserProfileResponse updated = credentialService.updateProfile(user.getUsername(), profileRequest);
        return ResponseEntity.ok(updated);
    }

    /**
     * Returns the RBAC permission matrix for a specific role or all roles.
     * Public-ish endpoint, but requires authentication.
     */
    @GetMapping("/permissions")
    public ResponseEntity<Map<String, Object>> getPermissions(
            @RequestParam(required = false) String role) {
        Map<String, Object> response = new LinkedHashMap<>();

        if (role != null && !role.isBlank()) {
            String normalizedRole = role.toUpperCase().trim();
            response.put("role", normalizedRole);
            response.put("features", RbacPermissions.getFeaturesForRole(normalizedRole));
            response.put("accessiblePages", RbacPermissions.getAccessiblePages(normalizedRole));
            response.put("apiPrefixes", RbacPermissions.ROLE_PERMISSIONS.getOrDefault(normalizedRole, List.of()));
        } else {
            response.put("roles", Map.of(
                    "STUDENT", Map.of(
                            "features", RbacPermissions.getFeaturesForRole("STUDENT"),
                            "pages", RbacPermissions.getAccessiblePages("STUDENT"),
                            "apiPrefixes", RbacPermissions.ROLE_PERMISSIONS.get("STUDENT")
                    ),
                    "PROFESSIONAL", Map.of(
                            "features", RbacPermissions.getFeaturesForRole("PROFESSIONAL"),
                            "pages", RbacPermissions.getAccessiblePages("PROFESSIONAL"),
                            "apiPrefixes", RbacPermissions.ROLE_PERMISSIONS.get("PROFESSIONAL")
                    )
            ));
        }

        return ResponseEntity.ok(response);
    }

    // ── Exception Handlers ──

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidation(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }
}
