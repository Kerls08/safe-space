package com.safe.space.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Real-time crisis alerts feed for the psychometrician.
 * Combines flagged posts and crisis chat sessions into
 * a unified, priority-sorted alert feed.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DashboardAlertsResponse {

    private long totalAlerts;
    private List<Alert> alerts;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Alert {
        /** "flagged_post", "crisis_chat", "high_energy_post" */
        private String alertType;
        /** Severity: "critical", "high", "moderate" */
        private String severity;
        private String referenceId;
        private String summary;
        private String emotionTag;
        private Integer energyScore;
        private String flaggedKeywords;
        private String status;
        private LocalDateTime timestamp;
    }
}
