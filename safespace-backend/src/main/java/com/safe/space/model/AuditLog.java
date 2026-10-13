package com.safe.space.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * Persistent Audit Log entity.
 * Records administrative actions, security lockouts, database maintenance, and state changes.
 */
@Entity
@Table(name = "audit_logs", indexes = {
        @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
        @Index(name = "idx_audit_actor", columnList = "actor"),
        @Index(name = "idx_audit_action", columnList = "action"),
        @Index(name = "idx_audit_severity", columnList = "severity")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @Column(nullable = false, length = 100)
    private String actor;

    @Column(nullable = false, length = 100)
    private String action;

    @Column(nullable = false, length = 20)
    private String severity; // SUCCESS, INFO, WARN, CRITICAL

    @Column(length = 2000)
    private String details;

    @Column(length = 200)
    private String target;

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
    }
}
