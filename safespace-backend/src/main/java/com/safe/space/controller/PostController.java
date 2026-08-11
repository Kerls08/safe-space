package com.safe.space.controller;

import com.safe.space.dto.PostRequest;
import com.safe.space.dto.PostResponse;
import com.safe.space.service.PostService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Refined Anonymous Rant Board REST controller.
 *
 * RBAC integration:
 *   - POST /api/posts              → Any authenticated user (auto-links ownerUsername)
 *   - GET  /api/posts              → Any authenticated user (paginated Peer Mirror feed)
 *   - GET  /api/posts/mine         → Authenticated user's own posts
 *   - GET  /api/posts/flagged      → PROFESSIONAL only
 *   - GET  /api/posts/unreviewed   → PROFESSIONAL only
 *   - PUT  /api/posts/{id}/review  → PROFESSIONAL (mark as reviewed)
 *   - GET  /api/posts/stats        → PROFESSIONAL (dashboard stats)
 *   - GET  /api/posts/{postId}     → Any authenticated user
 *   - DELETE /api/posts/{postId}   → PROFESSIONAL only
 *
 * Auth context is injected by AuthInterceptor as request attributes:
 *   auth.username, auth.role, auth.user
 */
@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    /**
     * Create a new anonymous post.
     * The authenticated user's username is linked for audit (but never exposed).
     */
    @PostMapping
    public ResponseEntity<PostResponse> createPost(
            @RequestBody PostRequest request,
            HttpServletRequest httpRequest) {
        String username = (String) httpRequest.getAttribute("auth.username");
        PostResponse response = postService.createPost(request, username);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Paginated Peer Mirror feed (newest first).
     * Students see sanitized responses (no flagged keywords or severity).
     *
     * @param page    zero-based page index (default 0)
     * @param size    page size (default 20, max 50)
     * @param emotion optional emotion filter (e.g. "Sad", "Angry")
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getPosts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String emotion) {
        size = Math.min(size, 50);
        return ResponseEntity.ok(postService.getPostsPaginated(page, size, emotion));
    }

    /**
     * Get the current user's own posts.
     */
    @GetMapping("/mine")
    public ResponseEntity<List<PostResponse>> getMyPosts(HttpServletRequest httpRequest) {
        String username = (String) httpRequest.getAttribute("auth.username");
        if (username == null) {
            return ResponseEntity.ok(List.of());
        }
        return ResponseEntity.ok(postService.getMyPosts(username));
    }

    /**
     * Retrieve all crisis-flagged posts.
     * Intended for PROFESSIONAL and ADMIN roles (enforced by RBAC interceptor
     * since this is under /api/posts which students can access —
     * role check done in-controller for flagged-specific endpoints).
     */
    @GetMapping("/flagged")
    public ResponseEntity<?> getFlaggedPosts(HttpServletRequest httpRequest) {
        String role = (String) httpRequest.getAttribute("auth.role");
        if (!"PROFESSIONAL".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only professionals can view flagged posts."));
        }
        return ResponseEntity.ok(postService.getFlaggedPosts());
    }

    /**
     * Retrieve unreviewed flagged posts (priority queue for professionals).
     */
    @GetMapping("/unreviewed")
    public ResponseEntity<?> getUnreviewedPosts(HttpServletRequest httpRequest) {
        String role = (String) httpRequest.getAttribute("auth.role");
        if (!"PROFESSIONAL".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only professionals can view unreviewed posts."));
        }
        return ResponseEntity.ok(postService.getUnreviewedFlaggedPosts());
    }

    /**
     * Mark a flagged post as reviewed by the current professional.
     */
    @PutMapping("/{postId}/review")
    public ResponseEntity<?> reviewPost(
            @PathVariable String postId,
            HttpServletRequest httpRequest) {
        String role = (String) httpRequest.getAttribute("auth.role");
        String username = (String) httpRequest.getAttribute("auth.username");
        if (!"PROFESSIONAL".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only professionals can review posts."));
        }
        return ResponseEntity.ok(postService.reviewPost(postId, username));
    }

    /**
     * Rant board statistics for the monitoring dashboard.
     */
    @GetMapping("/stats")
    public ResponseEntity<?> getPostStats(HttpServletRequest httpRequest) {
        String role = (String) httpRequest.getAttribute("auth.role");
        if (!"PROFESSIONAL".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only professionals can view post stats."));
        }
        return ResponseEntity.ok(postService.getPostStats());
    }

    /**
     * Retrieve a single post by its public postId.
     */
    @GetMapping("/{postId}")
    public ResponseEntity<PostResponse> getPost(@PathVariable String postId) {
        PostResponse response = postService.getPostByPostId(postId);
        return ResponseEntity.ok(response);
    }

    /**
     * Delete a post (professional only).
     */
    @DeleteMapping("/{postId}")
    public ResponseEntity<?> deletePost(
            @PathVariable String postId,
            HttpServletRequest httpRequest) {
        String role = (String) httpRequest.getAttribute("auth.role");
        if (!"PROFESSIONAL".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only professionals can delete posts."));
        }
        postService.deletePost(postId);
        return ResponseEntity.noContent().build();
    }

    // ── Exception handlers ──

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidation(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }
}
