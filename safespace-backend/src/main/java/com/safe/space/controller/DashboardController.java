package com.safe.space.controller;

import com.safe.space.dto.*;
import com.safe.space.model.User;
import com.safe.space.service.DashboardService;
import jakarta.servlet.http.HttpServletRequest;
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

    /**
     * Formal Monthly Situationer Report for USTP Balubal Psychometricians & Guidance Center.
     * Generates aggregated, anonymized student mental health, emotional climate,
     * crisis triggers, and counseling analytics for printing or PDF export.
     *
     * @param year report calendar year (e.g. 2026)
     * @param month report calendar month (1-12)
     */
    @GetMapping("/monthly-report")
    public ResponseEntity<MonthlyReportResponse> getMonthlyReport(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month,
            HttpServletRequest request) {
        User currentUser = (User) request.getAttribute("auth.user");
        int targetYear = (year != null && year > 0) ? year : java.time.LocalDate.now().getYear();
        int targetMonth = (month != null && month >= 1 && month <= 12) ? month : java.time.LocalDate.now().getMonthValue();
        return ResponseEntity.ok(dashboardService.getMonthlyReport(targetYear, targetMonth, currentUser));
    }
}
