package com.safe.space.config;

import com.safe.space.model.User;
import com.safe.space.repository.UserRepository;
import com.safe.space.service.CredentialService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.Optional;

/**
 * RBAC Authentication & Authorization Interceptor.
 *
 * Intercepts all /api/** requests and enforces:
 *
 *   1. Token Extraction — from "Authorization: Bearer <token>" header
 *   2. Token Validation — via CredentialService token store
 *   3. User Lookup      — resolves username → User entity → role
 *   4. Path Authorization — checks role against RbacPermissions matrix
 *
 * Request attributes set on success:
 *   - "auth.username"  — the authenticated user's username
 *   - "auth.role"      — the authenticated user's role
 *   - "auth.user"      — the full User entity
 *
 * Error responses:
 *   - 401 Unauthorized — missing/invalid/expired token
 *   - 403 Forbidden    — valid token but insufficient role permissions
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuthInterceptor implements HandlerInterceptor {

    private final CredentialService credentialService;
    private final UserRepository userRepository;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        String path = request.getRequestURI();
        String method = request.getMethod();

        // Allow preflight CORS requests
        if ("OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }

        // 1. Check if path is public (no auth required)
        if (RbacPermissions.isPublicPath(path)) {
            return true;
        }

        // 2. Extract token from Authorization header
        String token = extractToken(request);
        if (token == null) {
            sendError(request, response, HttpServletResponse.SC_UNAUTHORIZED,
                    "Authentication required. Provide Authorization: Bearer <token> header.");
            return false;
        }

        // 3. Validate token → get username
        String username = credentialService.validateToken(token);
        if (username == null) {
            sendError(request, response, HttpServletResponse.SC_UNAUTHORIZED,
                    "Invalid or expired session token. Please log in again.");
            return false;
        }

        // 4. Look up user → get role
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isEmpty()) {
            sendError(request, response, HttpServletResponse.SC_UNAUTHORIZED,
                    "User account not found. Token invalidated.");
            return false;
        }

        User user = userOpt.get();

        // 5. Check account is still active
        if (!user.isActive()) {
            sendError(request, response, HttpServletResponse.SC_FORBIDDEN,
                    "Account is deactivated. Contact your administrator.");
            return false;
        }

        String role = user.getRole();

        // 6. Set request attributes for downstream controllers
        request.setAttribute("auth.username", username);
        request.setAttribute("auth.role", role);
        request.setAttribute("auth.user", user);

        // 7. Check if path is accessible to any authenticated user
        if (RbacPermissions.isAnyAuthPath(path)) {
            log.debug("RBAC: {} {} — user={} role={} — ANY_AUTH ✓", method, path, username, role);
            return true;
        }

        // 8. Check role-based authorization
        if (!RbacPermissions.isAuthorized(role, path)) {
            log.warn("RBAC DENIED: {} {} — user={} role={}", method, path, username, role);
            sendError(request, response, HttpServletResponse.SC_FORBIDDEN,
                    "Access denied. Your role (" + role + ") does not have permission for this resource.");
            return false;
        }

        log.debug("RBAC: {} {} — user={} role={} ✓", method, path, username, role);
        return true;
    }

    /**
     * Extract Bearer token from Authorization header.
     * Supports: "Bearer <token>" and raw "<token>" formats.
     */
    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && !header.isBlank()) {
            if (header.startsWith("Bearer ")) {
                return header.substring(7).trim();
            }
            return header.trim();
        }

        // Fallback: check query parameter (for dev convenience)
        String param = request.getParameter("token");
        return (param != null && !param.isBlank()) ? param : null;
    }

    /**
     * Send a JSON error response with CORS headers.
     * CORS headers are added explicitly so cross-origin clients can read
     * the error status and handle it properly (e.g. redirect to login on 401).
     */
    private void sendError(HttpServletRequest request, HttpServletResponse response, int status, String message) throws IOException {
        // Add CORS headers so the browser allows the frontend to read the error
        String origin = request.getHeader("Origin");
        if (origin != null) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
            response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        }
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        String json = "{\"error\":\"" + message.replace("\"", "\\'") + "\",\"status\":" + status + "}";
        response.getWriter().write(json);
    }
}
