package com.safe.space.service;

import com.safe.space.model.WellnessResource;
import com.safe.space.repository.WellnessResourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Resource Linker Service — manages wellness resources and provides
 * contextual resource recommendations based on emotional state.
 *
 * Core capabilities:
 *   1. CRUD for wellness resources (admin/professional)
 *   2. Contextual resource delivery based on emotion + energy
 *   3. Crisis resource filtering
 *   4. Default seed resources on first startup
 *   5. Statistics for dashboard integration
 */
@Service
public class ResourceLinkerService {

    private static final Logger log = LoggerFactory.getLogger(ResourceLinkerService.class);

    private final WellnessResourceRepository repo;

    public ResourceLinkerService(WellnessResourceRepository repo) {
        this.repo = repo;
        seedDefaultResources();
    }

    // ═══════════════════════════════════════════
    //  CRUD Operations
    // ═══════════════════════════════════════════

    /**
     * Get all active resources, sorted by priority.
     * ARTICLE category is excluded from student-facing delivery
     * per psychometrician guidance — articles risk triggering
     * self-diagnosis in emotionally vulnerable students.
     */
    public List<WellnessResource> getAllActive() {
        return repo.findByActiveTrueOrderByPriorityAsc().stream()
                .filter(r -> !"ARTICLE".equalsIgnoreCase(r.getCategory()))
                .collect(Collectors.toList());
    }

    /** Get all resources including inactive (admin view) */
    public List<WellnessResource> getAll() {
        return repo.findAll();
    }

    /** Get a single resource by ID */
    public Optional<WellnessResource> getById(Long id) {
        return repo.findById(id);
    }

    /** Get resources by category */
    public List<WellnessResource> getByCategory(String category) {
        return repo.findByActiveTrueAndCategoryOrderByPriorityAsc(category.toUpperCase());
    }

    /** Create a new resource */
    public WellnessResource create(WellnessResource resource, String createdBy) {
        resource.setCreatedBy(createdBy);
        resource.setActive(true);
        if (resource.getCategory() != null) {
            resource.setCategory(resource.getCategory().toUpperCase());
        }
        WellnessResource saved = repo.save(resource);
        log.info("Resource created: id={} title='{}' by={}", saved.getId(), saved.getTitle(), createdBy);
        return saved;
    }

    /** Update an existing resource */
    public WellnessResource update(Long id, WellnessResource updated) {
        WellnessResource existing = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Resource not found: " + id));

        if (updated.getTitle() != null) existing.setTitle(updated.getTitle());
        if (updated.getDescription() != null) existing.setDescription(updated.getDescription());
        if (updated.getLink() != null) existing.setLink(updated.getLink());
        if (updated.getCategory() != null) existing.setCategory(updated.getCategory().toUpperCase());
        if (updated.getEmotionTags() != null) existing.setEmotionTags(updated.getEmotionTags());
        if (updated.getIcon() != null) existing.setIcon(updated.getIcon());

        existing.setMinEnergy(updated.getMinEnergy());
        existing.setMaxEnergy(updated.getMaxEnergy());
        existing.setCrisisOnly(updated.isCrisisOnly());
        existing.setPriority(updated.getPriority());

        WellnessResource saved = repo.save(existing);
        log.info("Resource updated: id={} title='{}'", saved.getId(), saved.getTitle());
        return saved;
    }

    /** Soft-delete: deactivate a resource */
    public void deactivate(Long id) {
        WellnessResource r = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Resource not found: " + id));
        r.setActive(false);
        repo.save(r);
        log.info("Resource deactivated: id={} title='{}'", r.getId(), r.getTitle());
    }

    /** Reactivate a soft-deleted resource */
    public void reactivate(Long id) {
        WellnessResource r = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Resource not found: " + id));
        r.setActive(true);
        repo.save(r);
        log.info("Resource reactivated: id={} title='{}'", r.getId(), r.getTitle());
    }

    /** Hard-delete a resource */
    public void delete(Long id) {
        repo.deleteById(id);
        log.info("Resource deleted: id={}", id);
    }

    // ═══════════════════════════════════════════
    //  Contextual Resource Delivery
    // ═══════════════════════════════════════════

    /**
     * Get resources contextually relevant to a student's current state.
     *
     * @param emotionTag Current emotion (e.g., "Sad", "Anxious")
     * @param energyScore Current energy score (1-10)
     * @param isCrisis Whether the post was flagged as crisis
     * @return Filtered and prioritized list of relevant resources
     */
    public List<WellnessResource> getContextualResources(String emotionTag, int energyScore, boolean isCrisis) {
        List<WellnessResource> candidates;

        if (isCrisis) {
            // For crisis, show all crisis resources + energy-relevant ones
            candidates = repo.findByActiveTrueOrderByPriorityAsc();
        } else {
            // Filter by energy range
            candidates = repo.findByEnergyRange(energyScore);
        }

        // Filter by emotion tag relevance; exclude ARTICLE category
        return candidates.stream()
                .filter(r -> {
                    // Exclude articles — risk of self-diagnosis per ethics review
                    if ("ARTICLE".equalsIgnoreCase(r.getCategory())) return false;

                    // Crisis-only resources only appear if crisis is active
                    if (r.isCrisisOnly() && !isCrisis) return false;

                    // If resource has no emotion tags, it's relevant to all
                    if (r.getEmotionTags() == null || r.getEmotionTags().isBlank()) return true;

                    // Check if the student's emotion matches any of the resource's tags
                    if (emotionTag == null || emotionTag.isBlank()) return true;

                    Set<String> tags = Arrays.stream(r.getEmotionTags().split(","))
                            .map(String::trim)
                            .map(String::toLowerCase)
                            .collect(Collectors.toSet());
                    return tags.contains(emotionTag.toLowerCase());
                })
                .collect(Collectors.toList());
    }

