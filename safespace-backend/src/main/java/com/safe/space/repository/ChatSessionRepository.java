package com.safe.space.repository;

import com.safe.space.model.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {

    Optional<ChatSession> findBySessionId(String sessionId);

    List<ChatSession> findByCreatedAtBetweenOrderByCreatedAtDesc(LocalDateTime from, LocalDateTime to);

    /** All sessions for a student pseudonym, newest first. */
    List<ChatSession> findByStudentPseudonymOrderByCreatedAtDesc(String pseudonym);

    /** All sessions linked to a student's user account, newest first. */
    List<ChatSession> findByStudentUserIdOrderByCreatedAtDesc(String studentUserId);

    /** Waiting sessions (queue for professionals), oldest first. */
    List<ChatSession> findByStatusOrderByCreatedAtAsc(String status);

    /** Active sessions for a specific professional. */
    List<ChatSession> findByProfessionalIdAndStatusOrderByCreatedAtDesc(String professionalId, String status);

    /** Find open sessions (WAITING, INVITED, or ACTIVE) by student username or pseudonym. */
    @Query("SELECT s FROM ChatSession s WHERE ((:studentUserId IS NOT NULL AND s.studentUserId = :studentUserId) OR (:pseudonym IS NOT NULL AND s.studentPseudonym = :pseudonym)) AND s.status IN ('WAITING', 'INVITED', 'ACTIVE') ORDER BY s.createdAt DESC")
    List<ChatSession> findOpenSessionsForStudent(@Param("studentUserId") String studentUserId, @Param("pseudonym") String pseudonym);

    /** Count by status. */
    @Query("SELECT s.status, COUNT(s) FROM ChatSession s GROUP BY s.status")
    List<Object[]> countByStatus();

    /** Count crisis-flagged sessions. */
    long countByCrisisFlagTrue();

    /** Average message count for closed sessions. */
    @Query("SELECT AVG(s.messageCount) FROM ChatSession s WHERE s.status = 'CLOSED'")
    Double avgMessageCountClosed();

    /** Crisis sessions waiting (priority queue). */
    List<ChatSession> findByStatusAndCrisisFlagTrueOrderByCreatedAtAsc(String status);
}
