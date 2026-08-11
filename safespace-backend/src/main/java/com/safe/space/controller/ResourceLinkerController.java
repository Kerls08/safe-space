package com.safe.space.controller;

import com.safe.space.model.WellnessResource;
import com.safe.space.service.ResourceLinkerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * Resource Linker REST Controller.
 *
 * Endpoints:
 *
 *   PUBLIC TO AUTHENTICATED USERS:
 *     GET  /api/resources                          — All active resources
 *     GET  /api/resources/contextual               — Contextual recommendations
 *     GET  /api/resources/crisis                   — Crisis-only resources
 *     GET  /api/resources/category/{category}      — By category
 *     GET  /api/resources/{id}                     — Single resource
 *
 *   ADMIN / PROFESSIONAL ONLY:
 *     POST   /api/resources                        — Create resource
 *     PUT    /api/resources/{id}                   — Update resource
 *     DELETE /api/resources/{id}                   — Soft-delete (deactivate)
 *     PUT    /api/resources/{id}/reactivate        — Reactivate
 *     DELETE /api/resources/{id}/permanent         — Hard delete
 *     GET    /api/resources/stats                  — Statistics
 *     GET    /api/resources/all                    — All including inactive
 */
@RestController
@RequestMapping("/api/resources")
public class ResourceLinkerController {

    private final ResourceLinkerService service;

    public ResourceLinkerController(ResourceLinkerService service) {
        this.service = service;
    }

    // ═══════════════════════════════════════════
    //  Student-facing (any authenticated user)
    // ═══════════════════════════════════════════

    /**
     * GET /api/resources — All active resources, priority-sorted.
     */
    @GetMapping
    public ResponseEntity<List<WellnessResource>> getAll() {
        return ResponseEntity.ok(service.getAllActive());
    }

    /**
     * GET /api/resources/contextual?emotion=Sad&energy=8&crisis=false
     *
     * Returns resources contextually relevant to the student's current state.
     */
    @GetMapping("/contextual")
    public ResponseEntity<List<WellnessResource>> getContextual(
            @RequestParam(required = false) String emotion,
            @RequestParam(defaultValue = "5") int energy,
            @RequestParam(defaultValue = "false") boolean crisis) {
        return ResponseEntity.ok(service.getContextualResources(emotion, energy, crisis));
    }

    /**
     * GET /api/resources/crisis — Crisis-only resources.
     */
    @GetMapping("/crisis")
    public ResponseEntity<List<WellnessResource>> getCrisis() {
        return ResponseEntity.ok(service.getCrisisResources());
    }

    /**
     * GET /api/resources/category/{category} — By category.
     */
    @GetMapping("/category/{category}")
    public ResponseEntity<List<WellnessResource>> getByCategory(@PathVariable String category) {
        return ResponseEntity.ok(service.getByCategory(category));
    }

    /**
     * GET /api/resources/{id} — Single resource by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id) {
        return service.getById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ═══════════════════════════════════════════
    //  Admin / Professional management
    // ═══════════════════════════════════════════

    /**
     * GET /api/resources/stats — Resource statistics.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(service.getStats());
    }

    /**
     * GET /api/resources/all — All resources including inactive.
     */
    @GetMapping("/all")
    public ResponseEntity<List<WellnessResource>> getAllIncludingInactive() {
        return ResponseEntity.ok(service.getAll());
    }

    /**
     * POST /api/resources — Create a new resource.
     */
    @PostMapping
    public ResponseEntity<?> create(@RequestBody WellnessResource resource, HttpServletRequest request) {
        String username = (String) request.getAttribute("username");
        try {
            WellnessResource created = service.create(resource, username);
            return ResponseEntity.ok(Map.of(
                "message", "Resource created successfully",
                "resource", created
            ));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * PUT /api/resources/{id} — Update an existing resource.
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody WellnessResource resource) {
        try {
            WellnessResource updated = service.update(id, resource);
            return ResponseEntity.ok(Map.of(
                "message", "Resource updated successfully",
                "resource", updated
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * DELETE /api/resources/{id} — Soft-delete (deactivate).
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deactivate(@PathVariable Long id) {
        try {
            service.deactivate(id);
            return ResponseEntity.ok(Map.of("message", "Resource deactivated"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * PUT /api/resources/{id}/reactivate — Re-enable a deactivated resource.
     */
    @PutMapping("/{id}/reactivate")
    public ResponseEntity<?> reactivate(@PathVariable Long id) {
        try {
            service.reactivate(id);
            return ResponseEntity.ok(Map.of("message", "Resource reactivated"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * DELETE /api/resources/{id}/permanent — Permanently delete.
     */
    @DeleteMapping("/{id}/permanent")
    public ResponseEntity<?> permanentDelete(@PathVariable Long id) {
        try {
            service.delete(id);
            return ResponseEntity.ok(Map.of("message", "Resource permanently deleted"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
