package com.safe.space.repository;

import com.safe.space.model.CalmDownSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface CalmDownSessionRepository extends JpaRepository<CalmDownSession, Long> {

    Optional<CalmDownSession> findBySessionId(String sessionId);

    /** Count by kit type. */
    @Query("SELECT s.kitType, COUNT(s) FROM CalmDownSession s GROUP BY s.kitType ORDER BY COUNT(s) DESC")
    List<Object[]> countByKitType();

    /** Completion rate: count completed vs total. */
    long countByCompletedTrue();

    /** Completion count by kit type. */
    @Query("SELECT s.kitType, COUNT(s) FROM CalmDownSession s WHERE s.completed = true GROUP BY s.kitType")
    List<Object[]> countCompletedByKitType();

    /** Average duration by kit type (only completed sessions). */
    @Query("SELECT s.kitType, AVG(s.durationSeconds) FROM CalmDownSession s WHERE s.completed = true AND s.durationSeconds IS NOT NULL GROUP BY s.kitType")
    List<Object[]> avgDurationByKitType();

    /** Feedback distribution. */
    @Query("SELECT s.feedbackRating, COUNT(s) FROM CalmDownSession s WHERE s.feedbackRating IS NOT NULL GROUP BY s.feedbackRating ORDER BY COUNT(s) DESC")
    List<Object[]> countByFeedbackRating();

    /** Feedback distribution by kit type. */
    @Query("SELECT s.kitType, s.feedbackRating, COUNT(s) FROM CalmDownSession s WHERE s.feedbackRating IS NOT NULL GROUP BY s.kitType, s.feedbackRating ORDER BY s.kitType, COUNT(s) DESC")
    List<Object[]> countFeedbackByKitType();

    /** Daily prescription count. */
    @Query("SELECT CAST(s.createdAt AS DATE), COUNT(s) FROM CalmDownSession s WHERE s.createdAt >= :since GROUP BY CAST(s.createdAt AS DATE) ORDER BY CAST(s.createdAt AS DATE) ASC")
    List<Object[]> countDailySessions(@Param("since") LocalDateTime since);

    /** Crisis-detected sessions. */
    long countByCrisisDetectedTrue();
}
