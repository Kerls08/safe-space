package com.safe.space.service;

import com.safe.space.dto.CalmDownPrescription;
import com.safe.space.dto.PostRequest;
import com.safe.space.dto.PostResponse;
import com.safe.space.model.Post;
import com.safe.space.model.WellnessResource;
import com.safe.space.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Refined Anonymous Rant Board service.
 *
 * Ethical flow (per psychometrician recommendation):
 *   - Crisis keyword posts are SAVED as flagged — hidden from Peer Mirror but
 *     visible to professionals. The student receives contextual resources and a
 *     Calm-Down Kit. A Crisis Alert is generated for psychometrician intervention.
 *   - Profanity-only posts (no crisis keywords) are BLOCKED entirely.
 *   - Clean posts are saved and visible to peers on the Peer Mirror feed.
 *
 * Integration with platform subsystems:
 *   1. RBAC              — Accepts authenticated username, maps to persistent pseudonym
 *   2. SensitiveWords    — Unified scan for crisis keywords + profanity
 *   3. AutoReply         — Generates emotion+energy-aware auto-reply on clean posts
 *   4. CrisisAlerts      — Alerts professionals about crisis posts and high energy
 *   5. CalmDownKit       — Prescribes adaptive calming exercises for crisis posts
 *   6. ResourceLinker    — Contextual wellness resources for crisis + normal posts
 *   7. Dashboard         — Posts feed into monitoring trends
 *   8. EnergyScore       — Energy analytics derived from post data
 *
 * Privacy model:
 *   - ownerUsername stored for audit but NEVER exposed in API responses
 *   - Pseudonym is deterministic (hash-based) so same user = same pseudonym
 *   - Professionals can review/acknowledge flagged posts
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PostService {

    private final PostRepository postRepository;
    private final AutoReplyService autoReplyService;
    private final CrisisAlertService crisisAlertService;
    private final SensitiveWordService sensitiveWordService;
    private final ResourceLinkerService resourceLinkerService;
    private final CalmDownKitService calmDownKitService;

    private static final List<String> VALID_EMOTIONS = List.of(
            "Sad", "Angry", "Anxious", "Lonely",
            "Frustrated", "Neutral", "Relieved", "Happy"
    );

    private static final List<String> PSEUDONYM_ADJECTIVES = List.of(
            "Gentle", "Quiet", "Brave", "Calm", "Kind",
            "Bright", "Warm", "Soft", "Steady", "Still"
    );

    private static final List<String> PSEUDONYM_NOUNS = List.of(
            "Willow", "Nova", "Echo", "Sol", "River",
            "Sky", "Leaf", "Sage", "Mira", "Cloud"
    );

    // ── 1. Create Post (RBAC-aware) ──

    /**
     * Create a new anonymous post.
     *
     * Ethical flow (per psychometrician recommendation):
     *   1. Validate input
     *   2. Scan for ALL sensitive words (crisis keywords + profanity)
     *   3. If CRISIS keywords  → SAVE as flagged (hidden from peers), generate Crisis Alert,
     *                            return resources + Calm-Down Kit to the student
     *   4. If PROFANITY only   → BLOCK the post entirely (never saved)
     *   5. If clean             → save normally, visible to peers
     *
     * Crisis posts are hidden from the Peer Mirror but saved for professional review.
     * The student is not rejected — they receive supportive resources instead.
     *
     * @param request  Post content, emotion, energy
     * @param username Authenticated username (from RBAC interceptor) — may be null for unauthenticated
     */
    @Transactional
    public PostResponse createPost(PostRequest request, String username) {
        // Validation
        validatePostRequest(request);

        // Deterministic pseudonym from authenticated user, or random if unauthenticated
        String pseudonym;
        if (username != null && !username.isBlank()) {
            pseudonym = generateDeterministicPseudonym(username);
        } else {
            pseudonym = (request.getPseudonym() != null && !request.getPseudonym().isBlank())
                    ? request.getPseudonym().trim()
                    : generateRandomPseudonym();
        }
        if (pseudonym.length() > 100) pseudonym = pseudonym.substring(0, 100);

        // ── Unified sensitive word scan (crisis keywords + profanity) ──
        SensitiveWordService.ScanResult scanResult = sensitiveWordService.scan(request.getContent());

        // ── CRISIS KEYWORDS DETECTED → Save as flagged, provide support ──
        if (scanResult.hasCrisis()) {
            log.warn("⚠️ CRISIS POST [FLAGGED] pseudonym={}, crisis={}, profanity={}, detected={}",
                    pseudonym, scanResult.hasCrisis(), scanResult.hasProfanity(),
                    scanResult.detectedWords());

            // Auto-reply (crisis-aware)
            String autoReply = autoReplyService.generateReply(
                    request.getEmotionTag(), request.getEnergyScore(), request.getContent());

            // Save the post as FLAGGED — visible to professionals, NOT to peers
            String postId = generatePostId();
            Post post = Post.builder()
                    .postId(postId)
                    .ownerUsername(username)
                    .pseudonym(pseudonym)
                    .content(request.getContent())
                    .emotionTag(request.getEmotionTag())
                    .energyScore(request.getEnergyScore())
                    .flagged(true)
                    .flaggedKeywords(scanResult.detectedWords())
                    .severity(scanResult.severity())
                    .autoReply(autoReply)
                    .reviewed(false)
                    .createdAt(LocalDateTime.now())
                    .build();

            Post saved = postRepository.save(post);
            log.info("Crisis post saved (hidden from peers): postId={}, owner={}, emotion={}, energy={}",
                    saved.getPostId(), username != null ? username : "anonymous",
                    saved.getEmotionTag(), saved.getEnergyScore());

            // Generate Crisis Alert for the psychometrician dashboard
            try {
                crisisAlertService.alertCrisisPost(
                        postId, pseudonym, request.getContent(),
                        request.getEmotionTag(), request.getEnergyScore(),
                        scanResult.severity(), scanResult.detectedWords());
            } catch (Exception e) {
                log.error("Failed to generate crisis alert for post {}: {}", postId, e.getMessage());
            }

            // Fetch contextual crisis resources (Resource Linker)
            List<WellnessResource> contextualResources = null;
            try {
                contextualResources = resourceLinkerService.getContextualResources(
                        request.getEmotionTag(), request.getEnergyScore(), true);
                if (contextualResources != null && !contextualResources.isEmpty()) {
                    log.info("Resource Linker: {} crisis resources linked to postId={}",
                            contextualResources.size(), postId);
                }
            } catch (Exception e) {
                log.error("Resource Linker failed for crisis post {}: {}", postId, e.getMessage());
            }

            // Prescribe a Calm-Down Kit for the student
            CalmDownPrescription calmDownKit = null;
            try {
                calmDownKit = calmDownKitService.prescribe(
                        request.getEnergyScore(), request.getEmotionTag(),
                        postId, request.getContent());
                log.info("Calm-Down Kit prescribed for crisis post: postId={}, kitType={}",
                        postId, calmDownKit.getKitType());
            } catch (Exception e) {
                log.error("Calm-Down Kit prescription failed for post {}: {}", postId, e.getMessage());
            }

            return toCreationResponse(saved, contextualResources, calmDownKit);
        }

        // ── PROFANITY ONLY (no crisis) → Still BLOCK ──
        if (scanResult.hasProfanity()) {
            log.warn("🛑 POST BLOCKED [PROFANITY] pseudonym={}, detected={}",
                    pseudonym, scanResult.detectedWords());

            // Generate a low-priority alert for profanity attempts
            try {
                crisisAlertService.alertBlockedPostAttempt(
                        pseudonym, request.getContent(),
                        request.getEmotionTag(), request.getEnergyScore(),
                        false, "NONE", scanResult.detectedWords());
            } catch (Exception e) {
                log.error("Failed to generate alert for blocked profanity post: {}", e.getMessage());
            }

            throw new IllegalArgumentException(
                    "Your post contains inappropriate language and cannot be published. "
                    + "Please rephrase your message to keep this a safe space for everyone.");
        }

        // ── Post is CLEAN — save normally ──

        // Auto-reply (content-aware)
        String autoReply = autoReplyService.generateReply(
                request.getEmotionTag(), request.getEnergyScore(), request.getContent());

        // Build and persist
        String postId = generatePostId();

        Post post = Post.builder()
                .postId(postId)
                .ownerUsername(username)
                .pseudonym(pseudonym)
                .content(request.getContent())
                .emotionTag(request.getEmotionTag())
                .energyScore(request.getEnergyScore())
                .flagged(false)
                .flaggedKeywords(null)
                .severity("NONE")
                .autoReply(autoReply)
                .reviewed(false)
                .createdAt(LocalDateTime.now())
                .build();

        Post saved = postRepository.save(post);

        log.info("Post created: postId={}, owner={}, emotion={}, energy={}",
                saved.getPostId(), username != null ? username : "anonymous",
                saved.getEmotionTag(), saved.getEnergyScore());

        // High energy alert (no crisis keywords, but energy >= 8)
        try {
            if (request.getEnergyScore() >= 8) {
                crisisAlertService.alertHighEnergyPost(
                        postId, pseudonym, request.getContent(),
                        request.getEmotionTag(), request.getEnergyScore());
            }
        } catch (Exception e) {
            log.error("Failed to generate crisis alert for post {}: {}", postId, e.getMessage());
        }

        // ── Contextual Resource Linking ──
        // Fetch relevant wellness resources based on the student's emotional state
        List<WellnessResource> contextualResources = null;
        try {
            boolean isCrisis = request.getEnergyScore() >= 9;
            contextualResources = resourceLinkerService.getContextualResources(
                    request.getEmotionTag(), request.getEnergyScore(), isCrisis);
            if (contextualResources != null && !contextualResources.isEmpty()) {
                log.info("Resource Linker: {} resources linked to postId={} (emotion={}, energy={})",
                        contextualResources.size(), postId, request.getEmotionTag(), request.getEnergyScore());
            }
        } catch (Exception e) {
            log.error("Resource Linker failed for post {}: {}", postId, e.getMessage());
        }

        return toCreationResponse(saved, contextualResources, null);
    }

    /**
     * Backward-compatible: create post without authenticated user.
     */
    @Transactional
    public PostResponse createPost(PostRequest request) {
        return createPost(request, null);
    }

    // ── 2. Feed Retrieval ──

    /**
     * Paginated feed, newest first (Peer Mirror).
     * Flagged keywords and severity are hidden from student view.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getPostsPaginated(int page, int size, String emotion) {
        Page<Post> postPage;
        if (emotion != null && !emotion.isBlank() && !"ALL".equalsIgnoreCase(emotion)) {
            // Filter by emotion — exclude flagged posts to prevent triggering peers
            List<Post> filtered = postRepository.findByFlaggedFalseAndEmotionTagOrderByCreatedAtDesc(emotion);
            int start = Math.min(page * size, filtered.size());
            int end = Math.min(start + size, filtered.size());
            List<PostResponse> content = filtered.subList(start, end).stream()
                    .map(this::toStudentResponse)
                    .collect(Collectors.toList());
            return Map.of(
                    "content", content,
                    "page", page,
                    "size", size,
                    "totalElements", filtered.size(),
                    "totalPages", (int) Math.ceil((double) filtered.size() / size)
            );
        }

        // Exclude flagged posts to prevent triggering peers
        postPage = postRepository.findByFlaggedFalseOrderByCreatedAtDesc(PageRequest.of(page, size));
        List<PostResponse> content = postPage.getContent().stream()
                .map(this::toStudentResponse)
                .collect(Collectors.toList());

        return Map.of(
                "content", content,
                "page", postPage.getNumber(),
                "size", postPage.getSize(),
                "totalElements", postPage.getTotalElements(),
                "totalPages", postPage.getTotalPages()
        );
    }

    /**
     * All posts (legacy non-paginated).
     */
    @Transactional(readOnly = true)
    public List<PostResponse> getAllPosts() {
        return postRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Get a user's own posts by their username (for "My Posts" view).
     */
    @Transactional(readOnly = true)
    public List<PostResponse> getMyPosts(String username) {
        return postRepository.findByOwnerUsernameOrderByCreatedAtDesc(username).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Single post by postId.
     */
    @Transactional(readOnly = true)
    public PostResponse getPostByPostId(String postId) {
        Post post = postRepository.findByPostId(postId)
                .orElseThrow(() -> new NoSuchElementException("Post not found: " + postId));
        return toResponse(post);
    }

    // ── 3. Flagged Posts (Professional View) ──

    /**
     * All flagged posts for professional review.
     */
    @Transactional(readOnly = true)
    public List<PostResponse> getFlaggedPosts() {
        return postRepository.findByFlaggedTrueOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Unreviewed flagged posts (priority queue).
     */
    @Transactional(readOnly = true)
    public List<PostResponse> getUnreviewedFlaggedPosts() {
        return postRepository.findByFlaggedTrueAndReviewedFalseOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Mark a flagged post as reviewed by a professional.
     */
    @Transactional
    public PostResponse reviewPost(String postId, String reviewerUsername) {
        Post post = postRepository.findByPostId(postId)
                .orElseThrow(() -> new NoSuchElementException("Post not found: " + postId));
        post.setReviewed(true);
        post.setReviewedBy(reviewerUsername);
        post.setReviewedAt(LocalDateTime.now());
        Post saved = postRepository.save(post);
        log.info("Post reviewed: postId={}, reviewer={}", postId, reviewerUsername);
        return toResponse(saved);
    }

    // ── 4. Post Statistics (for Dashboard integration) ──

    /**
     * Rant board statistics for the monitoring dashboard.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getPostStats() {
        long total = postRepository.count();
        long flagged = postRepository.countByFlaggedTrue();
        long unreviewedFlagged = postRepository.countByFlaggedTrueAndReviewedFalse();
        double avgEnergy = postRepository.findAverageEnergyScore();

        // Emotion distribution
        Map<String, Long> emotionCounts = new LinkedHashMap<>();
        for (Object[] row : postRepository.countByEmotionTag()) {
            emotionCounts.put((String) row[0], ((Number) row[1]).longValue());
        }

        return Map.of(
                "totalPosts", total,
                "flaggedPosts", flagged,
                "unreviewedFlagged", unreviewedFlagged,
                "averageEnergy", Math.round(avgEnergy * 10.0) / 10.0,
                "emotionDistribution", emotionCounts
        );
    }

    // ── 5. Admin Operations ──

    /**
     * Delete a post (admin/professional only).
     */
    @Transactional
    public void deletePost(String postId) {
        Post post = postRepository.findByPostId(postId)
                .orElseThrow(() -> new NoSuchElementException("Post not found: " + postId));
        postRepository.delete(post);
        log.info("Post deleted: postId={}", postId);
    }

    // ── Private Helpers ──

    private void validatePostRequest(PostRequest request) {
        if (request.getContent() == null || request.getContent().isBlank()) {
            throw new IllegalArgumentException("Post content cannot be empty.");
        }
        if (request.getContent().length() > 5000) {
            throw new IllegalArgumentException("Post content must not exceed 5000 characters.");
        }
        if (!VALID_EMOTIONS.contains(request.getEmotionTag())) {
            throw new IllegalArgumentException(
                    "Invalid emotion tag. Must be one of: " + String.join(", ", VALID_EMOTIONS));
        }
        if (request.getEnergyScore() < 1 || request.getEnergyScore() > 10) {
            throw new IllegalArgumentException("Energy score must be between 1 and 10.");
        }
    }

    /**
     * Full response for professionals/admins — includes flagged details.
     */
    private PostResponse toResponse(Post post) {
        return PostResponse.builder()
                .id(post.getId())
                .postId(post.getPostId())
                .pseudonym(post.getPseudonym())
                .content(post.getContent())
                .emotionTag(post.getEmotionTag())
                .energyScore(post.getEnergyScore())
                .flagged(post.isFlagged())
                .flaggedKeywords(post.getFlaggedKeywords())
                .severity(post.getSeverity())
                .autoReply(post.getAutoReply())
                .reviewed(post.isReviewed())
                .reviewedBy(post.getReviewedBy())
                .reviewedAt(post.getReviewedAt())
                .createdAt(post.getCreatedAt())
                .build();
    }

    /**
     * Creation response — includes contextual wellness resources and optional Calm-Down Kit.
     * This is only used when a new post is successfully created.
     *
     * @param resources   contextual wellness resources from the Resource Linker
     * @param calmDownKit adaptive Calm-Down Kit prescription (only for crisis posts)
     */
    private PostResponse toCreationResponse(Post post, List<WellnessResource> resources,
                                            CalmDownPrescription calmDownKit) {
        return PostResponse.builder()
                .id(post.getId())
                .postId(post.getPostId())
                .pseudonym(post.getPseudonym())
                .content(post.getContent())
                .emotionTag(post.getEmotionTag())
                .energyScore(post.getEnergyScore())
                .flagged(post.isFlagged())
                .flaggedKeywords(post.getFlaggedKeywords())
                .severity(post.getSeverity())
                .autoReply(post.getAutoReply())
                .reviewed(post.isReviewed())
                .reviewedBy(post.getReviewedBy())
                .reviewedAt(post.getReviewedAt())
                .createdAt(post.getCreatedAt())
                .contextualResources(resources)
                .calmDownKit(calmDownKit)
                .build();
    }

    /**
     * Student-safe response — hides flagged keywords and review info.
     * Students should not see which keywords triggered a flag.
     */
    private PostResponse toStudentResponse(Post post) {
        return PostResponse.builder()
                .id(post.getId())
                .postId(post.getPostId())
                .pseudonym(post.getPseudonym())
                .content(post.getContent())
                .emotionTag(post.getEmotionTag())
                .energyScore(post.getEnergyScore())
                .flagged(post.isFlagged())
                .severity(null)  // hidden from students
                .flaggedKeywords(null)  // hidden from students
                .autoReply(post.getAutoReply())
                .reviewed(false)  // hidden from students
                .createdAt(post.getCreatedAt())
                .build();
    }

    /**
     * Generate a deterministic pseudonym from a username.
     * Same username always produces the same pseudonym for consistent anonymity.
     * Uses a hash of the username to select from adjective+noun combinations.
     */
    private String generateDeterministicPseudonym(String username) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(("safe-space-anon-" + username).getBytes(StandardCharsets.UTF_8));
            int adjIdx = Math.abs(hash[0]) % PSEUDONYM_ADJECTIVES.size();
            int nounIdx = Math.abs(hash[1]) % PSEUDONYM_NOUNS.size();
            int number = (Math.abs(hash[2]) * 256 + Math.abs(hash[3])) % 9000 + 1000;
            return PSEUDONYM_ADJECTIVES.get(adjIdx) + PSEUDONYM_NOUNS.get(nounIdx) + "-" + number;
        } catch (Exception e) {
            return generateRandomPseudonym();
        }
    }

    private String generateRandomPseudonym() {
        Random random = new Random();
        String adj = PSEUDONYM_ADJECTIVES.get(random.nextInt(PSEUDONYM_ADJECTIVES.size()));
        String noun = PSEUDONYM_NOUNS.get(random.nextInt(PSEUDONYM_NOUNS.size()));
        int number = random.nextInt(9000) + 1000;
        return "Anon-" + adj + noun + "-" + number;
    }

    private String generatePostId() {
        return "post-" + Long.toString(System.currentTimeMillis(), 36)
                + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
