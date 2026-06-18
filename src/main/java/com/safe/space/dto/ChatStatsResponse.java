package com.safe.space.dto;

import lombok.*;

import java.util.List;

/**
 * Analytics on the anonymized chat system.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatStatsResponse {

    private long totalSessions;
    private long waitingSessions;
    private long activeSessions;
    private long closedSessions;
    private long crisisSessions;
    private Double avgMessagesPerSession;

    private List<StatusCount> statusDistribution;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class StatusCount {
        private String status;
        private long count;
    }
}
