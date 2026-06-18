package com.safe.space.repository;

import com.safe.space.model.AutoReplyLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AutoReplyLogRepository extends JpaRepository<AutoReplyLog, Long> {

    /** All logs newest first. */
    List<AutoReplyLog> findAllByOrderByCreatedAtDesc();

    /** Count by tier (low, mid, high, crisis). */
    @Query("SELECT a.tier, COUNT(a) FROM AutoReplyLog a GROUP BY a.tier ORDER BY COUNT(a) DESC")
    List<Object[]> countByTier();

    /** Count by emotion tag. */
    @Query("SELECT a.emotionTag, COUNT(a) FROM AutoReplyLog a GROUP BY a.emotionTag ORDER BY COUNT(a) DESC")
    List<Object[]> countByEmotion();

    /** Count by rule matched. */
    @Query("SELECT a.ruleMatched, COUNT(a) FROM AutoReplyLog a GROUP BY a.ruleMatched ORDER BY COUNT(a) DESC")
    List<Object[]> countByRule();

    /** Count of crisis-detected replies. */
    long countByCrisisDetectedTrue();

    /** Logs within a date range. */
    List<AutoReplyLog> findByCreatedAtBetweenOrderByCreatedAtDesc(LocalDateTime from, LocalDateTime to);

    /** Daily reply counts. */
    @Query("SELECT CAST(a.createdAt AS DATE), COUNT(a) FROM AutoReplyLog a WHERE a.createdAt >= :since GROUP BY CAST(a.createdAt AS DATE) ORDER BY CAST(a.createdAt AS DATE) ASC")
    List<Object[]> countDailyReplies(@Param("since") LocalDateTime since);
}
