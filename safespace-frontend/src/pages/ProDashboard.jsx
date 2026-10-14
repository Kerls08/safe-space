import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard.css';

const EMOTION_COLORS = {
  'Anxious': '#f59e0b',
  'Sad': '#3b82f6',
  'Angry': '#ef4444',
  'Lonely': '#8b5cf6',
  'Frustrated': '#f97316',
  'Neutral': '#6b7280',
  'Relieved': '#3b82f6',
  'Happy': '#161F36'
};

const TIER_COLORS = {
  'low': '#161F36',
  'mid': '#f59e0b',
  'high': '#ef4444',
  'crisis': '#7f1d1d'
};

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
  if (!iso) return '—';
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
      setAlertsData(al);
      setTrendsData(tr);
      setLastUpdated('just now');
      if (al && typeof al.totalAlerts === 'number') {
        updateBadge('crisis-alerts', al.totalAlerts);
      }
      if (ov && typeof ov.flaggedPosts === 'number') {
        updateBadge('pro-dashboard', ov.flaggedPosts);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsSpinning(false);
      }
    }
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

  return (
    <div className="dash-layout">
      <div className="dash-container">
        {/* Header */}
        <div className="dash-header">
          <div>
            <h1>
              <i className="fas fa-chart-line"></i> Monitoring Dashboard
            </h1>
            <div className="last-updated">
              <span className="live-dot"></span>
              <span>
                Live — updated <span id="lastUpdated">{lastUpdated}</span>
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

        {/* 5 Stat Cards */}
        <div className="stats-row" id="statsRow">
          <div className="stat-card">
            <div className="stat-card-icon">
              <i className="fas fa-comment-dots"></i>
            </div>
            <div className="stat-card-value" id="statPosts">
              {overview ? overview.totalPosts : '—'}
            </div>
            <div className="stat-card-label">Total Expressions</div>
            <div className="stat-card-sub neutral" id="statPostsToday">
              <i className="fas fa-clock"></i> {overview ? overview.totalPostsToday : '—'} today
            </div>
          </div>

          <div className="stat-card blue">
            <div className="stat-card-icon">
              <i className="fas fa-heart-pulse"></i>
            </div>
            <div className="stat-card-value" id="statEnergy">
              {overview ? overview.averageEnergyScore : '—'}
            </div>
            <div className="stat-card-label">Campus Emotional Energy</div>
            <div className={`stat-card-sub ${eClass}`} id="statEnergyToday">
              <i
                className={`fas fa-${
                  eClass === 'down' ? 'arrow-up' : eClass === 'up' ? 'arrow-down' : 'minus'
                }`}
              ></i>{' '}
              {overview ? overview.averageEnergyToday : '—'} today
            </div>
          </div>

          <div className="stat-card red">
            <div className="stat-card-icon">
              <i className="fas fa-shield-halved"></i>
            </div>
            <div className="stat-card-value" id="statCrisis">
              {overview ? overview.totalCrisisEvents : '—'}
            </div>
            <div className="stat-card-label">Crisis Triggers</div>
            <div className="stat-card-sub down" id="statFlagged">
              <i className="fas fa-flag"></i> {overview ? overview.flaggedPosts : '—'} flagged
            </div>
          </div>

          <div className="stat-card amber">
            <div className="stat-card-icon">
              <i className="fas fa-comments"></i>
            </div>
            <div className="stat-card-value" id="statChats">
              {overview ? overview.chatSessionsTotal : '—'}
            </div>
            <div className="stat-card-label">Support Dialogues</div>
            <div className="stat-card-sub neutral" id="statChatWaiting">
              <i className="fas fa-clock"></i> {overview ? overview.chatSessionsWaiting : '—'} waiting
            </div>
          </div>

          <div className="stat-card purple">
            <div className="stat-card-icon">
              <i className="fas fa-spa"></i>
            </div>
            <div className="stat-card-value" id="statKits">
              {overview ? overview.totalKitPrescriptions : '—'}
            </div>
            <div className="stat-card-label">Grounding Exercises</div>
            <div className="stat-card-sub up" id="statKitRate">
              <i className="fas fa-check"></i> {overview ? overview.kitCompletionRate : '—'}% done
            </div>
          </div>
        </div>

        {/* Main Grid: Alerts + Emotions */}
        <div className="dash-grid">
          {/* Alerts */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>
                <i className="fas fa-bell icon-alerts"></i> Crisis Alerts
              </h3>
              {alertsData.totalAlerts > 0 && (
                <span className="badge badge-red" id="alertCount">
                  {alertsData.totalAlerts} alert{alertsData.totalAlerts > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="alert-list" id="alertList">
              {alertsData.totalAlerts === 0 ? (
                <div className="alert-empty">
                  <i className="fas fa-check-circle"></i>
                  <br />
                  No active alerts — campus is calm
                </div>
              ) : (
                sortedAlerts.map((a, i) => {
                  const icon =
                    a.alertType === 'flagged_post'
                      ? 'fa-flag'
                      : a.alertType === 'crisis_chat'
                      ? 'fa-comment-medical'
                      : 'fa-bolt';
                  const typeLabel = (a.alertType || '')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase());
                  const time = a.timestamp ? timeAgo(a.timestamp) : '';

                  return (
                    <div key={a.id || i} className={`alert-item ${a.severity}`}>
                      <div className="alert-icon">
                        <i className={`fas ${icon}`}></i>
                      </div>
                      <div className="alert-content">
                        <div className="alert-title">
                          {typeLabel} — {(a.severity || '').toUpperCase()}
                        </div>
                        <div className="alert-summary">{a.summary}</div>
                        <div className="alert-meta">
                          {a.emotionTag && <span className="tag emotion">{a.emotionTag}</span>}
                          {a.energyScore && <span className="tag energy">⚡{a.energyScore}</span>}
                          {a.flaggedKeywords && (
                            <span className="tag keywords">{a.flaggedKeywords}</span>
                          )}
                          <span>{time}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Emotion Breakdown */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>
                <i className="fas fa-heart-pulse icon-emotions"></i> Emotion Breakdown
              </h3>
            </div>
            <div className="emotion-bars" id="emotionBars">
              {overview?.emotionBreakdown?.map((e) => {
                const pct = (e.count / maxEmotionCount) * 100;
                const color = EMOTION_COLORS[e.emotion] || '#6b7280';
                const energyColor =
                  e.avgEnergy >= 7 ? '#dc2626' : e.avgEnergy >= 4 ? '#d97706' : '#161F36';
                return (
                  <div key={e.emotion} className="emotion-bar-row">
                    <div className="emotion-bar-label">{e.emotion}</div>
                    <div className="emotion-bar-track">
                      <div
                        className="emotion-bar-fill"
                        style={{ width: `${Math.max(pct, 8)}%`, background: color }}
                      >
                        {e.count}
                      </div>
                    </div>
                    <div
                      className="emotion-bar-energy"
                      style={{ background: `${energyColor}15`, color: energyColor }}
                    >
                      ⚡{e.avgEnergy}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="dash-card-header" style={{ marginTop: '1.25rem' }}>
              <h3>
                <i className="fas fa-chart-pie icon-energy"></i> Energy Distribution
              </h3>
            </div>
            <div className="energy-dist" id="energyDist">
              <div className="energy-segment low">
                <div className="val" id="distLow">
                  {overview ? overview.energyLow : '—'}
                </div>
                <div className="lbl">Low (1-3)</div>
              </div>
              <div className="energy-segment mod">
                <div className="val" id="distMod">
                  {overview ? overview.energyModerate : '—'}
                </div>
                <div className="lbl">Moderate (4-7)</div>
              </div>
              <div className="energy-segment high">
                <div className="val" id="distHigh">
                  {overview ? overview.energyHigh : '—'}
                </div>
                <div className="lbl">High (8-10)</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Trends + Reply Tiers + Emotion Trend */}
        <div className="dash-bottom">
          {/* Daily Activity Chart */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>
                <i className="fas fa-chart-bar icon-activity"></i> Daily Activity
              </h3>
              <span className="badge badge-gray" id="trendDays">
                7 days
              </span>
            </div>
            <div className="chart-bars" id="trendChart">
              {trendsData.dailySnapshots.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    color: 'var(--gray)',
                    fontSize: '0.8rem'
                  }}
                >
                  No data yet
                </div>
              ) : (
                trendsData.dailySnapshots.map((s, idx) => {
                  const h = (s.postCount / maxPosts) * 100;
                  const eH = (s.avgEnergy / 10) * 100;
                  return (
                    <React.Fragment key={idx}>
                      <div
                        className="chart-bar"
                        style={{
                          height: `${Math.max(h, 5)}%`,
                          background: 'var(--primary)',
                          opacity: 0.8
                        }}
                      >
                        <div className="tooltip">
                          {s.postCount} posts, avg ⚡{s.avgEnergy}
                        </div>
                      </div>
                      <div
                        className="chart-bar"
                        style={{
                          height: `${Math.max(eH, 5)}%`,
                          background: 'var(--accent)',
                          opacity: 0.6
                        }}
                      >
                        <div className="tooltip">Avg Energy: {s.avgEnergy}</div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>
            <div className="chart-labels" id="trendLabels">
              {trendsData.dailySnapshots.map((s, idx) => (
                <React.Fragment key={idx}>
                  <span>{s.date ? s.date.substring(5) : ''}</span>
                  <span></span>
                </React.Fragment>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '0.5rem',
                fontSize: '0.65rem',
                color: 'var(--gray)'
              }}
            >
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: '#4F46E5',
                    marginRight: '3px'
                  }}
                ></span>
                Posts
              </span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    background: '#38BDF8',
                    marginRight: '3px'
                  }}
                ></span>
                Avg Energy
              </span>
            </div>
          </div>

          {/* Reply Tier Distribution */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>
                <i className="fas fa-robot icon-tiers"></i> Reply Tiers
              </h3>
              <span className="badge badge-green" id="totalReplies">
                {totalReplies} total
              </span>
            </div>
            <div id="tierBars" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {overview?.replyTierDistribution?.length > 0 ? (
                overview.replyTierDistribution.map((t) => {
                  const pct = totalReplies > 0 ? (t.count / totalReplies) * 100 : 0;
                  return (
                    <div key={t.tier} className="emotion-bar-row">
                      <div
                        className="emotion-bar-label"
                        style={{ width: '50px', textTransform: 'uppercase' }}
                      >
                        {t.tier}
                      </div>
                      <div className="emotion-bar-track">
                        <div
                          className="emotion-bar-fill"
                          style={{
                            width: `${Math.max(pct, 5)}%`,
                            background: TIER_COLORS[t.tier] || '#6b7280'
                          }}
                        >
                          {t.count}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--gray)',
                    textAlign: 'center',
                    padding: '0.5rem'
                  }}
                >
                  No replies yet
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--gray-light)'
              }}
            >
              <div className="dash-card-header" style={{ marginBottom: '0.5rem' }}>
                <h3>
                  <i className="fas fa-comments icon-chat"></i> Chat Status
                </h3>
              </div>
              <div
                id="chatStatusBars"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
              >
                {chatData.map((c) => (
                  <div key={c.label} className="emotion-bar-row">
                    <div className="emotion-bar-label" style={{ width: '55px' }}>
                      {c.label}
                    </div>
                    <div className="emotion-bar-track" style={{ height: '1rem' }}>
                      <div
                        className="emotion-bar-fill"
                        style={{
                          width: `${Math.max((c.count / maxChat) * 100, 5)}%`,
                          background: c.color,
                          fontSize: '0.55rem'
                        }}
                      >
                        {c.count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Emotion Trend */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h3>
                <i className="fas fa-wave-square icon-trends"></i> Emotion Trend
              </h3>
            </div>
            <div className="chart-bars" id="emotionTrendChart" style={{ height: '100px' }}>
              {trendsData.emotionTrend.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    color: 'var(--gray)',
                    fontSize: '0.8rem'
                  }}
                >
                  No data
                </div>
              ) : (
                trendsData.emotionTrend.map((e, idx) => {
                  const h = (e.count / maxEmo) * 100;
                  const color = EMOTION_COLORS[e.emotion] || '#6b7280';
                  const dateSub = e.date ? e.date.substring(5) : '';
                  return (
                    <div
                      key={idx}
                      className="chart-bar"
                      style={{ height: `${Math.max(h, 8)}%`, background: color }}
                    >
                      <div className="tooltip">
                        {e.emotion}: {e.count} ({dateSub})
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="chart-labels" id="emotionTrendLabels">
              {trendsData.emotionTrend.map((e, idx) => (
                <span key={idx}>{e.emotion ? e.emotion.substring(0, 3) : ''}</span>
              ))}
            </div>
            <div
              id="emotionTrendLegend"
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginTop: '0.5rem',
                flexWrap: 'wrap',
                fontSize: '0.6rem',
                color: 'var(--gray)'
              }}
            >
              {uniqueEmotions.map((em) => {
                const color = EMOTION_COLORS[em] || '#6b7280';
                return (
                  <span key={em}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '6px',
                        height: '6px',
                        borderRadius: '2px',
                        background: color,
                        marginRight: '2px'
                      }}
                    ></span>
                    {em}
                  </span>
                );
              })}
            </div>
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
                <p>USTP Balubal Campus — Guidance and Counseling Emotional Climate Analysis</p>
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
                        <i className="fas fa-shield-heart"></i>
                      </div>
                      <div className="rep-inst-titles">
                        <h3>University of Science and Technology of Southern Philippines</h3>
                        <h4>USTP Balubal Campus — Cagayan de Oro City</h4>
                        <p>Office of Student Affairs & Services • Guidance and Counseling Center • SafeSpace System</p>
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
                    All student reflections, emotional indices, and support interactions are presented in de-identified, cryptographically pseudonymized form. This administrative situationer is issued strictly for psychological climate assessment, wellness resource allocation, and clinical guidance triage.
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
                      <div className="rep-kpi-label">Counseling Dialogues</div>
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

                  <div style={{ background: '#FAF7F2', border: '1px solid #E2D9CC', borderRadius: '0.5rem', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
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
                            const color = EMOTION_COLORS[em.emotion] || '#64748B';
                            const riskLabel = em.avgEnergy >= 8 ? 'High Tension ⚡' : em.avgEnergy >= 5 ? 'Moderate' : 'Low / Stable';
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
                                <td style={{ textAlign: 'center', fontWeight: 800, color: riskColor }}>⚡ {em.avgEnergy}</td>
                                <td style={{ fontSize: '0.7rem', color: riskColor, fontWeight: 600 }}>{riskLabel}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', color: '#64748B', padding: '1rem' }}>
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
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#161F36', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
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
                                <td colSpan="3" style={{ textAlign: 'center', color: '#64748B', padding: '0.75rem' }}>
                                  No departmental data available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#161F36', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
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
                                <td colSpan="3" style={{ textAlign: 'center', color: '#64748B', padding: '0.75rem' }}>
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
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'none' }}>
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
                                <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#475569' }}>
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
                                <td style={{ fontWeight: 700, color: '#1E293B' }}>{c.pseudonym}</td>
                                <td>
                                  <span className={`rep-badge ${sevClass}`}>{c.severity}</span>
                                </td>
                                <td style={{ fontSize: '0.7rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{c.summary}</div>
                                  {c.flaggedKeywords && (
                                    <div style={{ fontSize: '0.64rem', color: '#DC2626', marginTop: '2px' }}>
                                      Trigger: {c.flaggedKeywords}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 800, color: '#DC2626' }}>⚡{c.energyScore}</td>
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
                                <td style={{ fontSize: '0.68rem', color: '#475569' }}>{c.reviewedBy || '—'}</td>
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
                    <i className="fas fa-comments"></i> V. Guidance Counseling Support Dialogues
                  </div>
                  <div className="rep-table-wrap">
                    <table className="rep-table">
                      <thead>
                        <tr>
                          <th>Session ID</th>
                          <th>Student Pseudonym</th>
                          <th>Assigned Counselor</th>
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
                              <td style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#475569' }}>
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
                              <td style={{ fontSize: '0.68rem', color: '#64748B' }}>{formatDateTime(dlg.createdAt)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', color: '#64748B', padding: '0.75rem' }}>
                              No counseling dialogues recorded in this cycle.
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
                            <td colSpan="5" style={{ textAlign: 'center', color: '#64748B', padding: '0.75rem' }}>
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
                      Evaluating Psychometrician / Psychologist<br />Guidance and Counseling Center
                    </div>
                  </div>
                  <div className="rep-sig-box">
                    <div className="rep-sig-line"></div>
                    <div className="rep-sig-name">Guidance Coordinator</div>
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
