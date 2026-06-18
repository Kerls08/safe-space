package com.safe.space.repository;

import com.safe.space.model.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {

    Optional<ChatSession> findBySessionId(String sessionId);

    /** All sessions for a student pseudonym, newest first. */
    List<ChatSession> findByStudentPseudonymOrderByCreatedAtDesc(String pseudonym);

    /** Waiting sessions (queue for professionals), oldest first. */
    List<ChatSession> findByStatusOrderByCreatedAtAsc(String status);

    /** Active sessions for a specific professional. */
    List<ChatSession> findByProfessionalIdAndStatusOrderByCreatedAtDesc(String professionalId, String status);

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
