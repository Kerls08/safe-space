package com.safe.space.repository;

import com.safe.space.model.WellnessResource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository for WellnessResource with contextual querying.
 */
@Repository
public interface WellnessResourceRepository extends JpaRepository<WellnessResource, Long> {

    /** All active resources, sorted by priority */
    List<WellnessResource> findByActiveTrueOrderByPriorityAsc();

    /** Active resources filtered by category */
    List<WellnessResource> findByActiveTrueAndCategoryOrderByPriorityAsc(String category);

    /**
     * Contextual query: find resources relevant to a specific energy level.
     * Returns resources where energy is within [minEnergy, maxEnergy].
     */
    @Query("SELECT r FROM WellnessResource r WHERE r.active = true " +
           "AND r.minEnergy <= :energy AND r.maxEnergy >= :energy " +
           "ORDER BY r.priority ASC")
    List<WellnessResource> findByEnergyRange(@Param("energy") int energy);

    /**
     * Crisis-only resources, priority sorted.
     */
    List<WellnessResource> findByActiveTrueAndCrisisOnlyTrueOrderByPriorityAsc();

    /** Count active resources */
    long countByActiveTrue();

    /** Count by category */
    long countByActiveTrueAndCategory(String category);

    /** Count crisis-only resources */
    long countByActiveTrueAndCrisisOnlyTrue();
}
