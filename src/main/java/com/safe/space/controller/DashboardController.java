package com.safe.space.controller;

import com.safe.space.dto.*;
import com.safe.space.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Psychometrician Monitoring Dashboard REST controller.
 *
 * Provides a centralized administrative view that aggregates data
 * from all subsystems into three monitoring endpoints:
 *
 *   GET /api/dashboard/overview   — Campus-wide snapshot with key metrics
 *   GET /api/dashboard/alerts     — Real-time priority-sorted crisis feed
 *   GET /api/dashboard/trends     — Daily time-series for emotional climate
 */
@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    /**
     * Campus-wide overview: total posts, energy distribution,
     * emotion breakdown, crisis summary, kit effectiveness, chat activity.
     */
    @GetMapping("/overview")
    public ResponseEntity<DashboardOverviewResponse> getOverview() {
        return ResponseEntity.ok(dashboardService.getOverview());
    }

    /**
     * Real-time crisis alerts feed.
     * Combines flagged posts, crisis chats, and high-energy posts
     * into a unified, severity-sorted alert list.
     */
    @GetMapping("/alerts")
    public ResponseEntity<DashboardAlertsResponse> getAlerts() {
        return ResponseEntity.ok(dashboardService.getAlerts());
    }

    /**
     * Daily trend data for charting emotional climate over time.
     * @param days number of days to include (default 30)
     */
    @GetMapping("/trends")
    public ResponseEntity<DashboardTrendsResponse> getTrends(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(dashboardService.getTrends(days));
    }
}
