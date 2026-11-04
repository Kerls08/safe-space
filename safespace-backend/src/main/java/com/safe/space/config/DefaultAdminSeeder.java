package com.safe.space.config;

import com.safe.space.repository.PostRepository;
import com.safe.space.service.CrisisAlertService;
import com.safe.space.service.SensitiveWordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Startup runner responsible for database schema verification and
 * historical post data sanitization.
 *
 * Security Note:
 * In accordance with OWASP security best practices, user accounts and credentials
 * are strictly managed in the database (PostgreSQL / Neon) and are NEVER hardcoded
 * or seeded directly inside application source code.
 */
@Component
@Slf4j
public class DefaultAdminSeeder implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;
    private final PostRepository postRepository;
    private final SensitiveWordService sensitiveWordService;
    private final CrisisAlertService crisisAlertService;

    public DefaultAdminSeeder(JdbcTemplate jdbcTemplate,
                              PostRepository postRepository,
                              SensitiveWordService sensitiveWordService,
                              CrisisAlertService crisisAlertService) {
        this.jdbcTemplate = jdbcTemplate;
        this.postRepository = postRepository;
        this.sensitiveWordService = sensitiveWordService;
        this.crisisAlertService = crisisAlertService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("── Initializing Safe Space Database Startup Verification ──");

        try {
            jdbcTemplate.execute("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS deleted_by_student BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS deleted_by_professional BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("UPDATE chat_sessions SET deleted_by_student = FALSE WHERE deleted_by_student IS NULL");
            jdbcTemplate.execute("UPDATE chat_sessions SET deleted_by_professional = FALSE WHERE deleted_by_professional IS NULL");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP");
            jdbcTemplate.execute("ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS archived_by VARCHAR(50)");
            jdbcTemplate.execute("UPDATE crisis_alerts SET archived = FALSE WHERE archived IS NULL");
            jdbcTemplate.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP");
            jdbcTemplate.execute("UPDATE posts SET archived = FALSE WHERE archived IS NULL");
            jdbcTemplate.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delivered BOOLEAN DEFAULT FALSE NOT NULL");
            jdbcTemplate.execute("UPDATE chat_messages SET delivered = FALSE WHERE delivered IS NULL");
            log.info("Schema integrity verified for chat_sessions, chat_messages, crisis_alerts, and posts tables.");
        } catch (Exception e) {
            log.warn("Database column check on schema tables: {}", e.getMessage());
        }

        // Sanitize historical database posts: ensure any post with crisis or sensitive words is flagged
        sanitizeHistoricalPosts();

        log.info("Safe Space startup tasks completed. All user accounts are securely managed via the database.");
    }

    private void sanitizeHistoricalPosts() {
        try {
            var posts = postRepository.findAll();
            int count = 0;
            for (var p : posts) {
                if (p.getContent() == null || p.getContent().isBlank()) continue;
                var scan = sensitiveWordService.scan(p.getContent());
                if (scan.blocked()) {
                    boolean wasFlagged = p.isFlagged();
                    p.setFlagged(true);
                    p.setFlaggedKeywords(scan.detectedWords());
                    if (scan.hasCrisis()) {
                        p.setSeverity(scan.severity());
                        try {
                            crisisAlertService.alertCrisisPost(
                                    p.getPostId(), p.getPseudonym(), p.getContent(),
                                    p.getEmotionTag(), p.getEnergyScore(),
                                    scan.severity(), scan.detectedWords());
                        } catch (Exception ex) {
                            log.debug("Crisis alert already exists or failed for post {}: {}", p.getPostId(), ex.getMessage());
                        }
                    }
                    postRepository.save(p);
                    if (!wasFlagged) {
                        count++;
                    }
                }
            }
            if (count > 0) {
                log.info("Sanitized {} historical posts containing crisis/sensitive words (set flagged=true).", count);
            }
        } catch (Exception e) {
            log.warn("Historical post sanitization encountered error: {}", e.getMessage());
        }
    }
}
