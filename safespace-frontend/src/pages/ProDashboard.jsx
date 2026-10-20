import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard.css';

export function getClinicalBand(score) {
  const val = parseFloat(score) || 0;
  if (val >= 8.5) {
    return { label: 'Acute Intensity', tier: 'ACUTE', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', desc: 'Crisis threshold: priority psychological triage triggered' };
  }
  if (val >= 7.0) {
    return { label: 'Elevated Tension', tier: 'ELEVATED', color: '#EA580C', bg: '#FFEDD5', border: '#FED7AA', desc: 'Heightened affective arousal: professional observation advised' };
  }
  if (val >= 4.0) {
    return { label: 'Moderate Stress', tier: 'MODERATE', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A', desc: 'Situational strain: adaptive wellness resources recommended' };
  }
  return { label: 'Balanced / Low', tier: 'BALANCED', color: '#059669', bg: '#D1FAE5', border: '#A7F3D0', desc: 'Baseline emotional state: routine psychological observation' };
}

const EMOTION_COLORS = {
  'Anxious': '#f59e0b',
  'Sad': '#3b82f6',
  'Angry': '#ef4444',
  'Lonely': '#8b5cf6',
  'Frustrated': '#f97316',
  'Neutral': '#6b7280',
  'Relieved': '#10b981',
  'Happy': '#059669'
};

const TIER_COLORS = {
  'low': '#059669',
  'mid': '#f59e0b',
  'high': '#ef4444',
  'crisis': '#7f1d1d'
};

function SvgDonutChart({ emotions = [], total = 0 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const validTotal = total > 0 ? total : emotions.reduce((acc, e) => acc + (e.count || 0), 0);
  const size = 220;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const sorted = [...emotions].sort((a, b) => (b.count || 0) - (a.count || 0));

  let accumulated = 0;
  const slices = sorted.map((e, idx) => {
    const count = e.count || 0;
    const ratio = validTotal > 0 ? count / validTotal : 0;
    const strokeDasharray = `${ratio * circumference} ${circumference}`;
    const strokeDashoffset = -accumulated * circumference;
    accumulated += ratio;
    const pct = validTotal > 0 ? Math.round(ratio * 100) : 0;
    const color = EMOTION_COLORS[e.emotion] || '#6B7280';
    const band = getClinicalBand(e.avgEnergy || 5);
    return {
      ...e,
      idx,
      ratio,
      pct,
      color,
      band,
      strokeDasharray,
      strokeDashoffset
    };
  });

  const dominant = slices.length > 0 ? slices[0] : null;

  return (
    <div className="svg-donut-wrap">
      <div className="donut-chart-container">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E1E8EB"
            strokeWidth={strokeWidth}
          />
          {slices.map((s) => (
            <circle
              key={s.emotion}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={hoveredIdx === s.idx ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={s.strokeDasharray}
              strokeDashoffset={s.strokeDashoffset}
              strokeLinecap="round"
              className="donut-slice"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              onMouseEnter={() => setHoveredIdx(s.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>
        <div className="donut-center-text">
          <div className="donut-center-val">
            {hoveredIdx !== null ? slices[hoveredIdx]?.count : validTotal}
          </div>
          <div className="donut-center-label">
            {hoveredIdx !== null ? slices[hoveredIdx]?.emotion : 'Total Expressions'}
          </div>
          {hoveredIdx !== null ? (
            <div className="donut-center-sub" style={{ color: slices[hoveredIdx]?.color }}>
              {slices[hoveredIdx]?.pct}% • {slices[hoveredIdx]?.band.label}
            </div>
          ) : dominant ? (
            <div className="donut-center-sub">
              {dominant.emotion} ({dominant.pct}%)
            </div>
          ) : null}
        </div>
      </div>

      <div className="svg-donut-legend">
        {slices.length === 0 ? (
          <div className="donut-empty-legend">No emotion reflections logged yet</div>
        ) : (
          slices.map((s) => (
            <div
              key={s.emotion}
              className={`donut-legend-item ${hoveredIdx === s.idx ? 'is-active' : ''}`}
              onMouseEnter={() => setHoveredIdx(s.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="donut-legend-left">
                <span className="donut-color-dot" style={{ background: s.color }}></span>
                <span className="donut-emotion-name">{s.emotion}</span>
              </div>
              <div className="donut-legend-right">
                <span className="donut-count">{s.count}</span>
                <span className="donut-pct">{s.pct}%</span>
                <span
                  className="donut-band-tag"
                  style={{ background: s.band.bg, color: s.band.color, borderColor: s.band.border }}
                >
                  {s.avgEnergy ? (Number.isInteger(s.avgEnergy) ? s.avgEnergy : s.avgEnergy.toFixed(1)) : 'N/A'}/10
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SvgLineTrendChart({ snapshots = [] }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const svgRef = useRef(null);

  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="trend-empty-state">
        <p>No 7-day longitudinal telemetry recorded yet.</p>
      </div>
    );
  }

  const width = 540;
  const height = 220;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const getY = (val) => {
    const clamped = Math.max(1, Math.min(10, val));
    return paddingTop + ((10 - clamped) / 9) * chartH;
  };

  const getX = (index) => {
    if (snapshots.length <= 1) return paddingLeft + chartW / 2;
    return paddingLeft + (index / (snapshots.length - 1)) * chartW;
  };

  const points = snapshots.map((s, idx) => ({
    ...s,
    x: getX(idx),
    y: getY(s.avgEnergy || 5),
    band: getClinicalBand(s.avgEnergy || 5)
  }));

  let pathD = '';
  if (points.length === 1) {
    pathD = `M ${points[0].x - 20} ${points[0].y} L ${points[0].x + 20} ${points[0].y}`;
  } else {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
  }

  const bottomY = paddingTop + chartH;
  const areaD = points.length > 1
    ? `${pathD} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`
    : '';

  const thresholdY = getY(8.0);

  const handlePointerMove = (e) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const svgX = (clientX / rect.width) * width;
    const svgY = (clientY / rect.height) * height;

    // Generous boundary check within chart bounds
    if (
      svgY < paddingTop - 25 ||
      svgY > height - 5 ||
      svgX < paddingLeft - 30 ||
      svgX > width - paddingRight + 30
    ) {
      setHoveredPoint(null);
      return;
    }

    // Find the closest point along the X axis
    let closest = points[0];
    let minDiff = Math.abs(points[0].x - svgX);
    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closest = points[i];
      }
    }

    setHoveredPoint((prev) => (prev?.date === closest.date ? prev : closest));
  };

  const handlePointerLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div className="svg-trend-wrap">
      <div className="trend-chart-container">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="trend-svg"
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerLeave}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#243E4C" stopOpacity="0.12" />
              <stop offset="60%" stopColor="#243E4C" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#F4F7F7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[10, 8, 6, 4, 2].map((val) => {
            const y = getY(val);
            return (
              <g key={val} style={{ pointerEvents: 'none' }}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E1E8EB"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  fontSize="10"
                  textAnchor="end"
                  fill="#728590"
                  fontWeight="600"
                >
                  {val}.0
                </text>
              </g>
            );
          })}

          <line
            x1={paddingLeft}
            y1={thresholdY}
            x2={width - paddingRight}
            y2={thresholdY}
            stroke="#DC2626"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={width - paddingRight - 4}
            y={thresholdY - 5}
            fontSize="9"
            textAnchor="end"
            fill="#DC2626"
            fontWeight="700"
            style={{ pointerEvents: 'none' }}
          >
            Clinical Threshold (8.0)
          </text>

          {areaD && <path d={areaD} fill="url(#areaGradient)" style={{ pointerEvents: 'none' }} />}

          <path
            d={pathD}
            fill="none"
            stroke="#243E4C"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />

          {/* Seamless crosshair guideline when hovering anywhere on curve */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              y1={paddingTop}
              x2={hoveredPoint.x}
              y2={bottomY}
              stroke="#CBD5E1"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {points.map((p, idx) => {
            const isHovered = hoveredPoint?.date === p.date;
            return (
              <g key={idx} style={{ pointerEvents: 'none' }}>
                {isHovered && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="12"
                    fill={p.band.color}
                    fillOpacity="0.2"
                    className="trend-point-halo"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6.5 : 4.5}
                  fill="#FFFFFF"
                  stroke={p.band.color}
                  strokeWidth={isHovered ? 3 : 2.5}
                  className={`trend-point ${isHovered ? 'active' : ''}`}
                />
                <text
                  x={p.x}
                  y={height - 12}
                  fontSize="10"
                  textAnchor="middle"
                  fill={isHovered ? '#243E4C' : '#728590'}
                  fontWeight={isHovered ? '700' : '600'}
                >
                  {p.date ? p.date.substring(5) : ''}
                </text>
                <text
                  x={p.x}
                  y={height - 2}
                  fontSize="8.5"
                  textAnchor="middle"
                  fill={isHovered ? '#243E4C' : '#728590'}
                  fontWeight={isHovered ? '600' : '400'}
                >
                  {p.postCount} posts
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredPoint && (() => {
          const leftPct = (hoveredPoint.x / width) * 100;
          const isNearTop = hoveredPoint.y < 65;
          let translateX = '-50%';
          let arrowLeft = '50%';
          if (leftPct < 18) {
            translateX = '-15%';
            arrowLeft = '18%';
          } else if (leftPct > 82) {
            translateX = '-85%';
            arrowLeft = '82%';
          }

          return (
            <div
              className={`svg-chart-tooltip ${isNearTop ? 'tooltip-bottom' : 'tooltip-top'}`}
              style={{
                left: `${leftPct}%`,
                top: `${(hoveredPoint.y / height) * 100}%`,
                transform: isNearTop
                  ? `translate(${translateX}, 16px)`
                  : `translate(${translateX}, calc(-100% - 16px))`,
                '--arrow-left': arrowLeft
              }}
            >
              <div className="tooltip-date">{hoveredPoint.date}</div>
              <div className="tooltip-score">
                <strong>{hoveredPoint.avgEnergy ? hoveredPoint.avgEnergy.toFixed(1) : 'N/A'} / 10</strong>
                <span className="tooltip-band" style={{ color: hoveredPoint.band.color }}>
                  {hoveredPoint.band.label}
                </span>
              </div>
              <div className="tooltip-volume">{hoveredPoint.postCount} student expressions</div>
            </div>
          );
        })()}
      </div>

      <div className="trend-legend-bar">
        <div className="trend-legend-pill">
          <span className="legend-indicator-line"></span>
          <span>Affective Intensity Curve</span>
        </div>
        <div className="trend-legend-pill alert-thresh">
          <span className="legend-indicator-dashed"></span>
          <span>Acute Threshold (≥ 8.0)</span>
        </div>
      </div>
    </div>
  );
}

function SeveritySpectrumBar({ low = 0, mod = 0, high = 0, total = 0 }) {
  const effectiveTotal = total > 0 ? total : Math.max(1, low + mod + high);
  const lowPct = Math.round((low / effectiveTotal) * 100);
  const modPct = Math.round((mod / effectiveTotal) * 100);
  const highPct = Math.max(0, 100 - lowPct - modPct);

  return (
    <div className="severity-spectrum-wrap">
      <div className="severity-segmented-bar">
        {lowPct > 0 && (
          <div
            className="severity-segment low"
            style={{ width: `${lowPct}%` }}
            title={`Balanced / Low (1–3): ${low} students (${lowPct}%)`}
          >
            {lowPct >= 10 && <span>{lowPct}%</span>}
          </div>
        )}
        {modPct > 0 && (
          <div
            className="severity-segment mod"
            style={{ width: `${modPct}%` }}
            title={`Moderate Strain (4–7): ${mod} students (${modPct}%)`}
          >
            {modPct >= 10 && <span>{modPct}%</span>}
          </div>
        )}
        {highPct > 0 && (
          <div
            className="severity-segment high"
            style={{ width: `${highPct}%` }}
            title={`Acute Distress (8–10): ${high} students (${highPct}%)`}
          >
            {highPct >= 10 && <span>{highPct}%</span>}
          </div>
        )}
      </div>

      <div className="severity-legend-grid">
        <div className="severity-legend-card low">
          <div className="card-top">
            <span className="clinical-indicator-dot low"></span>
            <span className="tier-name">Balanced (1–3)</span>
          </div>
          <div className="card-val">{low} <span className="card-pct">({lowPct}%)</span></div>
          <div className="card-desc">Baseline psychological state; routine peer mirror support.</div>
        </div>

        <div className="severity-legend-card mod">
          <div className="card-top">
            <span className="clinical-indicator-dot mod"></span>
            <span className="tier-name">Moderate (4–7)</span>
          </div>
          <div className="card-val">{mod} <span className="card-pct">({modPct}%)</span></div>
          <div className="card-desc">Situational strain; self-directed calm-down kit recommended.</div>
        </div>

        <div className="severity-legend-card high">
          <div className="card-top">
            <span className="clinical-indicator-dot high"></span>
            <span className="tier-name">Acute (8–10)</span>
          </div>
          <div className="card-val">{high} <span className="card-pct">({highPct}%)</span></div>
          <div className="card-desc">Acute distress threshold; active psychological triage monitoring.</div>
        </div>
      </div>
    </div>
  );
}

function PriorityTriageWidget({ alerts = [], totalAlerts = 0, overview }) {
  // Show all unresolved alerts in a smoothly scrollable list (3-4 visible in frame)
  const displayAlerts = alerts;

  return (
    <div className="triage-widget">
      <div className="triage-widget-header">
        <div>
          <h3>Clinical Triage Priority</h3>
          <p className="card-subtitle">Active psychological alerts requiring professional review</p>
        </div>
        <Link to="/crisis-alerts" className="btn-open-alerts" title="Open full triage room">
          <span>Alerts Console</span>
          {totalAlerts > 0 && <span className="triage-count-badge">{totalAlerts}</span>}
          <i className="fas fa-arrow-right"></i>
        </Link>
      </div>

      <div className="triage-list">
        {displayAlerts.length === 0 ? (
          <div className="triage-empty">
            <span className="triage-empty-indicator">
              <i className="fas fa-check"></i>
            </span>
            <div>
              <strong>All Clear</strong>
              <p>No unreviewed crisis alerts. Campus affective climate is steady.</p>
            </div>
          </div>
        ) : (
          displayAlerts.map((a, idx) => {
            const severityStr = (a.severity || '').toLowerCase();
            const energyVal = a.energyScore ? parseInt(a.energyScore, 10) : null;

            const isCritical =
              severityStr === 'critical' ||
              (a.alertType || '').toLowerCase() === 'crisis_post' ||
              (a.alertType || '').toLowerCase() === 'crisis_chat' ||
              (a.alertType || '').toLowerCase() === 'repeat_crisis';

            const isHigh =
              !isCritical &&
              (severityStr === 'high' || (energyVal !== null && energyVal >= 9));

            const isElevated =
              !isCritical &&
              !isHigh &&
              (severityStr === 'elevated' || (energyVal !== null && energyVal === 8));

            const badgeClass = isCritical
              ? 'critical'
              : isHigh
              ? 'high'
              : isElevated
              ? 'elevated'
              : 'moderate';

            const badgeLabel = isCritical
              ? 'CRITICAL'
              : isHigh
              ? 'HIGH'
              : isElevated
              ? 'ELEVATED'
              : 'MODERATE';

            const typeLabel = (a.alertType || '').replace(/_/g, ' ');

            return (
              <div key={a.id || a.referenceId || idx} className={`triage-mini-item ${badgeClass}`}>
                <div className="mini-item-header">
                  <span className={`mini-item-badge ${badgeClass}`}>
                    {badgeLabel}
                  </span>
                  <span className="mini-item-type">{typeLabel}</span>
                  {energyVal !== null && (
                    <span className="mini-item-score-pill">
                      {energyVal}/10
                    </span>
                  )}
                  <span className="mini-item-time">{timeAgo(a.timestamp)}</span>
                </div>
                <div className="mini-item-summary">{a.summary || a.message || 'Crisis reflection flagged'}</div>
              </div>
            );
          })
        )}
      </div>

      <div className="triage-ops-footer">
        <div className="triage-op-pill">
          <span className="op-title">Support Dialogues</span>
          <span className="op-stat">
            <strong>{overview?.chatSessionsActive || 0}</strong> active • <strong>{overview?.chatSessionsWaiting || 0}</strong> waiting
          </span>
        </div>
        <div className="triage-op-pill">
          <span className="op-title">Grounding Exercises</span>
          <span className="op-stat">
            <strong>{overview?.totalKitPrescriptions || 0}</strong> prescribed ({overview?.kitCompletionRate || 0}% completed)
          </span>
        </div>
      </div>
    </div>
  );
}

function parseDateString(ds) {
  if (!ds) return null;
  if (ds instanceof Date) return ds;
  let str = String(ds).trim();
  if (!str.endsWith('Z') && !str.includes('+') && !/[-+]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(ds) : d;
}

function timeAgo(ts) {
  const parsed = parseDateString(ts);
  if (!parsed || isNaN(parsed.getTime())) return '';
  const diff = Date.now() - parsed.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function formatDateTime(iso) {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return iso;
  }
}

export default function ProDashboard() {
  const { updateBadge } = useAuth();
  const [overview, setOverview] = useState(null);
  const [alertsData, setAlertsData] = useState({ totalAlerts: 0, alerts: [] });
  const [trendsData, setTrendsData] = useState({ dailySnapshots: [], emotionTrend: [] });
  const [lastUpdated, setLastUpdated] = useState('just now');
  const [isSpinning, setIsSpinning] = useState(false);

  // Monthly report state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportData, setReportData] = useState(null);

  const isMountedRef = useRef(true);

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    setIsSpinning(true);
    try {
      const [ov, al, tr] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getAlerts(),
        dashboardApi.getTrends(7)
      ]);
      if (!isMountedRef.current) return;
      setOverview(ov);
      if (ov && ov.flaggedPosts !== undefined) {
        localStorage.setItem('safespace_seen_flagged_posts', String(ov.flaggedPosts));
      }
      updateBadge('pro-dashboard', 0);
      setAlertsData(al);
      setTrendsData(tr);
      setLastUpdated('just now');
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsSpinning(false);
      }
    }
  }, [updateBadge]);

  // Clear pro-dashboard badge on mount & record last seen timestamp
  useEffect(() => {
    updateBadge('pro-dashboard', 0);
    localStorage.setItem('safespace_last_seen_dashboard', new Date().toISOString());
    return () => {
      updateBadge('pro-dashboard', 0);
    };
  }, [updateBadge]);

  useEffect(() => {
    isMountedRef.current = true;
    loadDashboard();

    // Auto-refresh interval (15s)
    const refreshTimer = setInterval(() => {
      loadDashboard();
    }, 15000);

    // "just now" -> "a few seconds ago" timer
    const agoTimer = setInterval(() => {
      setLastUpdated((prev) => (prev === 'just now' ? 'a few seconds ago' : prev));
    }, 10000);

    return () => {
      isMountedRef.current = false;
      clearInterval(refreshTimer);
      clearInterval(agoTimer);
    };
  }, [loadDashboard]);

  // Generate month options
  useEffect(() => {
    const now = new Date();
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      opts.push({ value: `${y}-${m}`, label: monthName });
    }
    setMonthOptions(opts);
    if (opts.length > 0) {
      setSelectedMonth(opts[0].value);
    }
  }, []);

  const openMonthlyReportModal = () => {
    setReportModalOpen(true);
    document.body.style.overflow = 'hidden';
    fetchReport();
  };

  const closeMonthlyReportModal = () => {
    setReportModalOpen(false);
    document.body.style.overflow = '';
  };

  const fetchReport = async (monthVal) => {
    const targetMonth = monthVal || selectedMonth;
    if (!targetMonth) return;
    const [year, month] = targetMonth.split('-');

    setReportLoading(true);
    setReportError('');
    setReportData(null);

    try {
      const data = await dashboardApi.getMonthlyReport(year, month);
      setReportData(data);
    } catch (err) {
      console.error('Failed to generate monthly report:', err);
      setReportError('Unable to compile monthly report: ' + (err.message || 'Network error'));
    } finally {
      setReportLoading(false);
    }
  };

  const handleMonthChange = (e) => {
    const val = e.target.value;
    setSelectedMonth(val);
    fetchReport(val);
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculations for overview stats
  const eClass = overview
    ? overview.averageEnergyToday >= 7
      ? 'down'
      : overview.averageEnergyToday >= 4
      ? 'neutral'
      : 'up'
    : 'neutral';

  const maxEmotionCount = overview && overview.emotionBreakdown
    ? Math.max(...overview.emotionBreakdown.map((e) => e.count), 1)
    : 1;

  const totalReplies = overview ? overview.totalAutoReplies || 0 : 0;

  const chatData = overview
    ? [
        { label: 'Active', count: overview.chatSessionsActive || 0, color: '#10b981' },
        { label: 'Waiting', count: overview.chatSessionsWaiting || 0, color: '#f59e0b' },
        { label: 'Closed', count: overview.chatSessionsClosed || 0, color: '#94a3b8' }
      ]
    : [];
  const maxChat = Math.max(...chatData.map((c) => c.count), 1);

  // Daily snapshots for trend chart
  const maxPosts = trendsData.dailySnapshots.length > 0
    ? Math.max(...trendsData.dailySnapshots.map((s) => s.postCount), 1)
    : 1;

  // Emotion trends
  const maxEmo = trendsData.emotionTrend.length > 0
    ? Math.max(...trendsData.emotionTrend.map((e) => e.count), 1)
    : 1;
  const uniqueEmotions = [...new Set(trendsData.emotionTrend.map((e) => e.emotion))];

  // Sorted alerts
  const sortedAlerts = [...(alertsData.alerts || [])].sort((a, b) => {
    const tA = parseDateString(a.timestamp)?.getTime() || 0;
    const tB = parseDateString(b.timestamp)?.getTime() || 0;
    return tB - tA;
  });

  const avgEnergyScore = overview?.averageEnergyScore || 0;
  const energyBand = getClinicalBand(avgEnergyScore);
  const formattedEnergyScore = typeof avgEnergyScore === 'number'
    ? (Number.isInteger(avgEnergyScore) ? avgEnergyScore : avgEnergyScore.toFixed(1))
    : (parseFloat(avgEnergyScore) ? parseFloat(avgEnergyScore).toFixed(1) : 'N/A');

  const dominantEmotion = overview?.emotionBreakdown?.length > 0
    ? [...overview.emotionBreakdown].sort((a, b) => (b.count || 0) - (a.count || 0))[0]
    : null;
  const dominantPct = overview?.totalPosts > 0 && dominantEmotion
    ? Math.round((dominantEmotion.count / overview.totalPosts) * 100)
    : 0;

  return (
    <div className="dash-layout">
      <div className="dash-container">
        {/* Header */}
        <div className="dash-header">
          <div>
            <h1>Monitoring Dashboard</h1>
            <div className="last-updated">
              <span className="live-dot"></span>
              <span>
                Live: updated <span id="lastUpdated">{lastUpdated}</span>
              </span>
            </div>
          </div>
          <div className="dash-actions">
            <button
              className="monthly-report-trigger-btn"
              id="monthlyReportBtn"
              onClick={openMonthlyReportModal}
            >
              <i className="fas fa-file-invoice"></i> Monthly Report
            </button>
            <button
              className={`refresh-btn ${isSpinning ? 'spinning' : ''}`}
              id="refreshBtn"
              onClick={loadDashboard}
            >
              <i className="fas fa-rotate-right"></i> Refresh
            </button>
          </div>
        </div>

        {/*  TIER 1: EXECUTIVE CLINICAL PULSE (Grouped into 2 Clean Domains)  */}
        <div className="dash-pulse-section">
          {/* Domain 1: Campus Affective Climate */}
          <div className="kpi-domain-group">
            <div className="domain-group-header">
              <span className="domain-group-tag climate">Campus Affective Climate</span>
              <span className="domain-group-hint">Aggregated student self-report telemetry</span>
            </div>
            <div className="kpi-domain-cards">
              {/* Card 1: Total Expressions */}
              <div className="stat-card">
                <div className="stat-card-value">{overview ? overview.totalPosts : 'N/A'}</div>
                <div className="stat-card-label">Total Expressions</div>
                <div className="stat-card-sub neutral">
                  <span>+{overview ? overview.totalPostsToday : 0} shared today</span>
                </div>
              </div>

              {/* Card 2: Campus Emotional Intensity */}
              <div className="stat-card intensity-card">
                <div className="stat-card-top-row">
                  <div className="stat-card-value">
                    {formattedEnergyScore} <span className="scale-denominator">/ 10</span>
                  </div>
                  <span
                    className="clinical-band-pill"
                    style={{ background: energyBand.bg, color: energyBand.color, borderColor: energyBand.border }}
                  >
                    <span className="clinical-indicator-dot" style={{ backgroundColor: energyBand.color }}></span>
                    {energyBand.label}
                  </span>
                </div>
                <div className="stat-card-label-row">
                  <span className="stat-card-label">Campus Emotional Intensity</span>
                  <span
                    className="ethical-info-tooltip"
                    title="Scale 1.0–10.0: Calculated from voluntary, anonymous student self-ratings at submission time. Measures momentary affective arousal, not a clinical diagnosis. Scores ≥ 8.0 trigger automated crisis safety resources."
                  >
                    <i className="fas fa-circle-info"></i>
                  </span>
                </div>
                <div className={`stat-card-sub ${eClass}`}>
                  <span>{overview ? overview.averageEnergyToday : 'N/A'} / 10 recorded today</span>
                </div>
              </div>
            </div>
          </div>

          {/* Domain 2: Professional Triage & Operations */}
          <div className="kpi-domain-group">
            <div className="domain-group-header">
              <span className="domain-group-tag triage">Professional Triage & Operations</span>
              <span className="domain-group-hint">Real-time alerts & psychological care queue</span>
            </div>
            <div className="kpi-domain-cards">
              {/* Card 3: Flagged Reflections */}
              <div className="stat-card alert-kpi-card">
                <div
                  className="stat-card-value"
                  style={{ color: (overview?.flaggedPosts || 0) > 0 ? '#DC2626' : '#243E4C' }}
                >
                  {overview ? overview.flaggedPosts : 'N/A'}
                </div>
                <div className="stat-card-label">Flagged Reflections</div>
                <div className={`stat-card-sub ${(overview?.flaggedPosts || 0) > 0 ? 'down' : 'neutral'}`}>
                  <span>{(overview?.flaggedPosts || 0) > 0 ? 'Review required in triage' : 'All clear; no flags'}</span>
                </div>
              </div>

              {/* Card 4: Psychological Support Dialogues */}
              <div className="stat-card">
                <div className="stat-card-value">{overview ? overview.chatSessionsTotal : 'N/A'}</div>
                <div className="stat-card-label">Support Dialogues</div>
                <div className="stat-card-sub neutral">
                  <span>{overview ? overview.chatSessionsWaiting : 0} waiting in queue</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/*  AUTOMATED CLINICAL PULSE BANNER  */}
        <div className="dash-pulse-banner">
          <div className="pulse-banner-indicator" style={{ background: energyBand.color }}></div>
          <div className="pulse-banner-content">
            <div className="pulse-banner-title">
              <strong>Campus Affective Climate:</strong> {energyBand.label} ({formattedEnergyScore} / 10)
            </div>
            <div className="pulse-banner-text">
              {dominantEmotion
                ? `${dominantEmotion.emotion} represents the primary student sentiment (${dominantPct}% of reflections), with an average intensity of ${
                    dominantEmotion.avgEnergy
                      ? Number.isInteger(dominantEmotion.avgEnergy)
                        ? dominantEmotion.avgEnergy
                        : dominantEmotion.avgEnergy.toFixed(1)
                      : 'N/A'
                  }/10.`
                : 'Aggregating live student reflections across campus.'}
              {energyBand.tier === 'ACUTE' || energyBand.tier === 'ELEVATED'
                ? ' Elevated affective intensity observed across campus. Psychological services triage vigilance is recommended.'
                : ' Student emotional expression remains within balanced clinical bounds.'}
            </div>
          </div>
        </div>

        {/*  TIER 2: PRIMARY VISUAL ANALYTICS (Balanced 50/50 Grid)  */}
        <div className="dash-charts-grid">
          {/* Chart 1: 7-Day Continuous Line/Area Chart */}
          <div className="dash-card chart-card">
            <div className="dash-card-header">
              <div>
                <h3>7-Day Emotional Intensity & Volume</h3>
                <p className="card-subtitle">Continuous affective arousal curve with Clinical Alert Threshold at 8.0 / 10</p>
              </div>
            </div>
            <SvgLineTrendChart snapshots={trendsData.dailySnapshots} />
          </div>

          {/* Chart 2: Campus Emotion Share Donut Chart */}
          <div className="dash-card chart-card">
            <div className="dash-card-header">
              <div>
                <h3>Campus Emotion Breakdown</h3>
                <p className="card-subtitle">Proportional distribution of student sentiments with qualitative intensity tiers</p>
              </div>
            </div>
            <SvgDonutChart
              emotions={overview?.emotionBreakdown || []}
              total={overview?.totalPosts || 0}
            />
          </div>
        </div>

        {/*  TIER 3: SEVERITY SPECTRUM & ACTIONABLE TRIAGE  */}
        <div className="dash-bottom-grid">
          {/* Severity Spectrum Bar Graph */}
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <h3>Emotional Severity Spectrum</h3>
                <p className="card-subtitle">Student population distribution across low, moderate, and acute clinical tiers</p>
              </div>
            </div>
            <SeveritySpectrumBar
              low={overview ? overview.energyLow : 0}
              mod={overview ? overview.energyModerate : 0}
              high={overview ? overview.energyHigh : 0}
              total={overview ? overview.totalPosts : 0}
            />
          </div>

          {/* Streamlined Priority Triage & Operations Widget */}
          <div className="dash-card">
            <PriorityTriageWidget
              alerts={sortedAlerts}
              totalAlerts={alertsData.totalAlerts}
              overview={overview}
            />
          </div>
        </div>
      </div>

      {/* Monthly Report Modal */}
      <div
        className={`report-modal-overlay ${reportModalOpen ? 'active' : ''}`}
        id="reportModalOverlay"
        onClick={(e) => {
          if (e.target.id === 'reportModalOverlay') closeMonthlyReportModal();
        }}
      >
        <div className="report-modal-container">
          {/* Modal Header (Screen Only) */}
          <div className="report-modal-header no-print">
            <div className="report-modal-title">
              <i className="fas fa-file-invoice"></i>
              <div>
                <h2>Monthly Student Situationer</h2>
                <p>USTP Balubal Campus, Mental Health & Psychological Services Unit</p>
              </div>
            </div>
            <div className="report-modal-controls">
              <div className="month-selector-group">
                <label htmlFor="reportMonthSelect">
                  <i className="fas fa-calendar-alt"></i> Month:
                </label>
                <select
                  id="reportMonthSelect"
                  value={selectedMonth}
                  onChange={handleMonthChange}
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <button className="report-action-btn print" onClick={handlePrint}>
                <i className="fas fa-print"></i> Print / Save as PDF
              </button>
              <button
                className="report-action-btn close"
                onClick={closeMonthlyReportModal}
                title="Close Report"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="report-modal-body">
            {reportLoading && (
              <div id="reportLoadingState" className="report-loading no-print">
                <i className="fas fa-circle-notch fa-spin"></i>
                <p>Compiling Monthly Situationer for USTP Balubal...</p>
              </div>
            )}

            {reportError && (
              <div id="reportErrorState" className="report-error no-print">
                <i className="fas fa-circle-exclamation"></i>
                <p id="reportErrorMsg">{reportError}</p>
                <button className="refresh-btn" onClick={() => fetchReport()}>
                  <i className="fas fa-redo"></i> Retry
                </button>
              </div>
            )}

            {/* Printable Document Canvas */}
            {reportData && !reportLoading && !reportError && (
              <article id="printableReport" className="printable-document">
                {/* Institutional Header */}
                <header className="rep-header">
                  <div className="rep-top-row">
                    <div className="rep-institution-block">
                      <div className="rep-logo-seal">
                        <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="brand-logo-img" />
                      </div>
                      <div className="rep-inst-titles">
                        <h3>University of Science and Technology of Southern Philippines</h3>
                        <h4>USTP Balubal Campus, Cagayan de Oro City</h4>
                        <p>Office of Student Affairs & Services • Mental Health & Psychological Services Unit • SafeSpace System</p>
                      </div>
                    </div>
                    <div className="rep-doc-meta-badge">
                      <span className="rep-confidential-pill">STRICTLY CONFIDENTIAL</span>
                      <div className="rep-ref-no">
                        REF: USTP-BAL-{reportData.year}-{String(reportData.month).padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  <div className="rep-title-banner">
                    <h1>MONTHLY STUDENT MENTAL HEALTH & EMOTIONAL SITUATIONER</h1>
                    <div className="rep-title-meta-grid">
                      <div>
                        <strong>Reporting Window:</strong> {reportData.startDate} to {reportData.endDate} ({reportData.monthName})
                      </div>
                      <div>
                        <strong>Target Population:</strong> USTP Balubal Campus Students (Aggregated)
                      </div>
                      <div>
                        <strong>Date Generated:</strong> {formatDateTime(reportData.generatedAt)}
                      </div>
                      <div>
                        <strong>Evaluating Officer:</strong> {reportData.generatedBy} ({reportData.generatedByRole})
                      </div>
                    </div>
                  </div>
                </header>

                {/* Compliance Banner */}
                <div className="rep-compliance-notice">
                  <i className="fas fa-shield-halved"></i>
                  <div>
                    <strong>DATA PRIVACY ACT (RA 10173) & MENTAL HEALTH ACT (RA 11036) COMPLIANCE:</strong>{' '}
                    All student reflections, emotional indices, and support interactions are presented in de-identified, cryptographically pseudonymized form. This administrative situationer is issued strictly for psychological climate assessment, wellness resource allocation, and clinical psychological triage.
                  </div>
                </div>

                {/* Section I: Key Indicators */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-chart-line"></i> I. Executive Key Performance Indicators & Climate Assessment
                  </div>
                  <div className="rep-kpi-grid">
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val">{reportData.totalExpressions}</div>
                      <div className="rep-kpi-label">Student Expressions</div>
                      <div className="rep-kpi-sub">Total rants & peer reflections</div>
                    </div>
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val">
                        {reportData.averageEnergyScore} <span className="unit">/ 10</span>
                      </div>
                      <div className="rep-kpi-label">Emotional Energy Baseline</div>
                      <div className="rep-kpi-sub">
                        {reportData.averageEnergyScore >= 7.5 ? (
                          <span className="rep-status-pill distress">Acute Distress</span>
                        ) : reportData.averageEnergyScore >= 5.0 ? (
                          <span className="rep-status-pill mod">Moderate Tension</span>
                        ) : reportData.totalExpressions > 0 ? (
                          <span className="rep-status-pill calm">Calm & Resilient</span>
                        ) : (
                          <span className="rep-status-pill mod">No Expressions</span>
                        )}
                      </div>
                    </div>
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val" style={{ color: '#DC2626' }}>
                        {reportData.totalCrisisAlerts} <span className="unit">cases</span>
                      </div>
                      <div className="rep-kpi-label">Crisis Triggers Intercepted</div>
                      <div className="rep-kpi-sub">
                        {reportData.flaggedPosts} flagged, {reportData.crisisChatSessions} urgent chats
                      </div>
                    </div>
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val">{reportData.totalSupportDialogues}</div>
                      <div className="rep-kpi-label">Psychological Dialogues</div>
                      <div className="rep-kpi-sub">
                        {reportData.activeSupportDialogues} active, {reportData.closedSupportDialogues} completed
                      </div>
                    </div>
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val">{reportData.groundingPrescriptions}</div>
                      <div className="rep-kpi-label">Grounding Exercises</div>
                      <div className="rep-kpi-sub">
                        {reportData.groundingCompletionRate}% completion rate ({reportData.groundingCompletions} done)
                      </div>
                    </div>
                    <div className="rep-kpi-card">
                      <div className="rep-kpi-val">{reportData.uniqueActiveStudents}</div>
                      <div className="rep-kpi-label">Student Pseudonyms</div>
                      <div className="rep-kpi-sub">Distinct active participants</div>
                    </div>
                  </div>
                </section>

                {/* Section II: Campus Emotional Baseline */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-heart-pulse"></i> II. Campus Emotional Baseline & Energy Stratification
                  </div>

                  <div style={{ background: '#F4F7F7', border: '1px solid #E1E8EB', borderRadius: '0.5rem', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                      <span style={{ color: '#166534' }}>
                        <i className="fas fa-circle" style={{ fontSize: '0.6rem' }}></i> Low Tension (1–3): {reportData.energyLow} ({reportData.energyLowPct}%)
                      </span>
                      <span style={{ color: '#92400E' }}>
                        <i className="fas fa-circle" style={{ fontSize: '0.6rem' }}></i> Moderate (4–7): {reportData.energyModerate} ({reportData.energyModeratePct}%)
                      </span>
                      <span style={{ color: '#991B1B' }}>
                        <i className="fas fa-circle" style={{ fontSize: '0.6rem' }}></i> High Tension (8–10): {reportData.energyHigh} ({reportData.energyHighPct}%)
                      </span>
                    </div>
                    <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden', background: '#E2E8F0' }}>
                      <div style={{ width: `${reportData.energyLowPct}%`, background: '#10B981' }} title={`Low Tension: ${reportData.energyLowPct}%`}></div>
                      <div style={{ width: `${reportData.energyModeratePct}%`, background: '#F59E0B' }} title={`Moderate Tension: ${reportData.energyModeratePct}%`}></div>
                      <div style={{ width: `${reportData.energyHighPct}%`, background: '#EF4444' }} title={`High Tension: ${reportData.energyHighPct}%`}></div>
                    </div>
                  </div>

                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'center' }}>#</th>
                          <th>Emotion Tag</th>
                          <th style={{ textAlign: 'center' }}>Frequency</th>
                          <th>Distribution Share (%)</th>
                          <th style={{ textAlign: 'center' }}>Avg Energy</th>
                          <th>Clinical Intensity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.emotionBreakdown && reportData.emotionBreakdown.length > 0 ? (
                          reportData.emotionBreakdown.map((em, idx) => {
                            const color = EMOTION_COLORS[em.emotion] || '#728590';
                            const riskLabel = em.avgEnergy >= 8 ? 'High Tension' : em.avgEnergy >= 5 ? 'Moderate' : 'Low / Stable';
                            const riskColor = em.avgEnergy >= 8 ? '#DC2626' : em.avgEnergy >= 5 ? '#D97706' : '#166534';
                            return (
                              <tr key={em.emotion || idx}>
                                <td style={{ fontWeight: 700, textAlign: 'center', width: '40px' }}>{idx + 1}</td>
                                <td>
                                  <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', background: color, marginRight: '6px' }}></span>
                                  <strong>{em.emotion}</strong>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}>{em.count}</td>
                                <td>
                                  <div className="rep-mini-bar">
                                    <div className="rep-track">
                                      <div className="rep-fill" style={{ width: `${Math.max(em.percentage, 4)}%`, background: color }}></div>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, width: '42px', textAlign: 'right' }}>{em.percentage}%</span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: riskColor }}>{em.avgEnergy}</td>
                                <td style={{ fontSize: '0.7rem', color: riskColor, fontWeight: 600 }}>{riskLabel}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: '#728590', padding: '1rem' }}>
                              No emotional expressions logged for this reporting period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Section III: Department & Year Level Analysis */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-graduation-cap"></i> III. Departmental & Academic Cohort Breakdown
                  </div>
                  <div className="rep-split-grid">
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#243E4C', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                        Academic Department / Program
                      </div>
                      <div className="rep-table-wrap">
                        <table className="rep-table">
                          <thead>
                            <tr>
                              <th>Program</th>
                              <th style={{ textAlign: 'center' }}>Count</th>
                              <th style={{ textAlign: 'right' }}>Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.departmentBreakdown && reportData.departmentBreakdown.length > 0 ? (
                              reportData.departmentBreakdown.map((dept, idx) => (
                                <tr key={dept.department || idx}>
                                  <td><strong>{dept.department}</strong></td>
                                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{dept.count}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{dept.percentage}%</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', color: '#728590', padding: '0.75rem' }}>
                                  No departmental data available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#243E4C', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                        Year Level Distribution
                      </div>
                      <div className="rep-table-wrap">
                        <table className="rep-table">
                          <thead>
                            <tr>
                              <th>Year Level</th>
                              <th style={{ textAlign: 'center' }}>Count</th>
                              <th style={{ textAlign: 'right' }}>Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.yearLevelBreakdown && reportData.yearLevelBreakdown.length > 0 ? (
                              reportData.yearLevelBreakdown.map((yl, idx) => (
                                <tr key={yl.yearLevel || idx}>
                                  <td><strong>{yl.yearLevel}</strong></td>
                                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{yl.count}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{yl.percentage}%</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', color: '#728590', padding: '0.75rem' }}>
                                  No year-level data available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section IV: Crisis Sentinel Log */}
                <section className="rep-section">
                  <div className="rep-section-header" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <i className="fas fa-triangle-exclamation" style={{ color: '#DC2626' }}></i> IV. Crisis Sentinel Interceptions & Risk Audit Log
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#51646E', textTransform: 'none' }}>
                      Reviewed: <span style={{ color: '#166534' }}>{reportData.crisisReviewedCount}</span> | Pending: <span style={{ color: '#DC2626' }}>{reportData.crisisPendingCount}</span>
                    </div>
                  </div>
                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th>Ref ID</th>
                          <th>Source</th>
                          <th>Student Pseudonym</th>
                          <th>Severity</th>
                          <th>Detected Keywords / Snippet</th>
                          <th style={{ textAlign: 'center' }}>Energy</th>
                          <th style={{ textAlign: 'center' }}>Triage Status</th>
                          <th>Reviewer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.crisisIncidents && reportData.crisisIncidents.length > 0 ? (
                          reportData.crisisIncidents.map((c, idx) => {
                            const sevClass = (c.severity || 'moderate').toLowerCase();
                            const isRev = c.reviewed;
                            return (
                              <tr key={c.incidentId || idx}>
                                <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#51646E' }}>
                                  {(c.incidentId || '').substring(0, 18)}…
                                </td>
                                <td style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                                  {c.source === 'RANT_POST' ? (
                                    <>
                                      <i className="fas fa-comment-dots"></i> Rant
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-comments"></i> Chat
                                    </>
                                  )}
                                </td>
                                <td style={{ fontWeight: 700, color: '#182A34' }}>{c.pseudonym}</td>
                                <td>
                                  <span className={`rep-badge ${sevClass}`}>{c.severity}</span>
                                </td>
                                <td style={{ fontSize: '0.7rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                                  <div style={{ fontWeight: 600, color: '#182A34' }}>{c.summary}</div>
                                  {c.flaggedKeywords && (
                                    <div style={{ fontSize: '0.64rem', color: '#DC2626', marginTop: '2px' }}>
                                      Trigger: {c.flaggedKeywords}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#DC2626' }}>{c.energyScore}</td>
                                <td style={{ textAlign: 'center' }}>
                                  {isRev ? (
                                    <span className="rep-badge reviewed">
                                      <i className="fas fa-check"></i> Reviewed
                                    </span>
                                  ) : (
                                    <span className="rep-badge pending">
                                      <i className="fas fa-triangle-exclamation"></i> Pending
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontSize: '0.68rem', color: '#51646E' }}>{c.reviewedBy || 'N/A'}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan="8"
                              style={{ textAlign: 'center', color: '#166534', background: '#F0FDF4', padding: '1rem', fontWeight: 600 }}
                            >
                              <i className="fas fa-shield-check"></i> Zero crisis triggers or high-tension flags recorded during this reporting window.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Section V: Support Dialogues */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-comments"></i> V. Psychological Support Dialogues
                  </div>
                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th>Session ID</th>
                          <th>Student Pseudonym</th>
                          <th>Assigned Professional (RPM/RPsy)</th>
                          <th>Dialogue Topic / Presenting Concern</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th style={{ textAlign: 'center' }}>Messages</th>
                          <th>Date & Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.recentDialogues && reportData.recentDialogues.length > 0 ? (
                          reportData.recentDialogues.map((dlg, idx) => (
                            <tr key={dlg.sessionId || idx}>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#51646E' }}>
                                {(dlg.sessionId || '').substring(0, 16)}…
                              </td>
                              <td style={{ fontWeight: 700 }}>{dlg.studentPseudonym}</td>
                              <td style={{ color: '#0284C7', fontWeight: 600 }}>{dlg.professionalName}</td>
                              <td style={{ fontSize: '0.7rem' }}>{dlg.topic || 'General psychological support'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`rep-badge ${dlg.status === 'ACTIVE' ? 'high' : dlg.status === 'CLOSED' ? 'reviewed' : 'moderate'}`}>
                                  {dlg.status}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{dlg.messageCount}</td>
                              <td style={{ fontSize: '0.68rem', color: '#728590' }}>{formatDateTime(dlg.createdAt)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', color: '#728590', padding: '0.75rem' }}>
                              No psychological support dialogues recorded in this cycle.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Section VI: Grounding Kit Modality Efficacy */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-spa"></i> VI. Adaptive Grounding Kit Modality Efficacy
                  </div>
                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th>Grounding Modality</th>
                          <th style={{ textAlign: 'center' }}>Prescriptions</th>
                          <th style={{ textAlign: 'center' }}>Completions</th>
                          <th style={{ textAlign: 'center' }}>Adherence Rate</th>
                          <th>Efficacy Bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.kitModalities && reportData.kitModalities.length > 0 ? (
                          reportData.kitModalities.map((k, idx) => {
                            const modName =
                              k.kitType === 'breathing'
                                ? '4-7-8 Breathing De-escalation'
                                : k.kitType === 'grounding'
                                ? '5-4-3-2-1 Sensory Grounding'
                                : k.kitType === 'quote'
                                ? 'Affirmative Thought Reframing'
                                : k.kitType;
                            return (
                              <tr key={k.kitType || idx}>
                                <td><strong>{modName}</strong></td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}>{k.prescribedCount}</td>
                                <td style={{ textAlign: 'center', fontWeight: 700, color: '#166534' }}>{k.completedCount}</td>
                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#0284C7' }}>{k.completionRate}%</td>
                                <td>
                                  <div className="rep-mini-bar">
                                    <div className="rep-track">
                                      <div className="rep-fill" style={{ width: `${Math.max(k.completionRate, 3)}%`, background: '#10B981' }}></div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', color: '#728590', padding: '0.75rem' }}>
                              No grounding exercises prescribed in this cycle.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Section VII: Clinical Observations */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-stethoscope"></i> VII. Clinical Observations & Empirical Insights
                  </div>
                  <ul className="rep-bullet-list">
                    {(reportData.clinicalObservations || []).map((obs, idx) => (
                      <li key={idx}>
                        <i className="fas fa-circle-check"></i> <span>{obs}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Section VIII: Recommendations */}
                <section className="rep-section">
                  <div className="rep-section-header">
                    <i className="fas fa-clipboard-check"></i> VIII. Institutional Action Recommendations
                  </div>
                  <ol className="rep-recommend-list">
                    {(reportData.actionRecommendations || []).map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ol>
                </section>

                {/* Section IX: Signatures & Certification */}
                <section className="rep-signatures">
                  <div className="rep-sig-box">
                    <div className="rep-sig-line"></div>
                    <div className="rep-sig-name">{reportData.generatedBy}</div>
                    <div className="rep-sig-role">
                      Evaluating Psychometrician (RPM) / Psychologist (RPsy)<br />Mental Health & Psychological Services Unit
                    </div>
                  </div>
                  <div className="rep-sig-box">
                    <div className="rep-sig-line"></div>
                    <div className="rep-sig-name">Head, Psychological Services</div>
                    <div className="rep-sig-role">
                      Office of Student Affairs & Services<br />USTP Balubal Campus
                    </div>
                  </div>
                  <div className="rep-sig-box">
                    <div className="rep-sig-line"></div>
                    <div className="rep-sig-name">Campus Director</div>
                    <div className="rep-sig-role">
                      USTP Balubal Campus<br />Cagayan de Oro City
                    </div>
                  </div>
                </section>

                {/* Footer */}
                <div className="rep-footer-doc">
                  <span>SafeSpace Student Wellness System • USTP Balubal Campus</span>
                  <span>Certified Compliant with RA 10173 & RA 11036 • End of Report</span>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
