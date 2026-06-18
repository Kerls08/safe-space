package com.safe.space.repository;

import com.safe.space.model.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {

    Optional<Post> findByPostId(String postId);

    List<Post> findByFlaggedTrueOrderByCreatedAtDesc();

    List<Post> findAllByOrderByCreatedAtDesc();

    // ── Paginated Feeds ──

    /** Paginated feed for Peer Mirror (newest first). */
    Page<Post> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Paginated feed for Peer Mirror (excluding flagged/crisis posts). */
    Page<Post> findByFlaggedFalseOrderByCreatedAtDesc(Pageable pageable);

    /** Paginated flagged posts for professional review. */
    Page<Post> findByFlaggedTrueOrderByCreatedAtDesc(Pageable pageable);

    /** Posts by a specific owner (for "my posts" view). */
    List<Post> findByOwnerUsernameOrderByCreatedAtDesc(String ownerUsername);

    /** Unreviewed flagged posts (priority queue for professionals). */
    List<Post> findByFlaggedTrueAndReviewedFalseOrderByCreatedAtDesc();

    /** Reviewed flagged posts. */
    List<Post> findByFlaggedTrueAndReviewedTrueOrderByCreatedAtDesc();

    // ── Energy Score Analytics ──

    @Query("SELECT COALESCE(AVG(p.energyScore), 0) FROM Post p")
    double findAverageEnergyScore();

    @Query("SELECT COALESCE(AVG(p.energyScore), 0) FROM Post p WHERE p.createdAt BETWEEN :from AND :to")
    double findAverageEnergyScoreBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT COUNT(p) FROM Post p WHERE p.energyScore BETWEEN :min AND :max")
    long countByEnergyScoreBetween(@Param("min") int min, @Param("max") int max);

    @Query("SELECT p.emotionTag, AVG(p.energyScore), COUNT(p) FROM Post p GROUP BY p.emotionTag ORDER BY AVG(p.energyScore) DESC")
    List<Object[]> findAverageEnergyByEmotion();

    @Query("SELECT CAST(p.createdAt AS DATE), AVG(p.energyScore), COUNT(p) FROM Post p WHERE p.createdAt >= :since GROUP BY CAST(p.createdAt AS DATE) ORDER BY CAST(p.createdAt AS DATE) ASC")
    List<Object[]> findDailyEnergyTrends(@Param("since") LocalDateTime since);

    List<Post> findByEnergyScoreGreaterThanEqualOrderByCreatedAtDesc(int threshold);

    @Query("SELECT COUNT(p) FROM Post p WHERE p.createdAt BETWEEN :from AND :to")
    long countByCreatedAtBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    long countByFlaggedTrue();

    /** Count of unreviewed flagged posts. */
    long countByFlaggedTrueAndReviewedFalse();

    @Query("SELECT CAST(p.createdAt AS DATE), p.emotionTag, COUNT(p) FROM Post p WHERE p.createdAt >= :since GROUP BY CAST(p.createdAt AS DATE), p.emotionTag ORDER BY CAST(p.createdAt AS DATE) ASC")
    List<Object[]> findDailyEmotionBreakdown(@Param("since") LocalDateTime since);

    /** Posts by emotion for filtering. */
    List<Post> findByEmotionTagOrderByCreatedAtDesc(String emotionTag);

    /** Posts by emotion for filtering (excluding flagged/crisis posts). */
    List<Post> findByFlaggedFalseAndEmotionTagOrderByCreatedAtDesc(String emotionTag);

    /** Count by emotion tag. */
    @Query("SELECT p.emotionTag, COUNT(p) FROM Post p GROUP BY p.emotionTag")
    List<Object[]> countByEmotionTag();
}
