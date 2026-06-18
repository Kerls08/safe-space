package com.safe.space.controller;

import com.safe.space.dto.EnergyAlertResponse;
import com.safe.space.dto.EnergyStatsResponse;
import com.safe.space.dto.EnergyTrendResponse;
import com.safe.space.service.EnergyScoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for energy score analytics.
 *
 * Endpoints:
 *   GET /api/energy/stats              — Overall energy statistics + tier distribution
 *   GET /api/energy/trends?days=30     — Daily energy trends for charting
 *   GET /api/energy/alerts?threshold=8 — High-energy posts for professional review
 */
@RestController
@RequestMapping("/api/energy")
@RequiredArgsConstructor
public class EnergyScoreController {

    private final EnergyScoreService energyScoreService;

    /**
     * Get comprehensive energy score statistics.
     *
     * Returns overall averages (all-time, today, this week),
     * tier distribution (low/mid/high counts and percentages),
     * and per-emotion breakdown with average energy per emotion.
     */
    @GetMapping("/stats")
    public ResponseEntity<EnergyStatsResponse> getEnergyStats() {
        return ResponseEntity.ok(energyScoreService.getEnergyStats());
    }

    /**
     * Get daily energy trends for charting.
     *
     * @param days number of days to look back (default 30, max 365)
     * @return daily data points with average energy, post count, and trend direction
     */
    @GetMapping("/trends")
    public ResponseEntity<EnergyTrendResponse> getEnergyTrends(
            @RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(energyScoreService.getEnergyTrends(days));
    }

    /**
     * Get high-energy posts that may need professional attention.
     *
     * @param threshold minimum energy score to include (default 8)
     * @return list of high-energy posts with truncated content previews
     */
    @GetMapping("/alerts")
    public ResponseEntity<List<EnergyAlertResponse>> getHighEnergyAlerts(
            @RequestParam(defaultValue = "8") int threshold) {
        return ResponseEntity.ok(energyScoreService.getHighEnergyAlerts(threshold));
    }
}
