package com.safe.space.event;

/**
 * Event published when an administrative or system maintenance action occurs.
 * Listened to by SystemMaintenanceService to populate the live audit log.
 */
public record AdminAuditEvent(
        String actor,
        String action,
        String severity,
        String details,
        String target
) {}
