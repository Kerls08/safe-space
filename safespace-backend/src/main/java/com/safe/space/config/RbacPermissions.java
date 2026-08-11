package com.safe.space.config;

import java.util.*;

/**
 * Role-Based Access Control (RBAC) — Permission Matrix.
 *
 * Defines the security framework for two user levels:
 *
 *   STUDENT        — Rant Board, Chat (student side), Calm-Down Kit, Energy Score
 *   PROFESSIONAL   — Full system access: Chat, Dashboard, Monitoring, Crisis Alerts,
 *                     Credential Management, User Management, Resource Linker
 *
 * Design decisions:
 *   - Path-prefix matching with wildcard support (/api/posts/**)
 *   - PUBLIC endpoints require no authentication (login, static resources)
 *   - ANY_AUTHENTICATED requires a valid token but any role
 *   - PROFESSIONAL has unrestricted API access (acts as system admin)
 */
public class RbacPermissions {

    /** Sentinel role meaning "any authenticated user". */
    public static final String ANY_AUTH = "ANY_AUTHENTICATED";

    /**
     * Routes that require no authentication at all.
     * Matched as prefixes (path.startsWith).
     */
    public static final List<String> PUBLIC_PATHS = List.of(
            "/api/auth/login",
            "/api/auth/logout",
            "/api/auth/validate-token",
            // Static resources are handled by Spring's ResourceHandler,
            // not by our interceptor (we only intercept /api/**)
            "/h2-console"
    );

    /**
     * Routes accessible to any authenticated user (any role).
     */
    public static final List<String> ANY_AUTH_PATHS = List.of(
            "/api/auth/change-password",
            "/api/auth/me"
    );

    /**
     * Role → allowed API path prefixes.
     *
     * PROFESSIONAL has full access to ALL /api/** routes (acts as system admin).
     */
    public static final Map<String, List<String>> ROLE_PERMISSIONS = Map.of(

            "STUDENT", List.of(
                    "/api/posts",                   // Rant Board: create, list, get
                    "/api/auto-reply",              // Rule-based auto-reply
                    "/api/calm-down",               // Adaptive Calm-Down Kit
                    "/api/energy",                  // Energy Score submission
                    "/api/chat/sessions",           // Create session, view own sessions
                    "/api/chat/professional-status",// Check counselor availability
                    "/api/resources"                // Resource Linker (read-only)
            ),

            "PROFESSIONAL", List.of(
                    "/api/"                         // Full access to everything
            )
    );

    /**
     * Descriptive permission labels for each role (used by /api/auth/me).
     */
    public static final Map<String, List<String>> ROLE_FEATURES = Map.of(

            "STUDENT", List.of(
                    "rant_board",                   // Post/view rants anonymously
                    "anonymous_chat_student",       // Start chat sessions
                    "calm_down_kit",                // Access adaptive interventions
                    "energy_score_submission",      // Submit energy scores
                    "auto_reply_view",              // View AI auto-replies
                    "counselor_status_view",        // Check counselor online status
                    "resource_linker_view"          // View wellness resources
            ),

            "PROFESSIONAL", List.of(
                    "rant_board_view",              // View student rants
                    "anonymous_chat_professional",  // Accept & respond to sessions
                    "monitoring_dashboard",         // Live emotional trends
                    "crisis_alerts",                // Receive crisis flags
                    "heartbeat_presence",           // Report online status
                    "session_management",           // Close/manage chat sessions
                    "resource_linker_manage",       // Manage wellness resources
                    "credential_management",        // Register/import users
                    "user_management",              // Activate/deactivate/reset
                    "batch_import",                 // Bulk user creation
                    "credential_statistics",        // System credential stats
                    "full_system_access"            // Access all features
            )
    );

    /**
     * Checks if a given path is public (no auth required).
     */
    public static boolean isPublicPath(String path) {
        return PUBLIC_PATHS.stream().anyMatch(path::startsWith);
    }

    /**
     * Checks if a given path is accessible to any authenticated user.
     */
    public static boolean isAnyAuthPath(String path) {
        return ANY_AUTH_PATHS.stream().anyMatch(path::startsWith);
    }

    /**
     * Checks if the given role is authorized for the given API path.
     *
     * Rules:
     *   1. PROFESSIONAL can access everything (acts as system admin)
     *   2. Path is checked against the role's allowed prefixes
     */
    public static boolean isAuthorized(String role, String path) {
        if ("PROFESSIONAL".equals(role)) {
            return true;  // Professional has unrestricted access
        }

        List<String> allowed = ROLE_PERMISSIONS.get(role);
        if (allowed == null) return false;

        return allowed.stream().anyMatch(path::startsWith);
    }

    /**
     * Returns the feature labels for a given role.
     */
    public static List<String> getFeaturesForRole(String role) {
        return ROLE_FEATURES.getOrDefault(role, List.of());
    }

    /**
     * Returns all accessible pages (HTML) for a role.
     */
    public static List<Map<String, String>> getAccessiblePages(String role) {
        List<Map<String, String>> pages = new ArrayList<>();

        switch (role) {
            case "STUDENT" -> {
                pages.add(Map.of("name", "Rant Board", "path", "rant-board.html", "icon", "fas fa-comment-dots"));
                pages.add(Map.of("name", "Anonymous Chat", "path", "anon-chat.html", "icon", "fas fa-comments"));
                pages.add(Map.of("name", "My Profile", "path", "profile.html", "icon", "fas fa-user-circle"));
            }
            case "PROFESSIONAL" -> {
                pages.add(Map.of("name", "Credential Manager", "path", "credential-manager.html", "icon", "fas fa-users-gear"));
                pages.add(Map.of("name", "Rant Board", "path", "rant-board.html", "icon", "fas fa-comment-dots"));
                pages.add(Map.of("name", "Anonymous Chat", "path", "anon-chat.html", "icon", "fas fa-comments"));
                pages.add(Map.of("name", "Monitoring Dashboard", "path", "pro-dashboard.html", "icon", "fas fa-chart-line"));
                pages.add(Map.of("name", "Crisis Alerts", "path", "crisis-alerts.html", "icon", "fas fa-bell"));
                pages.add(Map.of("name", "Resource Manager", "path", "resource-manager.html", "icon", "fas fa-hand-holding-heart"));
                pages.add(Map.of("name", "My Profile", "path", "profile.html", "icon", "fas fa-user-circle"));
            }
        }

        return pages;
    }
}
