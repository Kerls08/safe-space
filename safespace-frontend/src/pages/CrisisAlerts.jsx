import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  if (Array.isArray(ds)) {
    return new Date(ds[0], (ds[1] || 1) - 1, ds[2] || 1, ds[3] || 0, ds[4] || 0, ds[5] || 0);
  }
  const str = String(ds).trim();
  // If it already has explicit timezone indicators (Z, +08:00, -05:00), let Date parse it
  if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  // Parse local date-time strings without treating as UTC (eliminating 8h/13h timezone distortion)
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const min = parseInt(match[5], 10);
    const sec = parseInt(match[6] || '0', 10);
    const ms = parseInt((match[7] || '0').substring(0, 3).padEnd(3, '0'), 10);
    return new Date(year, month, day, hour, min, sec, ms);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function timeAgo(ds) {
  if (!ds) return '';
  const d = parseDateString(ds);
  if (!d || isNaN(d.getTime())) return '';
  const n = new Date();
  const s = Math.floor((n - d) / 1000);
  if (s < 0) return 'just now';
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

  // Unread tracker for Resolved History (Option A)
  const [lastSeenHistoryAt, setLastSeenHistoryAt] = useState(() => {
    try {
      const saved = localStorage.getItem('safespace_last_seen_resolved_history');
      if (saved) return parseInt(saved, 10);
      const now = Date.now();
      localStorage.setItem('safespace_last_seen_resolved_history', String(now));
      return now;
    } catch {
      return Date.now();
    }
  });

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

  // Student Context Map across all alerts: detects if a student already has an active session,
  // pending invite, or recently declined outreach anywhere in the system
  const studentStateMap = useMemo(() => {
    const map = {};
    const allKnown = [...inProgressAlerts, ...needsActionAlerts];
    for (const a of allKnown) {
      if (!a.pseudonym) continue;
      if (!map[a.pseudonym]) {
        map[a.pseudonym] = {
          outreachStatus: 'NONE',
          assignedBy: null,
          assignedByName: null,
          chatSessionId: null,
          count: 0
        };
      }
      const entry = map[a.pseudonym];
      entry.count += 1;
      const eff = getEffectiveOutreachStatus(a);
      if (eff === 'ACTIVE') {
        entry.outreachStatus = 'ACTIVE';
        entry.chatSessionId = a.chatSessionId || entry.chatSessionId;
      } else if (eff === 'DECLINED' && entry.outreachStatus !== 'ACTIVE') {
        // DECLINED overrides INVITED to accurately reflect student's decision
        entry.outreachStatus = 'DECLINED';
        entry.chatSessionId = a.chatSessionId || entry.chatSessionId;
      } else if (eff === 'INVITED' && entry.outreachStatus !== 'ACTIVE' && entry.outreachStatus !== 'DECLINED') {
        entry.outreachStatus = 'INVITED';
        entry.chatSessionId = a.chatSessionId || entry.chatSessionId;
      }
      if (a.acknowledgedBy && !entry.assignedBy) {
        entry.assignedBy = a.acknowledgedBy;
        entry.assignedByName = a.acknowledgedByName;
      }
    }
    return map;
  }, [needsActionAlerts, inProgressAlerts, getEffectiveOutreachStatus]);

  // Unified case-level outreach status helper (ensures cross-alert consistency)
  const getCaseOutreachStatus = useCallback(
    (a) => {
      let st = getEffectiveOutreachStatus(a);
      if ((st === 'NONE' || st === 'INVITED') && a.pseudonym && studentStateMap[a.pseudonym]) {
        const sState = studentStateMap[a.pseudonym];
        if (sState.outreachStatus === 'DECLINED' || sState.outreachStatus === 'ACTIVE') {
          return sState.outreachStatus;
        }
      }
      return st;
    },
    [getEffectiveOutreachStatus, studentStateMap]
  );

  // Group alerts by student pseudonym into single consolidated case cards
  const groupAlertsByStudent = useCallback((alertsList) => {
    if (!Array.isArray(alertsList)) return [];
    const groups = [];
    const map = new Map();

    for (const a of alertsList) {
      const key = a.pseudonym || `anon-${a.alertId}`;
      if (!map.has(key)) {
        const groupObj = {
          key,
          pseudonym: a.pseudonym,
          primaryAlert: a,
          childAlerts: [],
          allAlerts: [a]
        };
        map.set(key, groupObj);
        groups.push(groupObj);
      } else {
        const groupObj = map.get(key);
        const aId = a.alertId || a.id;
        if (!groupObj.allAlerts.some((existing) => (existing.alertId || existing.id) === aId)) {
          groupObj.childAlerts.push(a);
          groupObj.allAlerts.push(a);
        }
      }
    }
    return groups;
  }, []);

  // Staff directory for assigned names
  const [colleagueDirectory, setColleagueDirectory] = useState({
    psychologist: 'Dr. Clara Reyes, RPsy',
    psychometrician: 'Lead Psychometrician, RPM',
    maintenance: 'System Maintenance Engineer'
  });

  // Modal states
  const [pendingAction, setPendingAction] = useState(null); // { alertId, pseudonym, action: 'resolve' | 'escalate' }
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [conflictModal, setConflictModal] = useState({ open: false, title: '', message: '' });
  const [reOutreachModal, setReOutreachModal] = useState({ open: false, alertId: null, pseudonym: '', message: '' });
  const [initiatingAlertId, setInitiatingAlertId] = useState(null);
  const [deleteModal, setDeleteModal] = useState({ open: false, alertId: null, pseudonym: '', count: 1 });
  const [historyActionLoadingId, setHistoryActionLoadingId] = useState(null);

  // Incident Case Threading: track expanded child posts accordion
  const [expandedThreads, setExpandedThreads] = useState({});
  const toggleExpandThread = (key) => {
    setExpandedThreads((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
        const needsActionNum = s.activeCases !== undefined ? s.activeCases : (s.active || 0);
        const inProgressNum = s.inProgressCases !== undefined ? s.inProgressCases : (s.inProgress !== undefined ? s.inProgress : s.acknowledged || 0);
        const resolvedNum = s.resolvedCases !== undefined ? s.resolvedCases : (s.resolved || 0);
        setStats({
          active: needsActionNum,
          inProgress: inProgressNum,
          resolved: resolvedNum,
          todayCritical: s.todayCritical || 0
        });
      } catch (e) {
        console.warn('Stats error:', e);
      }
    },
    []
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
          ...(sessData.invited || []),
          ...(sessData.declined || [])
        ];
        all.forEach((s) => {
          if (s.sessionId) map[s.sessionId] = s;
          if (s.studentPseudonym) {
            const existing = map[s.studentPseudonym];
            if (!existing || existing.status === 'INVITED' || s.status === 'ACTIVE') {
              map[s.studentPseudonym] = s;
            }
          }
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
  const loadHistory = useCallback(async (silent = false) => {
    try {
      const data = await alertsApi.getHistory('ALL', silent);
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
  }, []);

  // Unified data loader: atomically loads all queues, stats, and live chat states together
  const loadAllData = useCallback(
    async (silent = false) => {
      try {
        const [statsRes, needsActionRes, inProgressRes, sessRes, historyRes] = await Promise.all([
          alertsApi.getStats(silent).catch(() => null),
          alertsApi.getNeedsAction(silent).catch(() => []),
          alertsApi.getInProgress(silent).catch(() => []),
          username ? chatApi.getProfessionalSessions(username).catch(() => null) : Promise.resolve(null),
          alertsApi.getHistory('ALL', silent).catch(() => [])
        ]);

        if (!isMountedRef.current) return;

        // Process Stats
        if (statsRes) {
          const needsActionNum = statsRes.activeCases !== undefined ? statsRes.activeCases : (statsRes.active || 0);
          const inProgressNum = statsRes.inProgressCases !== undefined ? statsRes.inProgressCases : (statsRes.inProgress !== undefined ? statsRes.inProgress : statsRes.acknowledged || 0);
          const resolvedNum = statsRes.resolvedCases !== undefined ? statsRes.resolvedCases : (statsRes.resolved || 0);
          setStats({
            active: needsActionNum,
            inProgress: inProgressNum,
            resolved: resolvedNum,
            todayCritical: statsRes.todayCritical || 0
          });
        }

        // Process Sessions
        if (sessRes) {
          const map = {};
          const all = [
            ...(sessRes.active || []),
            ...(sessRes.waiting || []),
            ...(sessRes.invited || []),
            ...(sessRes.declined || [])
          ];
          all.forEach((s) => {
            if (s.sessionId) map[s.sessionId] = s;
            if (s.studentPseudonym) {
              const existing = map[s.studentPseudonym];
              if (!existing || existing.status === 'INVITED' || s.status === 'ACTIVE') {
                map[s.studentPseudonym] = s;
              }
            }
          });
          setSessionsMap(map);
        }

        // Process Needs Action
        if (Array.isArray(needsActionRes)) {
          const sevWeight = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1, INFO: 0 };
          const sorted = [...needsActionRes].sort((a, b) => {
            const wA = sevWeight[a.severity?.toUpperCase()] || 0;
            const wB = sevWeight[b.severity?.toUpperCase()] || 0;
            if (wA !== wB) return wB - wA;
            const tA = parseDateString(a.createdAt)?.getTime() || 0;
            const tB = parseDateString(b.createdAt)?.getTime() || 0;
            return tB - tA;
          });
          setNeedsActionAlerts(sorted);
        } else {
          setNeedsActionAlerts([]);
        }

        // Process In Progress
        if (Array.isArray(inProgressRes)) {
          const sorted = [...inProgressRes].sort((a, b) => {
            const tA = parseDateString(a.createdAt)?.getTime() || 0;
            const tB = parseDateString(b.createdAt)?.getTime() || 0;
            return tB - tA;
          });
          setInProgressAlerts(sorted);
        } else {
          setInProgressAlerts([]);
        }

        // Process History
        if (Array.isArray(historyRes)) {
          const sorted = [...historyRes].sort((a, b) => {
            const tA = parseDateString(a.createdAt)?.getTime() || 0;
            const tB = parseDateString(b.createdAt)?.getTime() || 0;
            return tB - tA;
          });
          setHistoryAlerts(sorted);
        } else {
          setHistoryAlerts([]);
        }

        // Clinician is viewing Crisis Alerts: keep nav badge at 0 and update seen timestamp
        updateBadge('crisis-alerts', 0);
        try {
          localStorage.setItem('safespace_last_seen_alerts', new Date().toISOString());
        } catch {}
      } catch (e) {
        console.warn('loadAllData error:', e);
      }
    },
    [username, currentHistoryFilter, updateBadge]
  );

  // Initial load and periodic 15s refresh for ALL data queues together
  useEffect(() => {
    isMountedRef.current = true;
    updateBadge('crisis-alerts', 0);
    try {
      localStorage.setItem('safespace_last_seen_alerts', new Date().toISOString());
    } catch {}
    loadAllData(false);

    // Auto-refresh every 8s for all queues
    const timer = setInterval(() => {
      loadAllData(true);
    }, 8000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [loadAllData]);

  // Handle Tab Change
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'history') {
      const now = Date.now();
      setLastSeenHistoryAt(now);
      try {
        localStorage.setItem('safespace_last_seen_resolved_history', String(now));
      } catch {}
      loadHistory(true);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      const now = Date.now();
      setLastSeenHistoryAt(now);
      try {
        localStorage.setItem('safespace_last_seen_resolved_history', String(now));
      } catch {}
    }
  }, [activeTab]);

  // Actions
  const handleAcknowledge = async (alertId) => {
    try {
      await alertsApi.acknowledge(alertId);
      showToast('Alert acknowledged ✓');
      loadAllData(true);
    } catch (e) {
      console.warn('Ack error:', e);
    }
  };

  const handleAcknowledgeCase = async (group) => {
    try {
      if (group.pseudonym) {
        await alertsApi.acknowledgeCase(group.pseudonym);
        showToast(`Case acknowledged for ${group.pseudonym} ✓`);
      } else if (group.primaryAlert?.alertId) {
        await alertsApi.acknowledge(group.primaryAlert.alertId);
        showToast('Alert acknowledged ✓');
      }
      loadAllData(true);
    } catch (e) {
      console.warn('Ack case error:', e);
    }
  };

  const handleQuickResolveDeclined = async (alertId, pseudonym = null) => {
    try {
      if (pseudonym) {
        const notes = 'Student exercised autonomy to vent only (outreach declined). Verified safe to monitor, no acute escalation required.';
        await alertsApi.resolveCase(pseudonym, notes);
        showToast(`Case for ${pseudonym} marked as resolved (Monitored) ✓`);
      } else {
        await alertsApi.quickResolveDeclined(alertId);
        showToast('Marked as resolved (Monitored) ✓');
      }
      loadAllData(true);
    } catch (e) {
      console.warn('Quick resolve error:', e);
      showToast('Error resolving alert.');
    }
  };

  const openResolveModal = (alertId, action, pseudonym = null) => {
    setPendingAction({ alertId, action, pseudonym });
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
        if (pendingAction.pseudonym) {
          await alertsApi.resolveCase(pendingAction.pseudonym, resolutionNotes);
          showToast(`Case resolved for ${pendingAction.pseudonym} ✓`);
        } else {
          await alertsApi.resolve(pendingAction.alertId, resolutionNotes);
          showToast('Alert resolved ✓');
        }
      } else {
        await alertsApi.escalate(pendingAction.alertId, resolutionNotes);
        showToast('Alert escalated ⬆');
      }
      closeResolveModal();
      loadAllData(true);
    } catch (e) {
      showToast('Action failed. Try again.');
    }
  };

  const handleArchiveCase = async (alertId, pseudonym) => {
    if (!alertId) return;
    try {
      setHistoryActionLoadingId(`archive-${alertId}`);
      await alertsApi.archiveAlert(alertId);
      showToast(pseudonym ? `Archived case for ${pseudonym} 📦` : 'Case archived 📦');
      await Promise.all([loadHistory(true), loadStats(true)]);
    } catch (err) {
      console.error('Failed to archive case:', err);
      showToast(err.message || 'Failed to archive case');
    } finally {
      setHistoryActionLoadingId(null);
    }
  };

  const handleRestoreCase = async (alertId, pseudonym) => {
    if (!alertId) return;
    try {
      setHistoryActionLoadingId(`restore-${alertId}`);
      await alertsApi.unarchiveAlert(alertId);
      showToast(pseudonym ? `Restored case for ${pseudonym} to active history ↺` : 'Case restored to active history ↺');
      await Promise.all([loadHistory(true), loadStats(true)]);
    } catch (err) {
      console.error('Failed to restore case:', err);
      showToast(err.message || 'Failed to restore case');
    } finally {
      setHistoryActionLoadingId(null);
    }
  };

  const openDeleteModal = (alertId, pseudonym, count = 1) => {
    setDeleteModal({
      open: true,
      alertId,
      pseudonym: pseudonym || 'Anonymous Student',
      count: count || 1
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, alertId: null, pseudonym: '', count: 1 });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.alertId) return;
    try {
      setHistoryActionLoadingId(`delete-${deleteModal.alertId}`);
      await alertsApi.deleteAlert(deleteModal.alertId);
      const studentName = deleteModal.pseudonym;
      closeDeleteModal();
      showToast(`Permanently deleted case for ${studentName} 🗑`);
      await Promise.all([loadHistory(true), loadStats(true)]);
    } catch (err) {
      console.error('Failed to delete case:', err);
      showToast(err.message || 'Failed to delete case');
    } finally {
      setHistoryActionLoadingId(null);
    }
  };

  const handleInitiateChat = async (alertId, force = false) => {
    if (!alertId) {
      showToast('Cannot reach out: alert identifier missing.');
      return;
    }
    if (initiatingAlertId) return;
    setInitiatingAlertId(alertId);
    try {
      const proName = fullName || username || 'Counselor';
      const data = await alertsApi.initiateChat(alertId, proName, force);

      if (data.status === 'recently_declined') {
        setReOutreachModal({
          open: true,
          alertId: alertId,
          pseudonym: data.pseudonym,
          message: data.message
        });
        return;
      }

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

      if (data.status === 'invite_already_pending') {
        showToast('Outreach invitation is already pending with this student ✓');
        setActiveTab('inProgress');
        loadAllData(true);
        return;
      }

      if (data.status === 'invite_sent') {
        showToast('Outreach invitation sent to student ✓ (Waiting for student to accept)');
        setActiveTab('inProgress');
        loadAllData(true);
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
      showToast(e.message || 'Failed to reach out. Try again.');
    } finally {
      setInitiatingAlertId(null);
    }
  };

  const handleConfirmReOutreach = async () => {
    if (!reOutreachModal.alertId) return;
    const targetAlertId = reOutreachModal.alertId;
    setReOutreachModal({ open: false, alertId: null, pseudonym: '', message: '' });
    await handleInitiateChat(targetAlertId, true);
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
    const outreachStatus = getCaseOutreachStatus(a);
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

  // Render Alert Card (supports either a group of alerts for a student, or a single alert)
  const renderAlertCard = (item, showActions, isHistory = false) => {
    const isGroup = !!item.primaryAlert;
    const a = isGroup ? item.primaryAlert : item;
    const childAlerts = isGroup ? item.childAlerts : [];
    const allAlerts = isGroup ? item.allAlerts : [a];
    const groupKey = isGroup ? item.key : (a.alertId || a.id);
    const targetAlertId = a.alertId || (allAlerts[0] && allAlerts[0].alertId);
    const isExpanded = !!expandedThreads[groupKey];
    const totalCount = allAlerts.length;

    const isCritical = allAlerts.some((al) => al.severity === 'CRITICAL');

    // Cross-tab student state lookup
    const studentState = a.pseudonym ? studentStateMap[a.pseudonym] : null;
    const outreachStatus = getCaseOutreachStatus(a);
    const targetChatSessionId = a.chatSessionId || (studentState ? studentState.chatSessionId : null);

    // Latest alert in the thread/group (for accurate recent activity timestamp)
    const latestAlert = allAlerts.reduce((latest, curr) => {
      const tCurr = parseDateString(curr.createdAt)?.getTime() || 0;
      const tLatest = parseDateString(latest?.createdAt)?.getTime() || 0;
      return tCurr > tLatest ? curr : latest;
    }, allAlerts[0] || a);

    // Robust banner assignment detection across all alerts in case
    const ackAlert = allAlerts.find((al) => al.acknowledgedBy);
    const resolvedAlert = allAlerts.find((al) => al.resolvedBy);

    const resolvedUser = a.resolvedBy || (resolvedAlert ? resolvedAlert.resolvedBy : null);
    const resolvedName = a.resolvedByName || (resolvedAlert ? resolvedAlert.resolvedByName : null);
    const resolvedAt = a.resolvedAt || (resolvedAlert ? resolvedAlert.resolvedAt : null);

    const ackUser = a.acknowledgedBy || (ackAlert ? ackAlert.acknowledgedBy : null) || (studentState ? studentState.assignedBy : null);
    const ackName = a.acknowledgedByName || (ackAlert ? ackAlert.acknowledgedByName : null) || (studentState ? studentState.assignedByName : null);
    const ackAt = a.acknowledgedAt || (ackAlert ? ackAlert.acknowledgedAt : null);

    // Dynamic freshness for unacknowledged rants
    const activeAlerts = allAlerts.filter((al) => al.status === 'ACTIVE');
    const newestActiveAlert = activeAlerts.reduce((latest, curr) => {
      const tCurr = parseDateString(curr.createdAt)?.getTime() || 0;
      const tLatest = parseDateString(latest?.createdAt)?.getTime() || 0;
      return tCurr > tLatest ? curr : latest;
    }, null);

    const isNewerThanAck = !!(
      ackAt &&
      latestAlert &&
      parseDateString(latestAlert.createdAt)?.getTime() > parseDateString(ackAt)?.getTime() + 5000
    );

    const hasNewActivity = activeAlerts.length > 0 || isNewerThanAck;
    const canAck = showActions && (activeAlerts.length > 0 || isNewerThanAck);
    const canResolve = showActions && allAlerts.some((al) => al.status === 'ACTIVE' || al.status === 'ACKNOWLEDGED');

    const newestUnreviewedAlert = newestActiveAlert || (isNewerThanAck ? latestAlert : null);
    const unreviewedAgeMs = newestUnreviewedAlert
      ? Date.now() - (parseDateString(newestUnreviewedAlert.createdAt)?.getTime() || 0)
      : Infinity;
    const isFreshActive = unreviewedAgeMs >= 0 && unreviewedAgeMs < 20 * 60 * 1000; // 20 min freshness threshold

    let bannerClass = 'unassigned';
    let assignmentText = (
      <span>
        <i className="fas fa-triangle-exclamation"></i> <strong>Unassigned</strong> — Awaiting clinician response
      </span>
    );
    let timestampText = '';

    if (resolvedUser) {
      bannerClass = 'resolved';
      const staffName = formatStaffName(resolvedUser, resolvedName);
      assignmentText = (
        <span>
          <i className="fas fa-circle-check"></i> Resolved by: <strong>{staffName}</strong>
        </span>
      );
      if (resolvedAt) {
        timestampText = timeAgo(resolvedAt);
      }
    } else if (ackUser) {
      bannerClass = 'acknowledged';
      const staffName = formatStaffName(ackUser, ackName);
      assignmentText = (
        <span>
          <i className="fas fa-user-check"></i> Assigned &amp; Monitored by: <strong>{staffName}</strong>
        </span>
      );
      if (ackAt) {
        timestampText = timeAgo(ackAt);
      }
    }

    return (
      <div key={groupKey} className={`alert-card sev-${a.severity} ${a.archived ? 'is-archived' : ''}`}>
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
              {totalCount > 1 && (
                <span
                  className="alert-thread-badge"
                  title={`${totalCount} recent posts from this student grouped into one incident case`}
                >
                  <i className="fas fa-layer-group"></i> {totalCount} posts detected
                </span>
              )}
              {isCritical && (
                <span className="alert-critical-badge">
                  <i className="fas fa-skull-crossbones"></i> CRITICAL — IMMEDIATE ACTION
                </span>
              )}
              {canAck && !resolvedUser && ackUser && (
                isFreshActive ? (
                  <span
                    className="alert-tag alert-tag-new-activity"
                    title={`Student submitted additional rant (${timeAgo(newestUnreviewedAlert?.createdAt)}) while this case is in progress`}
                  >
                    <i className="fas fa-bell"></i> 🔴 New rant submitted ({timeAgo(newestUnreviewedAlert?.createdAt)})
                  </span>
                ) : (
                  <span
                    className="alert-tag alert-tag-unreviewed"
                    title={`Unreviewed rant submitted ${timeAgo(newestUnreviewedAlert?.createdAt)}`}
                  >
                    <i className="fas fa-clock"></i> ⚠️ Unreviewed rant ({timeAgo(newestUnreviewedAlert?.createdAt)})
                  </span>
                )
              )}
            </div>
            <div className="alert-time" title={latestAlert?.createdAt ? `Latest rant: ${latestAlert.createdAt}` : ''}>
              {timeAgo(latestAlert?.createdAt || a.createdAt)}
            </div>
          </div>

          {/* Student Post / Message Excerpt */}
          {a.message && (
            <div className="alert-msg-box">
              <div className="alert-msg">"{a.message}"</div>
            </div>
          )}

          {/* Incident Case Threading: Accordion for older rants */}
          {childAlerts && childAlerts.length > 0 && (
            <div className="alert-thread-box">
              <button
                type="button"
                className="alert-thread-toggle"
                onClick={() => toggleExpandThread(groupKey)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                  {isExpanded
                    ? 'Hide earlier rants from this student'
                    : `View ${childAlerts.length} earlier ${childAlerts.length === 1 ? 'rant' : 'rants'} in this window`}
                </span>
                <span className="thread-pill">{childAlerts.length} older</span>
              </button>
              {isExpanded && (
                <div className="alert-thread-history">
                  {childAlerts
                    .slice()
                    .sort((x, y) => {
                      const tX = parseDateString(x.createdAt)?.getTime() || 0;
                      const tY = parseDateString(y.createdAt)?.getTime() || 0;
                      return tY - tX;
                    })
                    .map((child) => (
                    <div key={child.alertId || child.id} className="thread-history-card">
                      <div className="thread-history-header">
                        <span className="thread-history-time">
                          <i className="far fa-clock"></i> {timeAgo(child.createdAt)}
                        </span>
                        <div className="thread-history-tags">
                          {(child.status === 'ACTIVE' || (ackAt && parseDateString(child.createdAt)?.getTime() > parseDateString(ackAt)?.getTime() + 5000)) && (
                            <span className="thread-tag new-activity">
                              <i className="fas fa-circle" style={{ fontSize: '0.4rem' }}></i> New
                            </span>
                          )}
                          {child.energyScore && (
                            <span className="thread-tag energy">⚡ {child.energyScore}/10</span>
                          )}
                          {child.emotionTag && (
                            <span className="thread-tag emotion">
                              {getEmoji(child.emotionTag)} {child.emotionTag}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="thread-history-text">"{child.message}"</div>
                    </div>
                  ))}
                </div>
              )}
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
            {a.archived && (
              <span className="alert-tag archived-tag">
                <i className="fas fa-box-archive"></i> Archived
              </span>
            )}
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
            {a.archived && a.archivedBy && (
              <div className="assigned-time" style={{ marginLeft: 'auto', color: '#64748b' }}>
                <i className="fas fa-box-archive"></i> Archived {a.archivedAt ? timeAgo(a.archivedAt) : ''} by {formatStaffName(a.archivedBy)}
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
              <button
                className="btn-alert ack"
                onClick={() => (isGroup ? handleAcknowledgeCase(item) : handleAcknowledge(a.alertId))}
                title="Acknowledge incoming alert case"
              >
                <i className="fas fa-eye"></i> Ack{totalCount > 1 ? ` All (${totalCount})` : ''}
              </button>
            )}

            {outreachStatus === 'DECLINED' ? (
              <>
                <button
                  type="button"
                  className="btn-alert resolve"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickResolveDeclined(targetAlertId, a.pseudonym);
                  }}
                  title="Student chose to vent only. Close case safely as monitored."
                >
                  <i className="fas fa-check-double"></i> Mark Resolved (Monitored)
                </button>
                <button
                  type="button"
                  className="btn-alert resolve"
                  onClick={(e) => {
                    e.stopPropagation();
                    openResolveModal(targetAlertId, 'resolve', a.pseudonym);
                  }}
                  title="Add custom notes"
                >
                  <i className="fas fa-clipboard"></i> Notes
                </button>
                <button
                  type="button"
                  className="btn-alert chat"
                  style={{ background: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}
                  disabled={initiatingAlertId === targetAlertId}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInitiateChat(targetAlertId);
                  }}
                  title="Review before sending re-invitation to a student who preferred to vent"
                >
                  {initiatingAlertId === targetAlertId ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Re-inviting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-envelope-open-text"></i> Re-invite...
                    </>
                  )}
                </button>
              </>
            ) : outreachStatus === 'ACTIVE' || outreachStatus === 'INVITED' ? (
              <>
                <button
                  type="button"
                  className="btn-alert chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(targetChatSessionId ? `/anon-chat?session=${targetChatSessionId}` : '/anon-chat');
                  }}
                >
                  <i className="fas fa-comments"></i>{' '}
                  {outreachStatus === 'ACTIVE' ? 'Open Chat' : 'Monitor Session'}
                </button>
                {outreachStatus === 'INVITED' && (
                  <button
                    type="button"
                    className="btn-alert"
                    style={{ background: '#f8fafc', color: '#64748b', borderColor: '#cbd5e1', cursor: 'not-allowed' }}
                    disabled
                    title="Outreach invitation is currently pending student response"
                  >
                    <i className="fas fa-hourglass-half"></i> Invite Pending
                  </button>
                )}
                {canResolve && (
                  <button
                    type="button"
                    className="btn-alert resolve"
                    onClick={(e) => {
                      e.stopPropagation();
                      openResolveModal(targetAlertId, 'resolve', a.pseudonym);
                    }}
                  >
                    <i className="fas fa-check"></i> Resolve{totalCount > 1 ? ` Case (${totalCount})` : ''}
                  </button>
                )}
              </>
            ) : (
              <>
                {canResolve && (
                  <button
                    type="button"
                    className="btn-alert resolve"
                    onClick={(e) => {
                      e.stopPropagation();
                      openResolveModal(targetAlertId, 'resolve', a.pseudonym);
                    }}
                  >
                    <i className="fas fa-check"></i> Resolve{totalCount > 1 ? ` Case (${totalCount})` : ''}
                  </button>
                )}
                {canResolve && a.pseudonym && (
                  <button
                    type="button"
                    className="btn-alert chat"
                    disabled={initiatingAlertId === targetAlertId}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInitiateChat(targetAlertId);
                    }}
                  >
                    {initiatingAlertId === targetAlertId ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Reaching Out...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-hand-holding-heart"></i> Reach Out
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {canResolve && (
              <button
                type="button"
                className="btn-alert escalate"
                onClick={(e) => {
                  e.stopPropagation();
                  openResolveModal(targetAlertId, 'escalate', a.pseudonym);
                }}
              >
                <i className="fas fa-arrow-up"></i> Escalate
              </button>
            )}
          </div>
        )}

        {/* History Actions: Archive, Restore, Delete */}
        {isHistory && (
          <div className="alert-actions history-actions">
            {a.archived ? (
              <>
                <button
                  type="button"
                  className="btn-alert restore"
                  disabled={historyActionLoadingId === `restore-${targetAlertId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestoreCase(targetAlertId, a.pseudonym);
                  }}
                  title="Restore case back to active history"
                >
                  {historyActionLoadingId === `restore-${targetAlertId}` ? (
                    <><i className="fas fa-spinner fa-spin"></i> Restoring...</>
                  ) : (
                    <><i className="fas fa-rotate-left"></i> Restore</>
                  )}
                </button>
                <button
                  type="button"
                  className="btn-alert delete"
                  disabled={historyActionLoadingId === `delete-${targetAlertId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(targetAlertId, a.pseudonym, totalCount);
                  }}
                  title="Permanently delete this archived case from database"
                >
                  <i className="fas fa-trash-alt"></i> Delete Permanently
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-alert archive"
                  disabled={historyActionLoadingId === `archive-${targetAlertId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchiveCase(targetAlertId, a.pseudonym);
                  }}
                  title="Archive this case to clean up history view"
                >
                  {historyActionLoadingId === `archive-${targetAlertId}` ? (
                    <><i className="fas fa-spinner fa-spin"></i> Archiving...</>
                  ) : (
                    <><i className="fas fa-box-archive"></i> Archive</>
                  )}
                </button>
                <button
                  type="button"
                  className="btn-alert delete"
                  disabled={historyActionLoadingId === `delete-${targetAlertId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(targetAlertId, a.pseudonym, totalCount);
                  }}
                  title="Permanently delete this case from database"
                >
                  <i className="fas fa-trash-alt"></i> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Unified Case Partitioning & Cross-Tab Deduplication ──
  // Track pseudonyms with active casework in inProgressAlerts
  const inProgressPseudonymSet = useMemo(() => {
    const set = new Set();
    for (const a of inProgressAlerts) {
      if (a.pseudonym) set.add(a.pseudonym);
    }
    return set;
  }, [inProgressAlerts]);

  // Needs Action only contains alerts for students who DO NOT currently have an open in-progress case
  const activeNeedsActionAlerts = useMemo(() => {
    return needsActionAlerts.filter(
      (a) => a.status === 'ACTIVE' && (!a.pseudonym || !inProgressPseudonymSet.has(a.pseudonym))
    );
  }, [needsActionAlerts, inProgressPseudonymSet]);

  const filteredNeedsAction = useMemo(() => {
    if (currentSevFilter === 'ALL') return activeNeedsActionAlerts;
    return activeNeedsActionAlerts.filter((a) => a.severity === currentSevFilter);
  }, [activeNeedsActionAlerts, currentSevFilter]);

  // Any incoming ACTIVE alerts for students who already have an in-progress case get routed to In-Progress
  const extraInProgressAlerts = useMemo(() => {
    return needsActionAlerts.filter(
      (a) => a.pseudonym && inProgressPseudonymSet.has(a.pseudonym)
    );
  }, [needsActionAlerts, inProgressPseudonymSet]);

  const combinedInProgressAlerts = useMemo(() => {
    const seen = new Set();
    const combined = [];
    for (const a of inProgressAlerts) {
      const id = a.alertId || a.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        combined.push(a);
      }
    }
    for (const a of extraInProgressAlerts) {
      const id = a.alertId || a.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        combined.push(a);
      }
    }
    const sevWeight = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1, INFO: 0 };
    combined.sort((a, b) => {
      const wA = sevWeight[a.severity?.toUpperCase()] || 0;
      const wB = sevWeight[b.severity?.toUpperCase()] || 0;
      if (wA !== wB) return wB - wA;
      const tA = parseDateString(a.createdAt)?.getTime() || 0;
      const tB = parseDateString(b.createdAt)?.getTime() || 0;
      return tB - tA;
    });
    return combined;
  }, [inProgressAlerts, extraInProgressAlerts]);

  const filteredInProgress = useMemo(() => {
    if (currentProgressFilter === 'ALL') return combinedInProgressAlerts;
    return combinedInProgressAlerts.filter(
      (a) => getCaseOutreachStatus(a) === currentProgressFilter
    );
  }, [combinedInProgressAlerts, currentProgressFilter, getCaseOutreachStatus]);

  // Resolved History alerts
  const resolvedHistoryAlerts = useMemo(() => {
    return historyAlerts.filter(
      (a) => a.status === 'RESOLVED' || a.status === 'ESCALATED'
    );
  }, [historyAlerts]);

  const activeHistoryAlerts = useMemo(() => {
    return resolvedHistoryAlerts.filter((a) => !a.archived);
  }, [resolvedHistoryAlerts]);

  const archivedHistoryAlerts = useMemo(() => {
    return resolvedHistoryAlerts.filter((a) => !!a.archived);
  }, [resolvedHistoryAlerts]);

  // Incident Case Threading: group alerts by student for triage panels
  const groupedNeedsAction = useMemo(
    () => groupAlertsByStudent(filteredNeedsAction),
    [groupAlertsByStudent, filteredNeedsAction]
  );

  const groupedInProgress = useMemo(
    () => groupAlertsByStudent(filteredInProgress),
    [groupAlertsByStudent, filteredInProgress]
  );

  // Group all active resolved alerts by student
  const allHistoryCases = useMemo(
    () => groupAlertsByStudent(activeHistoryAlerts),
    [groupAlertsByStudent, activeHistoryAlerts]
  );

  // Group all archived alerts by student
  const allArchivedCases = useMemo(
    () => groupAlertsByStudent(archivedHistoryAlerts),
    [groupAlertsByStudent, archivedHistoryAlerts]
  );

  const groupedHistory = useMemo(() => {
    if (currentHistoryFilter === 'ARCHIVED') {
      return allArchivedCases;
    }
    if (currentHistoryFilter === 'RESOLVED') {
      return allHistoryCases.filter((g) => g.allAlerts.some((al) => al.status === 'RESOLVED'));
    }
    if (currentHistoryFilter === 'ESCALATED') {
      return allHistoryCases.filter((g) => g.allAlerts.some((al) => al.status === 'ESCALATED'));
    }
    return allHistoryCases;
  }, [currentHistoryFilter, allHistoryCases, allArchivedCases]);

  // Unread notification tracker for resolved history (Option A)
  const unseenResolvedCount = useMemo(() => {
    if (activeTab === 'history') return 0;
    if (!lastSeenHistoryAt) return 0;
    return allHistoryCases.filter((c) => {
      const al = c.primaryAlert || {};
      const resTime = parseDateString(al.resolvedAt || al.createdAt)?.getTime() || 0;
      return resTime > lastSeenHistoryAt;
    }).length;
  }, [allHistoryCases, activeTab, lastSeenHistoryAt]);

  // In-progress case-level counters for sub-filter pills
  const allInProgressCases = useMemo(
    () => groupAlertsByStudent(combinedInProgressAlerts),
    [groupAlertsByStudent, combinedInProgressAlerts]
  );

  const countAllCases = allInProgressCases.length;
  const countDeclinedCases = useMemo(() => {
    return allInProgressCases.filter(
      (g) => getCaseOutreachStatus(g.primaryAlert) === 'DECLINED'
    ).length;
  }, [allInProgressCases, getCaseOutreachStatus]);

  const countActiveCases = useMemo(() => {
    return allInProgressCases.filter(
      (g) => getCaseOutreachStatus(g.primaryAlert) === 'ACTIVE'
    ).length;
  }, [allInProgressCases, getCaseOutreachStatus]);

  const countInvitedCases = useMemo(() => {
    return allInProgressCases.filter(
      (g) => getCaseOutreachStatus(g.primaryAlert) === 'INVITED'
    ).length;
  }, [allInProgressCases, getCaseOutreachStatus]);

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
                {groupedNeedsAction.length}
              </span>
              Needs Action
            </div>
            <div className="stat-chip">
              <span className="stat-num" id="statInProgress">
                {groupedInProgress.length}
              </span>
              In Progress
            </div>
            <div className="stat-chip">
              <span className="stat-num" id="statCritical">
                {stats.todayCritical || 0}
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
          {groupedNeedsAction.length > 0 && (
            <span className="tab-count" id="needsActionCount">
              {groupedNeedsAction.length}
            </span>
          )}
        </button>
        <button
          className={`alert-tab ${activeTab === 'inProgress' ? 'active' : ''}`}
          id="tabInProgress"
          onClick={() => handleTabSwitch('inProgress')}
        >
          <i className="fas fa-spinner"></i> In Progress
          {groupedInProgress.length > 0 && (
            <span className="tab-count" id="inProgressCount">
              {groupedInProgress.length}
            </span>
          )}
        </button>
        <button
          className={`alert-tab ${activeTab === 'history' ? 'active' : ''}`}
          id="tabHistory"
          onClick={() => handleTabSwitch('history')}
        >
          <i className="fas fa-archive"></i> Resolved History
          {unseenResolvedCount > 0 && (
            <span className="tab-count tab-count-history" id="historyCount">
              {unseenResolvedCount}
            </span>
          )}
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
            {groupedNeedsAction.length === 0 ? (
              <div className="alerts-empty">
                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
                <p>
                  {currentSevFilter !== 'ALL'
                    ? `No ${currentSevFilter.toLowerCase()} alerts`
                    : 'All clear — no incoming alerts needing action'}
                </p>
              </div>
            ) : (
              groupedNeedsAction.map((group) => renderAlertCard(group, true))
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
              All In Progress <span className="pill-count" id="countProgAll">{countAllCases}</span>
            </button>
            <button
              className={`sev-pill pill-declined ${currentProgressFilter === 'DECLINED' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('DECLINED')}
            >
              ⚠️ Outreach Declined <span className="pill-count" id="countProgDeclined">{countDeclinedCases}</span>
            </button>
            <button
              className={`sev-pill pill-active-chat ${currentProgressFilter === 'ACTIVE' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('ACTIVE')}
            >
              💬 Active In-Session <span className="pill-count" id="countProgActive">{countActiveCases}</span>
            </button>
            <button
              className={`sev-pill pill-invited ${currentProgressFilter === 'INVITED' ? 'active' : ''}`}
              onClick={() => setCurrentProgressFilter('INVITED')}
            >
              ⏳ Invite Pending <span className="pill-count" id="countProgInvited">{countInvitedCases}</span>
            </button>
          </div>
          <div id="inProgressContainer">
            {groupedInProgress.length === 0 ? (
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
              groupedInProgress.map((group) => renderAlertCard(group, true))
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
              { id: 'ALL', label: `All Active (${allHistoryCases.length})` },
              { id: 'RESOLVED', label: `✅ Resolved (${allHistoryCases.filter((g) => g.allAlerts.some((al) => al.status === 'RESOLVED')).length})` },
              { id: 'ESCALATED', label: `⬆ Escalated (${allHistoryCases.filter((g) => g.allAlerts.some((al) => al.status === 'ESCALATED')).length})` },
              { id: 'ARCHIVED', label: `📦 Archived (${allArchivedCases.length})` }
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
            {groupedHistory.length === 0 ? (
              <div className="alerts-empty">
                <i className={`fas ${currentHistoryFilter === 'ARCHIVED' ? 'fa-box-archive' : 'fa-archive'}`} style={{ color: '#6366f1' }}></i>
                <p>
                  {currentHistoryFilter === 'ARCHIVED'
                    ? 'No archived cases found'
                    : currentHistoryFilter === 'RESOLVED'
                    ? 'No resolved cases found'
                    : currentHistoryFilter === 'ESCALATED'
                    ? 'No escalated cases found'
                    : 'No active alert history found'}
                </p>
              </div>
            ) : (
              groupedHistory.map((group) => renderAlertCard(group, false, true))
            )}
          </div>
        </div>
      </div>

      {/* Resolution Modal */}
      {pendingAction && (
        <div className="modal-backdrop active" id="resolveModal">
          <div className="modal-box">
            <h3 id="modalTitle">
              {pendingAction.action === 'resolve' ? 'Resolve Case / Alert' : 'Escalate Alert'}
            </h3>
            <p
              style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.75rem' }}
              id="modalDesc"
            >
              {pendingAction.action === 'resolve'
                ? pendingAction.pseudonym
                  ? `Resolving case for ${pendingAction.pseudonym}. Notes will be applied to all related posts.`
                  : 'Add notes about how this alert was handled.'
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

      {/* Guardrail: Re-Outreach Confirmation Modal */}
      {reOutreachModal.open && (
        <div className="modal-backdrop active" id="reOutreachModal">
          <div className="modal-box" style={{ maxWidth: '460px' }}>
            <div className="modal-warning-icon">
              <i className="fas fa-hand-holding-heart"></i>
            </div>
            <h3
              style={{
                textAlign: 'center',
                fontSize: '1.15rem',
                color: '#1e293b',
                marginBottom: '0.4rem'
              }}
            >
              Outreach Recently Declined
            </h3>
            <p
              style={{
                fontSize: '0.85rem',
                color: '#475569',
                lineHeight: 1.5,
                textAlign: 'center',
                marginBottom: '1.25rem'
              }}
            >
              Student <strong>{reOutreachModal.pseudonym}</strong> recently declined a counseling reach-out with note: <em>"Prefers to vent only"</em>.
              <br /><br />
              Sending repeated invitations may feel intrusive or overwhelming to the student while they are venting.
              <br /><br />
              Are you sure you want to send another invitation, or keep monitoring?
            </p>
            <div className="modal-btns" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="cancel"
                onClick={() => setReOutreachModal({ open: false, alertId: null, pseudonym: '', message: '' })}
              >
                Keep Monitoring
              </button>
              <button
                className="confirm"
                style={{ background: '#d97706', borderColor: '#d97706' }}
                onClick={handleConfirmReOutreach}
              >
                Send Re-Invitation
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

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="modal-backdrop active" id="deleteConfirmModal">
          <div className="modal-box delete-modal-box">
            <div className="delete-modal-icon">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: '#1e293b', fontSize: '1.15rem' }}>
              Permanently Delete Case?
            </h3>
            <p className="delete-modal-desc">
              Are you sure you want to permanently delete the case for <strong>{deleteModal.pseudonym}</strong>
              {deleteModal.count > 1 ? ` (${deleteModal.count} posts in case)` : ''}?
            </p>
            <div className="delete-modal-warning">
              <i className="fas fa-info-circle"></i>
              <span>
                This action cannot be undone. All clinical notes and alert records for this student case will be permanently removed from the database.
              </span>
            </div>
            <div className="modal-btns">
              <button
                type="button"
                className="cancel"
                onClick={closeDeleteModal}
                disabled={!!historyActionLoadingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm delete-confirm-btn"
                onClick={handleConfirmDelete}
                disabled={!!historyActionLoadingId}
              >
                {historyActionLoadingId?.startsWith('delete-') ? (
                  <><i className="fas fa-spinner fa-spin"></i> Deleting...</>
                ) : (
                  <><i className="fas fa-trash-alt"></i> Delete Permanently</>
                )}
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
