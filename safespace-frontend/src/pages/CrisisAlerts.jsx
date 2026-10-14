import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertsApi, colleaguesApi, chatApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/alerts.css';

const SEV_ICONS = {
  CRITICAL: 'fa-skull-crossbones',
  HIGH: 'fa-triangle-exclamation',
  MODERATE: 'fa-exclamation',
  LOW: 'fa-info-circle',
  INFO: 'fa-info'
};

const TYPE_LABELS = {
  CRISIS_POST: 'Crisis Post',
  HIGH_ENERGY_POST: 'High Energy Post',
  CRISIS_CHAT: 'Crisis Chat',
  REPEAT_CRISIS: 'Repeat Crisis',
  ENERGY_SPIKE: 'Energy Spike',
  SYSTEM_EVENT: 'System Event'
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

function timeAgo(ds) {
  if (!ds) return '';
  const d = parseDateString(ds);
  if (!d || isNaN(d.getTime())) return '';
  const n = new Date();
  const s = Math.floor((n - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function getEmoji(e) {
  const m = {
    Sad: '😢',
    Angry: '😤',
    Anxious: '😰',
    Lonely: '🥺',
    Frustrated: '😩',
    Neutral: '😐',
    Relieved: '😌',
    Happy: '😊'
  };
  return m[e] || '💭';
}

export default function CrisisAlerts() {
  const navigate = useNavigate();
  const { fullName, username, updateBadge } = useAuth();

  // Active tab: 'needsAction' | 'inProgress' | 'history'
  const [activeTab, setActiveTab] = useState('needsAction');

  // Filters
  const [currentSevFilter, setCurrentSevFilter] = useState('ALL');
  const [currentProgressFilter, setCurrentProgressFilter] = useState('ALL');
  const [currentHistoryFilter, setCurrentHistoryFilter] = useState('ALL');

  // Data
  const [stats, setStats] = useState({ active: 0, inProgress: 0, todayCritical: 0 });
  const [needsActionAlerts, setNeedsActionAlerts] = useState([]);
  const [inProgressAlerts, setInProgressAlerts] = useState([]);
  const [historyAlerts, setHistoryAlerts] = useState([]);
  const [sessionsMap, setSessionsMap] = useState({});

  // Helper: Effective Outreach Status with live session map fallback
  const getEffectiveOutreachStatus = useCallback(
    (a) => {
      if (a.chatSessionId && sessionsMap[a.chatSessionId]) {
        const s = sessionsMap[a.chatSessionId];
        if (s.status === 'ACTIVE') return 'ACTIVE';
        if (s.status === 'DECLINED') return 'DECLINED';
        if (s.status === 'CLOSED') return 'CONCLUDED';
      } else if (a.pseudonym && sessionsMap[a.pseudonym]) {
        const s = sessionsMap[a.pseudonym];
        if (s.status === 'ACTIVE') return 'ACTIVE';
        if (s.status === 'DECLINED') return 'DECLINED';
        if (s.status === 'CLOSED') return 'CONCLUDED';
      }

      if (a.outreachStatus && a.outreachStatus !== 'NONE') return a.outreachStatus;
      const notes = (a.resolutionNotes || '').toLowerCase();
      if (notes.includes('declined') || notes.includes('vent only')) return 'DECLINED';
      if (notes.includes('invite')) return 'INVITED';
      return 'NONE';
    },
    [sessionsMap]
  );

  // Staff directory for assigned names
  const [colleagueDirectory, setColleagueDirectory] = useState({
    psychologist: 'Dr. Clara Reyes, RPsy',
    psychometrician: 'Lead Psychometrician, RPM',
    maintenance: 'System Maintenance Engineer'
  });

  // Modal states
  const [pendingAction, setPendingAction] = useState(null); // { alertId, action: 'resolve' | 'escalate' }
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [conflictModal, setConflictModal] = useState({ open: false, title: '', message: '' });

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  const isMountedRef = useRef(true);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3000);
  };

  // Load colleague directory
  useEffect(() => {
    colleaguesApi
      .getColleagues()
      .then((list) => {
        if (Array.isArray(list)) {
          const map = {};
          list.forEach((c) => {
            if (c.username && c.fullName) {
              map[c.username] = c.fullName;
            }
          });
          setColleagueDirectory((prev) => ({ ...prev, ...map }));
        }
      })
      .catch(() => {});
  }, []);

  const formatStaffName = useCallback(
    (uName, fName) => {
      if (fName && fName.trim() && fName !== uName) return fName;
      if (colleagueDirectory[uName]) return colleagueDirectory[uName];
      return uName ? uName.charAt(0).toUpperCase() + uName.slice(1) : 'Assigned Clinician';
    },
    [colleagueDirectory]
  );

  // Load Stats
  const loadStats = useCallback(
    async (silent = false) => {
      try {
        const s = await alertsApi.getStats(silent);
        if (!isMountedRef.current) return;
        const needsActionNum = s.active || 0;
        const inProgressNum = s.inProgress !== undefined ? s.inProgress : s.acknowledged || 0;
        setStats({
          active: needsActionNum,
          inProgress: inProgressNum,
          todayCritical: s.todayCritical || 0
        });
        updateBadge('crisis-alerts', needsActionNum + inProgressNum);
      } catch (e) {
        console.warn('Stats error:', e);
      }
    },
    [updateBadge]
  );

  // Load Needs Action
  const loadNeedsAction = useCallback(async (silent = false) => {
    try {
      const data = await alertsApi.getNeedsAction(silent);
      if (!isMountedRef.current) return;
      if (Array.isArray(data)) {
        const sevWeight = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1, INFO: 0 };
        data.sort((a, b) => {
          const wA = sevWeight[a.severity?.toUpperCase()] || 0;
          const wB = sevWeight[b.severity?.toUpperCase()] || 0;
          if (wA !== wB) return wB - wA;
          const tA = parseDateString(a.createdAt)?.getTime() || 0;
          const tB = parseDateString(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setNeedsActionAlerts(data);
      } else {
        setNeedsActionAlerts([]);
      }
    } catch (e) {
      console.warn('Needs Action error:', e);
    }
  }, []);

  // Load In Progress & Live Sessions
  const loadInProgress = useCallback(async (silent = false) => {
    try {
      const [data, sessData] = await Promise.all([
        alertsApi.getInProgress(silent),
        username
          ? chatApi.getProfessionalSessions(username).catch(() => null)
          : Promise.resolve(null)
      ]);
      if (!isMountedRef.current) return;

      if (sessData) {
        const map = {};
        const all = [
          ...(sessData.active || []),
          ...(sessData.waiting || []),
          ...(sessData.invited || [])
        ];
        all.forEach((s) => {
          if (s.sessionId) map[s.sessionId] = s;
          if (s.studentPseudonym) map[s.studentPseudonym] = s;
        });
        setSessionsMap(map);
      }

      if (Array.isArray(data)) {
        data.sort((a, b) => {
          const tA = parseDateString(a.createdAt)?.getTime() || 0;
          const tB = parseDateString(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setInProgressAlerts(data);
      } else {
        setInProgressAlerts([]);
      }
    } catch (e) {
      console.warn('In Progress error:', e);
    }
  }, [username]);

  // Load History
  const loadHistory = useCallback(async () => {
    try {
      const data = await alertsApi.getHistory(currentHistoryFilter);
      if (!isMountedRef.current) return;
      if (Array.isArray(data)) {
        data.sort((a, b) => {
          const tA = parseDateString(a.createdAt)?.getTime() || 0;
          const tB = parseDateString(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setHistoryAlerts(data);
      } else {
        setHistoryAlerts([]);
      }
    } catch (e) {
      console.warn('History error:', e);
    }
  }, [currentHistoryFilter]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    loadStats();
    loadNeedsAction();

    // Auto-refresh every 15s
    const timer = setInterval(() => {
      loadStats(true);
      if (activeTab === 'needsAction') loadNeedsAction(true);
      if (activeTab === 'inProgress') loadInProgress(true);
    }, 15000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [loadStats, loadNeedsAction, loadInProgress, activeTab]);

  // Handle Tab Change
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'needsAction') loadNeedsAction();
    if (tab === 'inProgress') loadInProgress();
    if (tab === 'history') loadHistory();
  };

  // Actions
  const handleAcknowledge = async (alertId) => {
    try {
      await alertsApi.acknowledge(alertId);
      showToast('Alert acknowledged ✓');
      loadNeedsAction();
      loadInProgress();
      loadStats();
    } catch (e) {
      console.warn('Ack error:', e);
    }
  };

  const handleQuickResolveDeclined = async (alertId) => {
    try {
      await alertsApi.quickResolveDeclined(alertId);
      showToast('Marked as resolved (Monitored) ✓');
      loadNeedsAction();
      loadInProgress();
      loadStats();
    } catch (e) {
      console.warn('Quick resolve error:', e);
      showToast('Error resolving alert.');
    }
  };

  const openResolveModal = (alertId, action) => {
    setPendingAction({ alertId, action });
    setResolutionNotes('');
  };

  const closeResolveModal = () => {
    setPendingAction(null);
    setResolutionNotes('');
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    try {
      if (pendingAction.action === 'resolve') {
        await alertsApi.resolve(pendingAction.alertId, resolutionNotes);
        showToast('Alert resolved ✓');
      } else {
        await alertsApi.escalate(pendingAction.alertId, resolutionNotes);
        showToast('Alert escalated ⬆');
      }
      closeResolveModal();
      loadNeedsAction();
      loadInProgress();
      loadStats();
    } catch (e) {
      showToast('Action failed. Try again.');
    }
  };

  const handleInitiateChat = async (alertId) => {
    try {
      const proName = fullName || username || 'Counselor';
      const data = await alertsApi.initiateChat(alertId, proName);

      if (data.status === 'already_active_with_other') {
        setConflictModal({
          open: true,
          title: 'Active Counseling in Progress',
          message: `This student is currently in an active 1-on-1 counseling session with <strong>${data.professionalName}</strong>.<br><br>To protect student privacy and avoid conflicting guidance, only one professional can conduct a session at a time.`
        });
        return;
      }

      if (data.status === 'already_invited_by_other') {
        setConflictModal({
          open: true,
          title: 'Outreach Invitation Pending',
          message: `An outreach invitation has already been sent to this student by <strong>${data.professionalName}</strong>.<br><br>We are currently awaiting the student's response.`
        });
        return;
      }

      if (data.status === 'invite_sent') {
        showToast('Outreach invitation sent to student ✓ (Waiting for student to accept)');
        loadNeedsAction();
        loadInProgress();
        loadStats();
        return;
      }

      if (data.status === 'claimed_waiting') {
        showToast("Connected to student's waiting chat session ✓ Redirecting...");
        setTimeout(() => {
          navigate(`/anon-chat?session=${data.sessionId}`);
        }, 700);
        return;
      }

      if (data.status === 'resumed_active') {
        showToast('Resuming active counseling session ✓ Redirecting...');
        setTimeout(() => {
          navigate(`/anon-chat?session=${data.sessionId}`);
        }, 700);
        return;
      }

      // Fallback
      showToast('Connecting to chat session...');
      setTimeout(() => {
        navigate(`/anon-chat?session=${data.sessionId}`);
      }, 700);
    } catch (e) {
      console.warn('Chat initiation error:', e);
      showToast('Failed to reach out. Try again.');
    }
  };

  // Status tag rendering
  const renderOutreachStatusTag = (a) => {
    if (a.status === 'RESOLVED') {
      return (
        <span className="alert-tag status-resolved">
          <i className="fas fa-check"></i> RESOLVED
        </span>
      );
    }
    if (a.status === 'ESCALATED') {
      return (
        <span className="alert-tag status-escalated">
          <i className="fas fa-arrow-up"></i> ESCALATED
        </span>
      );
    }
    const outreachStatus = getEffectiveOutreachStatus(a);
    if (outreachStatus === 'DECLINED') {
      return (
        <span className="alert-tag status-declined">
          <i className="fas fa-hand-holding-heart"></i> ⚠️ Outreach Declined (Venting Only)
        </span>
      );
    }
    if (outreachStatus === 'INVITED') {
      return (
        <span className="alert-tag status-invited">
          <i className="fas fa-paper-plane"></i> ⏳ Outreach Sent (Awaiting Student)
        </span>
      );
    }
    if (outreachStatus === 'ACTIVE') {
      return (
        <span className="alert-tag status-chat-active">
          <i className="fas fa-comments"></i> 💬 In Active Counseling
        </span>
      );
    }
    if (outreachStatus === 'CONCLUDED') {
      return (
        <span className="alert-tag status-concluded">
          <i className="fas fa-check-circle"></i> ✓ Session Concluded
        </span>
      );
    }
    return (
      <span className={`alert-tag status-${a.status?.toLowerCase()}`}>{a.status}</span>
    );
  };

  // Render Alert Card
  const renderAlertCard = (a, showActions) => {
    const isCritical = a.severity === 'CRITICAL';
    const canAck = showActions && a.status === 'ACTIVE';
    const canResolve = showActions && (a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED');
    const outreachStatus = getEffectiveOutreachStatus(a);

    let bannerClass = 'unassigned';
    let assignmentText = (
      <span>
        <i className="fas fa-triangle-exclamation"></i> <strong>Unassigned</strong> — Awaiting clinician response
      </span>
    );
    let timestampText = '';

    if (a.resolvedBy) {
      bannerClass = 'resolved';
      const staffName = formatStaffName(a.resolvedBy, a.resolvedByName);
      assignmentText = (
        <span>
          <i className="fas fa-circle-check"></i> Resolved by: <strong>{staffName}</strong>
        </span>
      );
      if (a.resolvedAt) {
        timestampText = timeAgo(a.resolvedAt);
      }
    } else if (a.acknowledgedBy) {
      bannerClass = 'acknowledged';
      const staffName = formatStaffName(a.acknowledgedBy, a.acknowledgedByName);
      assignmentText = (
        <span>
          <i className="fas fa-user-check"></i> Assigned &amp; Monitored by: <strong>{staffName}</strong>
        </span>
      );
      if (a.acknowledgedAt) {
        timestampText = timeAgo(a.acknowledgedAt);
      }
    }

    return (
      <div key={a.alertId || a.id} className={`alert-card sev-${a.severity}`}>
        <div className={`alert-sev-icon ${a.severity}`}>
          <i className={`fas ${SEV_ICONS[a.severity] || 'fa-bell'}`}></i>
        </div>
        <div className="alert-body">
          <div className="alert-top">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                minWidth: 0,
                flexWrap: 'wrap'
              }}
            >
              <div className="alert-title">{a.title}</div>
              {isCritical && (
                <span className="alert-critical-badge">
                  <i className="fas fa-skull-crossbones"></i> CRITICAL — IMMEDIATE ACTION
                </span>
              )}
            </div>
            <div className="alert-time">{timeAgo(a.createdAt)}</div>
          </div>

          {/* Student Post / Message Excerpt */}
          {a.message && (
            <div className="alert-msg-box">
              <div className="alert-msg">"{a.message}"</div>
            </div>
          )}

          {/* Clinical Signals & Status Tags */}
          <div className="alert-meta">
            <span className="alert-tag type">{TYPE_LABELS[a.alertType] || a.alertType}</span>
            <span className={`alert-tag sev-${a.severity?.toLowerCase()}`}>{a.severity}</span>
            {a.emotionTag && (
              <span className="alert-tag emotion">
                {getEmoji(a.emotionTag)} {a.emotionTag}
              </span>
            )}
            {a.energyScore && (
              <span className="alert-tag type">⚡ {a.energyScore}/10 Energy</span>
            )}
            {renderOutreachStatusTag(a)}
          </div>

          {/* Dedicated Outreach Declined Callout */}
          {outreachStatus === 'DECLINED' && (
            <div className="alert-declined-callout">
              <div className="declined-callout-icon">
                <i className="fas fa-hand-holding-heart"></i>
              </div>
              <div className="declined-callout-text">
                <strong>Student declined counseling reach-out (prefers to vent only).</strong>
                <span>
                  Clinical oversight: Student opted out of chat. Review this post to confirm it is safe to monitor, or escalate if acute danger is present.
                </span>
              </div>
            </div>
          )}

          {/* Dedicated Active Counseling Callout */}
          {outreachStatus === 'ACTIVE' && (
            <div className="alert-active-chat-callout">
              <div className="active-callout-icon">
                <i className="fas fa-comments"></i>
              </div>
              <div className="active-callout-text">
                <strong>Student accepted outreach — Active counseling session in progress.</strong>
                <span>A clinician is currently connected in anonymous chat with this student.</span>
              </div>
            </div>
          )}

          {/* Dedicated Outreach Pending Callout */}
          {outreachStatus === 'INVITED' && (
            <div className="alert-invited-callout">
              <div className="invited-callout-icon">
                <i className="fas fa-paper-plane"></i>
              </div>
              <div className="invited-callout-text">
                <strong>Outreach invitation sent — Awaiting student response.</strong>
                <span>An invitation check-in has been sent to the student. Waiting for student to accept or decline.</span>
              </div>
            </div>
          )}

          {/* Dedicated Bottom Report Details: Student + Assigned Clinician */}
          <div className={`alert-assigned-banner ${bannerClass}`}>
            <div className="assigned-lead">
              <span className="alert-tag student-tag">
                <i className="fas fa-user-shield"></i> Student: <strong>{a.pseudonym || 'Anonymous'}</strong>
              </span>
              {assignmentText}
            </div>
            {timestampText && (
              <div className="assigned-time">
                <i className="far fa-clock"></i>{' '}
                {a.resolvedBy ? `Resolved ${timestampText}` : `Claimed ${timestampText}`}
              </div>
            )}
          </div>

          {/* Resolution Notes (if any) */}
          {a.resolutionNotes && (
            <div className="alert-notes-box">
              <i className="fas fa-clipboard-check"></i>
              <div className="notes-content">
                <span className="notes-label">Resolution Notes:</span>
                {a.resolutionNotes}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {showActions && (
          <div className="alert-actions">
            {canAck && (
              <button className="btn-alert ack" onClick={() => handleAcknowledge(a.alertId)}>
                <i className="fas fa-eye"></i> Ack
              </button>
            )}
            {outreachStatus === 'DECLINED' ? (
              <>
                <button
                  className="btn-alert resolve"
                  onClick={() => handleQuickResolveDeclined(a.alertId)}
                  title="Student chose to vent only. Close case safely as monitored."
                >
                  <i className="fas fa-check-double"></i> Mark Resolved (Monitored)
                </button>
                <button
                  className="btn-alert resolve"
                  onClick={() => openResolveModal(a.alertId, 'resolve')}
                  title="Add custom notes"
                >
                  <i className="fas fa-clipboard"></i> Notes
                </button>
              </>
            ) : outreachStatus === 'ACTIVE' || outreachStatus === 'INVITED' ? (
              <>
                <button
                  className="btn-alert chat"
                  onClick={() =>
                    navigate(a.chatSessionId ? `/anon-chat?session=${a.chatSessionId}` : '/anon-chat')
                  }
                >
                  <i className="fas fa-comments"></i>{' '}
                  {outreachStatus === 'ACTIVE' ? 'Open Chat' : 'Monitor Session'}
                </button>
                {canResolve && (
                  <button
                    className="btn-alert resolve"
                    onClick={() => openResolveModal(a.alertId, 'resolve')}
                  >
                    <i className="fas fa-check"></i> Resolve
                  </button>
                )}
              </>
            ) : (
              canResolve && (
                <button
                  className="btn-alert resolve"
                  onClick={() => openResolveModal(a.alertId, 'resolve')}
                >
                  <i className="fas fa-check"></i> Resolve
                </button>
              )
            )}

            {canResolve && (
              <button
                className="btn-alert escalate"
                onClick={() => openResolveModal(a.alertId, 'escalate')}
              >
                <i className="fas fa-arrow-up"></i> Escalate
              </button>
            )}

            {canResolve &&
              a.pseudonym &&
              outreachStatus !== 'DECLINED' &&
              outreachStatus !== 'INVITED' &&
              outreachStatus !== 'ACTIVE' && (
                <button
                  className="btn-alert chat"
                  onClick={() => handleInitiateChat(a.alertId)}
                >
                  <i className="fas fa-hand-holding-heart"></i> Reach Out
                </button>
              )}
          </div>
        )}
      </div>
    );
  };

  // Filtered lists with strict status separation
  const activeNeedsActionAlerts = needsActionAlerts.filter((a) => a.status === 'ACTIVE');
  const filteredNeedsAction =
    currentSevFilter === 'ALL'
      ? activeNeedsActionAlerts
      : activeNeedsActionAlerts.filter((a) => a.severity === currentSevFilter);

  const acknowledgedAlerts = inProgressAlerts.filter((a) => a.status === 'ACKNOWLEDGED');
  const filteredInProgress =
    currentProgressFilter === 'ALL'
      ? acknowledgedAlerts
      : acknowledgedAlerts.filter((a) => getEffectiveOutreachStatus(a) === currentProgressFilter);

  // In-progress counters
  const countAll = acknowledgedAlerts.length;
  const countDeclined = acknowledgedAlerts.filter((a) => getEffectiveOutreachStatus(a) === 'DECLINED').length;
  const countActive = acknowledgedAlerts.filter((a) => getEffectiveOutreachStatus(a) === 'ACTIVE').length;
  const countInvited = acknowledgedAlerts.filter((a) => getEffectiveOutreachStatus(a) === 'INVITED').length;

  const resolvedHistoryAlerts = historyAlerts.filter(
    (a) => a.status === 'RESOLVED' || a.status === 'ESCALATED'
  );
  const filteredHistory =
    currentHistoryFilter === 'ALL'
      ? resolvedHistoryAlerts
      : resolvedHistoryAlerts.filter((a) => a.status === currentHistoryFilter);

  return (
    <div className="alerts-layout">
      {/* Header */}
      <header className="alerts-header" id="alertsHeader">
        <div className="alerts-header-inner">
          <div className="alerts-header-left">
            <div className="alerts-header-icon">
              <i className="fas fa-bell"></i>
            </div>
            <div>
              <h1>Crisis Alerts</h1>
              <p>Real-time crisis monitoring &amp; response management</p>
            </div>
          </div>
          <div className="stats-chips" id="statsChips">
            <div className="stat-chip">
              <span className="stat-num" id="statNeedsAction">
                {stats.active}
              </span>
              Needs Action
            </div>
            <div className="stat-chip">
              <span className="stat-num" id="statInProgress">
                {stats.inProgress}
              </span>
              In Progress
            </div>
            <div className="stat-chip">
              <span className="stat-num" id="statCritical">
                {stats.todayCritical}
              </span>
              Critical Today
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="alerts-tabs" id="alertTabs">
        <button
          className={`alert-tab ${activeTab === 'needsAction' ? 'active' : ''}`}
          id="tabNeedsAction"
          onClick={() => handleTabSwitch('needsAction')}
        >
          <i className="fas fa-bell"></i> Needs Action
          {activeNeedsActionAlerts.length > 0 && (
            <span className="tab-count" id="needsActionCount">
              {activeNeedsActionAlerts.length}
            </span>
          )}
        </button>
        <button
          className={`alert-tab ${activeTab === 'inProgress' ? 'active' : ''}`}
          id="tabInProgress"
          onClick={() => handleTabSwitch('inProgress')}
        >
          <i className="fas fa-spinner"></i> In Progress
          {acknowledgedAlerts.length > 0 && (
            <span className="tab-count" id="inProgressCount">
              {acknowledgedAlerts.length}
            </span>
          )}
        </button>
        <button
          className={`alert-tab ${activeTab === 'history' ? 'active' : ''}`}
          id="tabHistory"
          onClick={() => handleTabSwitch('history')}
        >
          <i className="fas fa-archive"></i> Resolved History
        </button>
      </div>

      {/* Content */}
      <div className="alerts-content">
        {/* Needs Action Panel */}
        <div
          className={`alert-panel ${activeTab === 'needsAction' ? 'active' : ''}`}
          id="panelNeedsAction"
        >
          <div className="severity-filters" id="sevFilters">
            {['ALL', 'CRITICAL', 'HIGH', 'MODERATE', 'LOW'].map((sev) => {
              const label =
                sev === 'ALL'
                  ? 'All'
                  : sev === 'CRITICAL'
                  ? '🔴 Critical'
                  : sev === 'HIGH'
                  ? '🟠 High'
                  : sev === 'MODERATE'
                  ? '🟡 Moderate'
                  : '🟢 Low';
              return (
                <button
                  key={sev}
                  className={`sev-pill ${currentSevFilter === sev ? 'active' : ''}`}
                  onClick={() => setCurrentSevFilter(sev)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div id="needsActionContainer">
            {filteredNeedsAction.length === 0 ? (
              <div className="alerts-empty">
                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                <p>
                  {currentSevFilter !== 'ALL'
                    ? `No ${currentSevFilter.toLowerCase()} alerts`
                    : 'All clear — no incoming alerts needing action'}
                </p>
              </div>
            ) : (
              filteredNeedsAction.map((a) => renderAlertCard(a, true))
            )}
          </div>
        </div>

        {/* In Progress Panel */}
        <div
          className={`alert-panel ${activeTab === 'inProgress' ? 'active' : ''}`}
          id="panelInProgress"
        >
          <div className="severity-filters" id="inProgressFilters">
            <button
              className={`sev-pill ${currentProgressFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('ALL')}
            >
              All In Progress <span className="pill-count" id="countProgAll">{countAll}</span>
            </button>
            <button
              className={`sev-pill pill-declined ${currentProgressFilter === 'DECLINED' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('DECLINED')}
            >
              ⚠️ Outreach Declined <span className="pill-count" id="countProgDeclined">{countDeclined}</span>
            </button>
            <button
              className={`sev-pill pill-active-chat ${currentProgressFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('ACTIVE')}
            >
              💬 Active In-Session <span className="pill-count" id="countProgActive">{countActive}</span>
            </button>
            <button
              className={`sev-pill pill-invited ${currentProgressFilter === 'INVITED' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('INVITED')}
            >
              ⏳ Invite Pending <span className="pill-count" id="countProgInvited">{countInvited}</span>
            </button>
          </div>
          <div id="inProgressContainer">
            {filteredInProgress.length === 0 ? (
              <div className="alerts-empty">
                <i className="fas fa-check-double" style={{ color: '#10b981' }}></i>
                <p>
                  {currentProgressFilter === 'DECLINED'
                    ? 'No outreach declined alerts'
                    : currentProgressFilter === 'ACTIVE'
                    ? 'No active counseling sessions in progress'
                    : currentProgressFilter === 'INVITED'
                    ? 'No pending outreach invitations'
                    : 'No alerts currently in progress'}
                </p>
              </div>
            ) : (
              filteredInProgress.map((a) => renderAlertCard(a, true))
            )}
          </div>
        </div>

        {/* Resolved History Panel */}
        <div
          className={`alert-panel ${activeTab === 'history' ? 'active' : ''}`}
          id="panelHistory"
        >
          <div className="severity-filters" id="historyFilters">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'RESOLVED', label: '✅ Resolved' },
              { id: 'ESCALATED', label: '⬆ Escalated' }
            ].map((f) => (
              <button
                key={f.id}
                className={`sev-pill ${currentHistoryFilter === f.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentHistoryFilter(f.id);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div id="historyContainer">
            {filteredHistory.length === 0 ? (
              <div className="alerts-empty">
                <i className="fas fa-archive" style={{ color: '#6366f1' }}></i>
                <p>No alert history found</p>
              </div>
            ) : (
              filteredHistory.map((a) => renderAlertCard(a, false))
            )}
          </div>
        </div>
      </div>

      {/* Resolution Modal */}
      {pendingAction && (
        <div className="modal-backdrop active" id="resolveModal">
          <div className="modal-box">
            <h3 id="modalTitle">
              {pendingAction.action === 'resolve' ? 'Resolve Alert' : 'Escalate Alert'}
            </h3>
            <p
              style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.75rem' }}
              id="modalDesc"
            >
              {pendingAction.action === 'resolve'
                ? 'Add notes about how this alert was handled.'
                : 'Provide reason for escalation to higher authority.'}
            </p>
            <textarea
              id="modalNotes"
              placeholder="Resolution notes (optional)..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            ></textarea>
            <div className="modal-btns">
              <button className="cancel" onClick={closeResolveModal}>
                Cancel
              </button>
              <button className="confirm" id="modalConfirm" onClick={handleConfirmAction}>
                {pendingAction.action === 'resolve' ? 'Resolve' : 'Escalate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict / In-Progress Notice Modal */}
      {conflictModal.open && (
        <div className="modal-backdrop active" id="conflictModal">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                margin: '0 auto 0.75rem'
              }}
            >
              <i className="fas fa-user-lock"></i>
            </div>
            <h3
              id="conflictModalTitle"
              style={{
                textAlign: 'center',
                fontSize: '1.1rem',
                color: '#1e293b',
                marginBottom: '0.5rem'
              }}
            >
              {conflictModal.title}
            </h3>
            <div
              style={{
                fontSize: '0.85rem',
                color: '#475569',
                lineHeight: 1.5,
                textAlign: 'center',
                marginBottom: '1.25rem'
              }}
              id="conflictModalMessage"
              dangerouslySetInnerHTML={{ __html: conflictModal.message }}
            />
            <div className="modal-btns" style={{ justifyContent: 'center' }}>
              <button
                className="confirm"
                style={{ background: '#4f46e5', width: '100%' }}
                onClick={() => setConflictModal({ open: false, title: '', message: '' })}
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="alert-toast">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
