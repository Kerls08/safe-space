package com.safe.space.repository;

import com.safe.space.model.CrisisAlert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CrisisAlertRepository extends JpaRepository<CrisisAlert, Long> {

    Optional<CrisisAlert> findByAlertId(String alertId);

    // ── Status-based queries ──

    List<CrisisAlert> findByStatusOrderByCreatedAtDesc(String status);

    List<CrisisAlert> findByStatusInOrderByCreatedAtDesc(List<String> statuses);

    /** Active alerts sorted by severity (CRITICAL first) then newest. */
    @Query("SELECT a FROM CrisisAlert a WHERE a.status = 'ACTIVE' ORDER BY " +
           "CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END, " +
           "a.createdAt DESC")
    List<CrisisAlert> findActiveAlertsPrioritized();

    /** All unresolved alerts (ACTIVE + ACKNOWLEDGED). */
    @Query("SELECT a FROM CrisisAlert a WHERE a.status IN ('ACTIVE','ACKNOWLEDGED') ORDER BY " +
           "CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END, " +
           "a.createdAt DESC")
    List<CrisisAlert> findUnresolvedAlertsPrioritized();

    // ── Counting ──

    long countByStatus(String status);

    long countBySeverityAndStatus(String severity, String status);

    @Query("SELECT a.severity, COUNT(a) FROM CrisisAlert a WHERE a.status = 'ACTIVE' GROUP BY a.severity")
    List<Object[]> countActiveBySeverity();

    @Query("SELECT a.alertType, COUNT(a) FROM CrisisAlert a WHERE a.status = 'ACTIVE' GROUP BY a.alertType")
    List<Object[]> countActiveByType();

    // ── Duplicate prevention ──

    /** Check if an active alert already exists for a specific reference. */
    boolean existsByReferenceIdAndReferenceTypeAndStatusIn(String referenceId, String referenceType, List<String> statuses);

    /** Find alerts by reference for linking. */
    List<CrisisAlert> findByReferenceIdAndReferenceType(String referenceId, String referenceType);

    // ── Pattern detection ──

    /** Count active alerts for the same pseudonym (repeat crisis detection). */
    @Query("SELECT COUNT(a) FROM CrisisAlert a WHERE a.pseudonym = :pseudonym AND a.status IN ('ACTIVE','ACKNOWLEDGED') AND a.alertType IN ('CRISIS_POST','HIGH_ENERGY_POST')")
    long countActiveCrisisForPseudonym(@Param("pseudonym") String pseudonym);

    // ── Time-based ──

    @Query("SELECT COUNT(a) FROM CrisisAlert a WHERE a.createdAt >= :since")
    long countSince(@Param("since") LocalDateTime since);

    @Query("SELECT COUNT(a) FROM CrisisAlert a WHERE a.createdAt >= :since AND a.severity = 'CRITICAL'")
    long countCriticalSince(@Param("since") LocalDateTime since);

    /** Daily alert count for trends. */
    @Query("SELECT CAST(a.createdAt AS DATE), a.severity, COUNT(a) FROM CrisisAlert a " +
           "WHERE a.createdAt >= :since GROUP BY CAST(a.createdAt AS DATE), a.severity " +
           "ORDER BY CAST(a.createdAt AS DATE) ASC")
    List<Object[]> findDailyAlertTrends(@Param("since") LocalDateTime since);
}