    /**
     * Get crisis-only resources (for resource banner on high-energy posts).
     */
    public List<WellnessResource> getCrisisResources() {
        return repo.findByActiveTrueAndCrisisOnlyTrueOrderByPriorityAsc();
    }

    // ═══════════════════════════════════════════
    //  Statistics
    // ═══════════════════════════════════════════

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", repo.countByActiveTrue());
        stats.put("hotlines", repo.countByActiveTrueAndCategory("HOTLINE"));
        stats.put("campus", repo.countByActiveTrueAndCategory("CAMPUS"));
        stats.put("articles", repo.countByActiveTrueAndCategory("ARTICLE"));
        stats.put("externalLinks", repo.countByActiveTrueAndCategory("EXTERNAL_LINK"));
        stats.put("chatServices", repo.countByActiveTrueAndCategory("CHAT_SERVICE"));
        stats.put("crisisOnly", repo.countByActiveTrueAndCrisisOnlyTrue());
        return stats;
    }

    // ═══════════════════════════════════════════
    //  Seed Default Resources
    // ═══════════════════════════════════════════

    private void seedDefaultResources() {
        if (repo.count() > 0) return;

        log.info("Seeding default wellness resources...");

        List<WellnessResource> defaults = List.of(
            // ── Hotlines (Crisis) ──
            buildResource("National Crisis Hotline", "24/7 crisis support. Free and confidential.",
                "tel:1553", "HOTLINE", null, 0, 10, true, 1, "fas fa-phone-volume"),

            buildResource("Emergency Services", "For immediate life-threatening emergencies.",
                "tel:911", "HOTLINE", null, 0, 10, true, 2, "fas fa-truck-medical"),

            buildResource("USTP Guidance Office", "Campus counseling and psychological services.",
                "tel:+638822723058", "HOTLINE", null, 0, 10, false, 5, "fas fa-headset"),

            // ── Campus Services ──
            buildResource("USTP Counseling Center", "Free, confidential counseling for enrolled students. Walk-in or by appointment.",
                "https://www.ustp.edu.ph/guidance", "CAMPUS", null, 0, 10, false, 10, "fas fa-building-columns"),

            buildResource("Campus Health Clinic", "Medical and mental health consultations on campus.",
                "https://www.ustp.edu.ph/health", "CAMPUS", null, 0, 10, false, 11, "fas fa-hospital"),

            buildResource("Office of Student Affairs", "Student welfare, concerns, and accommodation requests.",
                "https://www.ustp.edu.ph/osa", "CAMPUS", null, 0, 10, false, 12, "fas fa-university"),

            // ── Self-Help Articles — REMOVED ──
            // Articles excluded per psychometrician ethics review:
            // Presenting diagnostic/symptom content to students in a vulnerable emotional
            // state risks triggering self-diagnosis, which compromises Safe Space's
            // ethical mandate. Students should be directed to professional support instead.


            // ── External Links ──
            buildResource("MindShift CBT App", "Free CBT-based anxiety management app.",
                "https://www.anxietycanada.com/resources/mindshift-cbt/",
                "EXTERNAL_LINK", "Anxious", 0, 10, false, 30, "fas fa-mobile-screen"),

            buildResource("Headspace (Free Student Plan)", "Meditation and mindfulness exercises.",
                "https://www.headspace.com/studentplan",
                "EXTERNAL_LINK", null, 0, 7, false, 31, "fas fa-spa"),

            // ── Chat Services ──
            buildResource("Crisis Text Line", "Text HOME to 741741 for free, 24/7 crisis support.",
                "sms:741741", "CHAT_SERVICE", null, 7, 10, true, 3, "fas fa-comment-medical"),

            buildResource("Hopeline PH", "24/7 emotional support. Call (02) 804-HOPE or text 0917-558-HOPE.",
                "tel:028040673", "CHAT_SERVICE", "Sad,Lonely,Anxious", 5, 10, false, 15, "fas fa-comments")
        );

        repo.saveAll(defaults);
        log.info("Seeded {} default wellness resources", defaults.size());
    }

    private WellnessResource buildResource(String title, String description, String link,
            String category, String emotionTags, int minEnergy, int maxEnergy,
            boolean crisisOnly, int priority, String icon) {
        WellnessResource r = new WellnessResource();
        r.setTitle(title);
        r.setDescription(description);
        r.setLink(link);
        r.setCategory(category);
        r.setEmotionTags(emotionTags);
        r.setMinEnergy(minEnergy);
        r.setMaxEnergy(maxEnergy);
        r.setCrisisOnly(crisisOnly);
        r.setPriority(priority);
        r.setIcon(icon);
        r.setActive(true);
        r.setCreatedBy("SYSTEM");
        return r;
    }
}
