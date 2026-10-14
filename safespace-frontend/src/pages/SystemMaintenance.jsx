import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { maintenanceApi, userAdminApi, getToken } from '../services/api';
import '../styles/maintenance.css';
import '../styles/auth.css';

const TAB_INFO = {
  viewControls: {
    id: 'viewControls',
    title: 'System Overview & Maintenance',
    icon: 'fas fa-server',
    desc: 'Centralized platform controls, campus broadcast banner, and email gateway verification.'
  },
  viewUsers: {
    id: 'viewUsers',
    title: 'User Management & Accounts',
    icon: 'fas fa-users-gear',
    desc: 'Directory of institutional accounts, instant provisioning, batch imports, and lockout controls.'
  },
  viewHygiene: {
    id: 'viewHygiene',
    title: 'Safe Data Hygiene & Storage Scan',
    icon: 'fas fa-broom',
    desc: 'Audit and safely prune verified database garbage while shielding all student rants and active chats.'
  },
  viewAudit: {
    id: 'viewAudit',
    title: 'Security & System Audit Trail',
    icon: 'fas fa-shield-halved',
    desc: 'Persistent database ledger of administrative actions, account lockouts, and hygiene cleanups.'
  }
};

export default function SystemMaintenance({ initialTab }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Determine active tab from URL param or initialTab prop
  const getInitialActiveTab = () => {
    const tabParam = initialTab || searchParams.get('tab');
    if (tabParam === 'users') return 'viewUsers';
    if (tabParam === 'hygiene') return 'viewHygiene';
    if (tabParam === 'audit') return 'viewAudit';
    return 'viewControls';
  };

  const [activeTab, setActiveTab] = useState(getInitialActiveTab);

  // Diagnostics & Status
  const [healthData, setHealthData] = useState(null);
  const [lastCheckTime, setLastCheckTime] = useState('Checked just now');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Controls Form States
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceEstimate, setMaintenanceEstimate] = useState('');
  const [maintenanceAuditMeta, setMaintenanceAuditMeta] = useState('Maintenance mode currently inactive.');

  const [broadcastActive, setBroadcastActive] = useState(false);
  const [broadcastType, setBroadcastType] = useState('INFO');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastAuditMeta, setBroadcastAuditMeta] = useState('No active broadcast banner.');

  // Email Ping
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailResult, setEmailResult] = useState(null);

  // User Management
  const [userStats, setUserStats] = useState({ totalUsers: 0, students: 0, professionals: 0, passwordChanged: 0, lockedAccounts: 0 });
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [currentUserFilter, setCurrentUserFilter] = useState('ALL');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Data Hygiene
  const [hygieneScan, setHygieneScan] = useState(null);
  const [isScanningTrash, setIsScanningTrash] = useState(false);
  const [isCleaningTrash, setIsCleaningTrash] = useState(false);
  const [cleanNotice, setCleanNotice] = useState(null);

  // Audit Logs
  const [allAuditLogs, setAllAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [currentAuditFilter, setCurrentAuditFilter] = useState('ALL');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Modals
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    institutionalId: '',
    fullName: '',
    email: '',
    role: 'PROFESSIONAL',
    department: 'Guidance & Counseling Office'
  });
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regResult, setRegResult] = useState(null);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetModalData, setResetModalData] = useState(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 3500);
  };

  // ── Diagnostics & Telemetry ──
  const loadSystemHealth = useCallback(async () => {
    try {
      const data = await maintenanceApi.getHealth();
      setHealthData(data);

      const isMaint = data.maintenance?.active || false;
      setMaintenanceActive(isMaint);
      setMaintenanceMessage(data.maintenance?.message || '');
      setMaintenanceEstimate(data.maintenance?.estimatedEnd || '');
      if (isMaint && data.maintenance?.enabledBy) {
        setMaintenanceAuditMeta(`Activated by ${data.maintenance.enabledBy} on ${data.maintenance.enabledAt || 'today'}.`);
      } else {
        setMaintenanceAuditMeta('Maintenance mode currently inactive.');
      }

      const isBroad = data.broadcast?.active || false;
      setBroadcastActive(isBroad);
      setBroadcastType(data.broadcast?.type || 'INFO');
      setBroadcastMessage(data.broadcast?.message || '');
      if (isBroad && data.broadcast?.updatedBy) {
        setBroadcastAuditMeta(`Published by ${data.broadcast.updatedBy} (${data.broadcast.type}) on ${data.broadcast.updatedAt || 'today'}.`);
      } else {
        setBroadcastAuditMeta('No active broadcast banner.');
      }
    } catch (err) {
      showToast('Could not load system telemetry: ' + err.message);
    }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const logs = await maintenanceApi.getAuditLogs();
      setAllAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.warn('Audit logs load failed:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadUsersData = useCallback(async () => {
    setUsersLoading(true);
    try {
      const [stats, users] = await Promise.all([
        userAdminApi.getUserStats().catch(() => ({})),
        userAdminApi.getUsers().catch(() => [])
      ]);
      setUserStats({
        totalUsers: stats.totalUsers ?? 0,
        students: stats.students ?? 0,
        professionals: (stats.professionals ?? 0) + (stats.admins ?? stats.superAdmins ?? 0),
        passwordChanged: stats.passwordChangedCount ?? stats.passwordChanged ?? 0,
        lockedAccounts: stats.lockedAccounts ?? 0
      });
      setAllUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      showToast('Failed to load user accounts: ' + err.message);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const scanDatabaseTrash = useCallback(async () => {
    setIsScanningTrash(true);
    setCleanNotice(null);
    try {
      const data = await maintenanceApi.scanDatabaseTrash();
      setHygieneScan(data);
      showToast(`Scan complete: ${data.totalTrashItems} trash items found. Real user data is 100% protected.`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setIsScanningTrash(false);
    }
  }, []);

  const loadAllDiagnostics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadSystemHealth(), loadAuditLogs()]);
      setLastCheckTime('Updated ' + new Date().toLocaleTimeString());
    } catch (err) {
      showToast('Diagnostics load failed: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadSystemHealth, loadAuditLogs]);

  // Sync tab with URL search parameter if changed externally or on mount
  useEffect(() => {
    const tabParam = initialTab || searchParams.get('tab');
    if (tabParam === 'users') {
      setActiveTab('viewUsers');
      loadUsersData();
    } else if (tabParam === 'hygiene') {
      setActiveTab('viewHygiene');
      scanDatabaseTrash();
    } else if (tabParam === 'audit') {
      setActiveTab('viewAudit');
      loadAuditLogs();
    } else {
      setActiveTab('viewControls');
    }
  }, [searchParams, initialTab, loadUsersData, scanDatabaseTrash, loadAuditLogs]);

  useEffect(() => {
    loadAllDiagnostics();
  }, [loadAllDiagnostics]);

  // Keyboard shortcut: close modals on Escape key matching vanilla
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setRegisterModalOpen(false);
        setBatchModalOpen(false);
        setResetModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Maintenance Mode Toggle & Save ──
  const handleSaveMaintenance = async () => {
    try {
      const res = await maintenanceApi.setMaintenanceMode({
        active: maintenanceActive,
        message: maintenanceMessage.trim(),
        estimatedEnd: maintenanceEstimate.trim()
      });
      showToast(res.message || 'Maintenance settings applied.');
      loadAllDiagnostics();
    } catch (err) {
      showToast(err.message);
    }
  };

  // ── Campus Broadcast Toggle & Save ──
  const handleSaveBroadcast = async () => {
    if (broadcastActive && !broadcastMessage.trim()) {
      showToast('Please enter an announcement message before publishing.');
      return;
    }
    try {
      const res = await maintenanceApi.setBroadcastBanner({
        active: broadcastActive,
        type: broadcastType,
        message: broadcastMessage.trim()
      });
      showToast(res.message || 'Broadcast announcement updated.');
      loadAllDiagnostics();
    } catch (err) {
      showToast(err.message);
    }
  };

  // ── Email Ping Verification ──
  const handleVerifyEmail = async () => {
    setEmailTesting(true);
    setEmailResult(null);
    try {
      const res = await maintenanceApi.testEmailGateway();
      setEmailResult(res);
      loadAuditLogs();
    } catch (err) {
      setEmailResult({ success: false, message: err.message });
    } finally {
      setEmailTesting(false);
    }
  };

  // ── User Management Functions ──

  const handleToggleUserStatus = async (username) => {
    try {
      const res = await userAdminApi.toggleUserStatus(username);
      showToast(res.message || 'User status updated');
      loadUsersData();
      loadAuditLogs();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleResetUserPassword = async (username) => {
    if (!window.confirm(`Reset temporary password for @${username}?`)) return;
    try {
      const res = await userAdminApi.resetUserPassword(username);
      setResetModalData(res);
      setResetModalOpen(true);
      loadUsersData();
      loadAuditLogs();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteUserAccount = async (username, fullName) => {
    if (!window.confirm(`Permanently delete account for ${fullName} (@${username})? This cannot be undone.`)) return;
    try {
      await userAdminApi.deleteUser(username);
      showToast(`User @${username} deleted.`);
      loadUsersData();
      loadAuditLogs();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.institutionalId || !regForm.fullName || !regForm.email) {
      showToast('ID, Name, and Email are required.');
      return;
    }
    setRegSubmitting(true);
    setRegResult(null);
    try {
      const d = await userAdminApi.createUser(regForm);
      setRegResult({ success: true, data: d });
      showToast('User account provisioned.');
      loadUsersData();
      loadAuditLogs();
    } catch (err) {
      setRegResult({ success: false, error: err.message });
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleBatchFileImport = async () => {
    if (!selectedFile) return;
    setBatchSubmitting(true);
    setBatchResult(null);
    try {
      const d = await userAdminApi.importFile(selectedFile);
      setBatchResult({ success: true, count: d.successCount || 0, failed: d.failureCount || 0 });
      showToast(`Imported ${d.successCount || 0} users.`);
      loadUsersData();
      loadAuditLogs();
    } catch (err) {
      setBatchResult({ success: false, error: err.message });
    } finally {
      setBatchSubmitting(false);
    }
  };

  // ── Database Hygiene Functions ──

  const executeDatabaseCleanup = async () => {
    if (!window.confirm('Execute database hygiene? This will prune ONLY verified trash (0-message abandoned chats and expired tokens). Real student rants, chats, and crisis alerts will NOT be deleted.')) {
      return;
    }
    setIsCleaningTrash(true);
    try {
      const res = await maintenanceApi.executeDatabaseCleanup();
      setCleanNotice(res);
      showToast(`Cleanup complete: Purged ${res.totalPurged} trash items.`);
      setHygieneScan(null);
      loadAllDiagnostics();
    } catch (err) {
      showToast(err.message);
    } finally {
      setIsCleaningTrash(false);
    }
  };

  // ── CSV Download ──
  const handleDownloadAuditCsv = async () => {
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(maintenanceApi.getAuditLogsCsvUrl(), { headers });
      if (!res.ok) throw new Error('Could not download audit CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safespace-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Audit log CSV downloaded successfully.');
    } catch (err) {
      showToast(err.message);
    }
  };

  // ── Filtering Logic ──
  const filteredUsers = allUsers.filter((u) => {
    if (currentUserFilter !== 'ALL' && (u.role || '').toUpperCase() !== currentUserFilter) {
      return false;
    }
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.trim().toLowerCase();
      const matches =
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.institutionalId || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const filteredAuditLogs = allAuditLogs.filter((l) => {
    if (currentAuditFilter !== 'ALL' && (l.severity || '').toUpperCase() !== currentAuditFilter) {
      return false;
    }
    if (auditSearchQuery.trim()) {
      const q = auditSearchQuery.trim().toLowerCase();
      const matches =
        (l.action || '').toLowerCase().includes(q) ||
        (l.actor || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        (l.target || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  // Current tab info
  const tabInfo = TAB_INFO[activeTab] || TAB_INFO.viewControls;
  const isMaint = healthData?.maintenance?.active || false;
  const emailReady = healthData?.emailGateway?.configured || false;

  return (
    <div className="dash-layout">
      <div className="dash-container">
        {/* Page Header */}
        <div className="maint-header">
          <div className="maint-header-info">
            <h1 id="maintPageTitle">
              <i className={tabInfo.icon}></i> {tabInfo.title}
            </h1>
            <p className="maint-header-desc" id="maintPageDesc">
              {tabInfo.desc}
            </p>
          </div>
          <div>
            <button
              className="btn-action-outline"
              id="refreshBtn"
              onClick={() => {
                if (activeTab === 'viewUsers') loadUsersData();
                else if (activeTab === 'viewAudit') loadAuditLogs();
                else loadAllDiagnostics();
              }}
              disabled={isRefreshing}
            >
              <i className={`fas fa-${isRefreshing ? 'spinner fa-spin' : 'rotate-right'}`}></i> Refresh
            </button>
          </div>
        </div>

        {/* Live Operational Health Banner */}
        <div className="system-health-banner" id="systemHealthBanner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div className={`health-status-badge ${isMaint ? 'maintenance' : 'operational'}`} id="statusBadge">
              <span className={`pulse-dot ${isMaint ? 'amber' : 'green'}`} id="statusDot"></span>
              <span id="statusText">
                {isMaint ? 'Maintenance Mode Active' : 'All Core Systems Operational'}
              </span>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#64748b' }} id="lastCheckTime">
              {lastCheckTime}
            </span>
          </div>
          <div className="health-quick-pills">
            <div className="quick-pill">
              <span className="quick-pill-label">Server Uptime</span>
              <span className="quick-pill-val" id="quickUptime">
                {healthData?.jvm?.uptimeFormatted || 'Online'}
              </span>
            </div>
            <div className="quick-pill">
              <span className="quick-pill-label">Database</span>
              <span className="quick-pill-val" style={{ color: '#15803d' }}>
                <i className="fas fa-circle-check"></i> Connected
              </span>
            </div>
            <div className="quick-pill">
              <span className="quick-pill-label">Email Service</span>
              <span
                className="quick-pill-val"
                id="quickEmail"
                style={{ color: emailReady ? '#15803d' : '#b45309' }}
              >
                {emailReady ? 'Ready (Brevo API)' : 'Key Missing'}
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
             FEATURE VIEW 1: OVERVIEW / CONTROLS
             ══════════════════════════════════════════════════════════ */}
        <div className={`feature-view ${activeTab === 'viewControls' ? 'active' : ''}`} id="viewControls">
          <div className="maint-panels-row">
            {/* Panel A: Scheduled Maintenance Mode */}
            <div className="maint-card">
              <div className="maint-card-header">
                <div className="maint-card-title">
                  <i className="fas fa-screwdriver-wrench" style={{ color: '#D97706' }}></i> Scheduled Maintenance Mode
                </div>
                <div className="switch-wrapper">
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="maintenanceSwitch"
                      checked={maintenanceActive}
                      onChange={(e) => setMaintenanceActive(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      color: maintenanceActive ? '#d97706' : '#64748b'
                    }}
                    id="maintSwitchLabel"
                  >
                    {maintenanceActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
                When active, non-admin students are gracefully shown a maintenance notice while platform updates take place. All crisis hotlines remain clearly displayed.
              </p>

              <div className="panel-field">
                <label htmlFor="maintMessageInput">Maintenance Notice Displayed to Students</label>
                <textarea
                  id="maintMessageInput"
                  rows={3}
                  placeholder="Enter message displayed to students..."
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                />
              </div>

              <div className="panel-field">
                <label htmlFor="maintEstimateInput">Estimated Completion Window (Optional)</label>
                <input
                  type="text"
                  id="maintEstimateInput"
                  placeholder="e.g. 30 minutes (until 10:30 PM)"
                  value={maintenanceEstimate}
                  onChange={(e) => setMaintenanceEstimate(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }} id="maintAuditMeta">
                {maintenanceAuditMeta}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-action-primary" onClick={handleSaveMaintenance}>
                  <i className="fas fa-floppy-disk"></i> Apply Maintenance Settings
                </button>
              </div>
            </div>

            {/* Panel B: Campus Broadcast Announcement Banner */}
            <div className="maint-card">
              <div className="maint-card-header">
                <div className="maint-card-title">
                  <i className="fas fa-bullhorn" style={{ color: '#0284C7' }}></i> Campus Broadcast Announcement
                </div>
                <div className="switch-wrapper">
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="broadcastSwitch"
                      checked={broadcastActive}
                      onChange={(e) => setBroadcastActive(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      color: broadcastActive ? '#0284c7' : '#64748b'
                    }}
                    id="broadcastSwitchLabel"
                  >
                    {broadcastActive ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
                Display a persistent advisory banner at the top of all Safe Space pages. Ideal for campus guidance advisories, wellness weeks, or scheduled downtime notices.
              </p>

              <div className="panel-field">
                <label htmlFor="broadcastTypeSelect">Banner Severity Level</label>
                <select
                  id="broadcastTypeSelect"
                  value={broadcastType}
                  onChange={(e) => setBroadcastType(e.target.value)}
                >
                  <option value="INFO">Informational (Calm Blue)</option>
                  <option value="WARNING">Important Notice (Warm Amber)</option>
                  <option value="CRITICAL">Urgent Advisory (Clinical Red)</option>
                </select>
              </div>

              <div className="panel-field">
                <label htmlFor="broadcastMessageInput">Broadcast Message Text</label>
                <textarea
                  id="broadcastMessageInput"
                  rows={3}
                  placeholder="e.g. Notice: Guidance & Counseling Center midterms wellness workshops this Thursday."
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }} id="broadcastAuditMeta">
                {broadcastAuditMeta}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-action-primary" onClick={handleSaveBroadcast}>
                  <i className="fas fa-bullhorn"></i> Publish Broadcast Banner
                </button>
              </div>
            </div>
          </div>

          {/* Panel C: Email Gateway Quick Check */}
          <div className="maint-card">
            <div className="maint-card-header">
              <div className="maint-card-title">
                <i className="fas fa-envelope-circle-check" style={{ color: '#7C3AED' }}></i> Email Service Gateway Status
              </div>
              <button
                className="btn-action-outline"
                id="btnTestEmailPing"
                onClick={handleVerifyEmail}
                disabled={emailTesting}
              >
                <i className={`fas fa-${emailTesting ? 'spinner fa-spin' : 'paper-plane'}`}></i> Verify Email Delivery
              </button>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 0.5rem 0' }}>
              Safe Space uses the Brevo Transactional REST API to send credential welcome emails, OTPs, and password reset instructions.
            </p>
            {emailResult && (
              <div
                id="emailPingResult"
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.65rem',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  background: emailResult.success ? '#DCFCE7' : '#FEF3C7',
                  color: emailResult.success ? '#15803d' : '#B45309',
                  border: `1px solid ${emailResult.success ? '#BBF7D0' : '#FDE68A'}`
                }}
              >
                <i className={`fas fa-${emailResult.success ? 'circle-check' : 'triangle-exclamation'}`}></i>{' '}
                {emailResult.message}{' '}
                {emailResult.latencyMs !== undefined && `(${emailResult.latencyMs}ms)`}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
             FEATURE VIEW 2: USER MANAGEMENT
             ══════════════════════════════════════════════════════════ */}
        <div className={`feature-view ${activeTab === 'viewUsers' ? 'active' : ''}`} id="viewUsers">
          {/* User Stats Grid */}
          <div className="cred-stats" id="statsGrid" style={{ marginBottom: '1.5rem' }}>
            <div className="cred-stat-card">
              <div className="stat-icon green"><i className="fas fa-users"></i></div>
              <div className="stat-value" id="statTotal">{userStats.totalUsers}</div>
              <div className="stat-label">Total Users</div>
            </div>
            <div className="cred-stat-card">
              <div className="stat-icon blue"><i className="fas fa-graduation-cap"></i></div>
              <div className="stat-value" id="statStudents">{userStats.students}</div>
              <div className="stat-label">Students</div>
            </div>
            <div className="cred-stat-card">
              <div className="stat-icon purple"><i className="fas fa-user-doctor"></i></div>
              <div className="stat-value" id="statPros">{userStats.professionals}</div>
              <div className="stat-label">Professionals</div>
            </div>
            <div className="cred-stat-card">
              <div className="stat-icon amber"><i className="fas fa-key"></i></div>
              <div className="stat-value" id="statPwChanged">{userStats.passwordChanged}</div>
              <div className="stat-label">Password Changed</div>
            </div>
            <div className="cred-stat-card">
              <div className="stat-icon red"><i className="fas fa-lock"></i></div>
              <div className="stat-value" id="statLocked">{userStats.lockedAccounts}</div>
              <div className="stat-label">Locked Accounts</div>
            </div>
          </div>

          {/* User Management Card */}
          <div className="maint-card">
            <div className="maint-card-header">
              <div>
                <h3 className="maint-card-title"><i className="fas fa-users-gear"></i> User Directory &amp; Accounts</h3>
                <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                  Provision accounts, import students/staff, unlock logins, and reset passwords.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn-action-primary"
                  onClick={() => {
                    setRegResult(null);
                    setRegForm({
                      institutionalId: '',
                      fullName: '',
                      email: '',
                      role: 'PROFESSIONAL',
                      department: 'Guidance & Counseling Office'
                    });
                    setRegisterModalOpen(true);
                  }}
                >
                  <i className="fas fa-user-plus"></i> Add User
                </button>
                <button
                  className="btn-action-outline"
                  onClick={() => {
                    setBatchResult(null);
                    setSelectedFile(null);
                    setBatchModalOpen(true);
                  }}
                >
                  <i className="fas fa-file-import"></i> Import (CSV/Excel)
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="cred-toolbar" style={{ marginBottom: '1rem' }}>
              <div className="cred-search" style={{ flex: 1, maxWidth: '380px' }}>
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  id="searchInput"
                  placeholder="Search by name, username, or ID..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                />
              </div>
              <div className="cred-role-filter">
                {[
                  { id: 'ALL', label: 'All Accounts' },
                  { id: 'STUDENT', label: 'Students' },
                  { id: 'PROFESSIONAL', label: 'Staff Professionals' },
                  { id: 'SUPER_ADMIN', label: 'Guidance Leads' },
                  { id: 'MAINTENANCE', label: 'Maintenance' }
                ].map((rf) => (
                  <button
                    key={rf.id}
                    className={currentUserFilter === rf.id ? 'active' : ''}
                    onClick={() => setCurrentUserFilter(rf.id)}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Table */}
            <div className="cred-table-wrap">
              <table className="cred-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Password</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody id="usersTableBody">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        <i className="fas fa-spinner fa-spin"></i> Loading user directory...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No matching user accounts found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isLocked = u.lockedUntil != null;
                      return (
                        <tr key={u.username}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#161F36' }}>{u.fullName || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                              @{u.username} &bull; ID: {u.institutionalId || '—'}
                            </div>
                          </td>
                          <td>
                            <span className={`role-badge ${u.role?.toLowerCase()} ${u.role}`}>{u.role}</span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#475569' }}>{u.department || '—'}</td>
                          <td>
                            <span className={`status-badge ${u.active ? 'active' : 'inactive'}`}>
                              {u.active ? 'Active' : 'Inactive'}
                            </span>
                            {isLocked && (
                              <span
                                className="status-badge locked"
                                style={{ background: '#fee2e2', color: '#b91c1c', marginLeft: '4px' }}
                              >
                                <i className="fas fa-lock"></i> Locked
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: u.passwordChanged ? '#15803d' : '#d97706'
                              }}
                            >
                              <i className={`fas fa-${u.passwordChanged ? 'circle-check' : 'clock'}`}></i>{' '}
                              {u.passwordChanged ? 'Changed' : 'Default'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              className="action-btn"
                              title="Reset Password"
                              onClick={() => handleResetUserPassword(u.username)}
                            >
                              <i className="fas fa-key" style={{ color: '#d97706' }}></i>
                            </button>
                            <button
                              className={`action-btn ${u.active ? 'danger' : ''}`}
                              title={u.active ? 'Deactivate' : 'Activate'}
                              onClick={() => handleToggleUserStatus(u.username)}
                            >
                              <i
                                className={`fas fa-${u.active ? 'ban' : 'circle-check'}`}
                                style={{ color: u.active ? '#dc2626' : '#10b981' }}
                              ></i>
                            </button>
                            {u.username !== 'admin' && u.username !== 'maintenance' && (
                              <button
                                className="action-btn danger"
                                title="Delete Account"
                                onClick={() => handleDeleteUserAccount(u.username, u.fullName)}
                              >
                                <i className="fas fa-trash-can" style={{ color: '#dc2626' }}></i>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
             FEATURE VIEW 3: DATABASE HYGIENE
             ══════════════════════════════════════════════════════════ */}
        <div className={`feature-view ${activeTab === 'viewHygiene' ? 'active' : ''}`} id="viewHygiene">
          {/* Protected Data Shield Banner */}
          <div className="protected-grid">
            <div className="protected-card">
              <div className="protected-card-head">
                <span>Student Rants</span>
                <span className="protected-badge"><i className="fas fa-shield"></i> Protected</span>
              </div>
              <div className="protected-val" id="countProtPosts">
                {hygieneScan?.protectedPosts ?? healthData?.database?.totalPosts ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>100% Retained</div>
            </div>
            <div className="protected-card">
              <div className="protected-card-head">
                <span>Counseling Chats</span>
                <span className="protected-badge"><i className="fas fa-shield"></i> Protected</span>
              </div>
              <div className="protected-val" id="countProtChats">
                {hygieneScan?.protectedChatSessions ?? healthData?.database?.totalChatSessions ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Chats with messages kept</div>
            </div>
            <div className="protected-card">
              <div className="protected-card-head">
                <span>Crisis Alerts</span>
                <span className="protected-badge"><i className="fas fa-shield"></i> Protected</span>
              </div>
              <div className="protected-val" id="countProtAlerts">
                {hygieneScan?.protectedCrisisAlerts ?? healthData?.database?.totalCrisisAlerts ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Never pruned</div>
            </div>
            <div className="protected-card">
              <div className="protected-card-head">
                <span>User Accounts</span>
                <span className="protected-badge"><i className="fas fa-shield"></i> Protected</span>
              </div>
              <div className="protected-val" id="countProtUsers">
                {hygieneScan?.protectedUsers ?? healthData?.database?.totalUsers ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>All accounts preserved</div>
            </div>
          </div>

          {/* Database Cleaner Interactive Console */}
          <div className="maint-card">
            <div className="maint-card-header">
              <div>
                <h3 className="maint-card-title">
                  <i className="fas fa-broom" style={{ color: '#161F36' }}></i> Safeguarded Database Cleaner
                </h3>
                <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                  Scans for and cleans only non-user trash: abandoned empty chats (0 messages, &gt;14 days old) and expired session tokens.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn-action-outline"
                  id="btnScanTrash"
                  onClick={scanDatabaseTrash}
                  disabled={isScanningTrash}
                >
                  <i className={`fas fa-${isScanningTrash ? 'spinner fa-spin' : 'magnifying-glass'}`}></i> Scan for Trash
                </button>
              </div>
            </div>

            {/* Scan Results Preview Box */}
            {hygieneScan && (
              <div className="scan-results-box" id="scanResultsBox" style={{ display: 'block' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.92rem', color: '#161F36' }}>
                  <i className="fas fa-clipboard-check" style={{ color: '#0284c7' }}></i> Database Scan Results (Dry Run Preview)
                </h4>
                <div className="scan-item-row">
                  <span>Abandoned Ghost Chats (0 msgs, &gt;14 days old)</span>
                  <strong id="scanGhostCount">{hygieneScan.abandonedEmptySessions}</strong>
                </div>
                <div className="scan-item-row">
                  <span>Expired Inactive Session Tokens</span>
                  <strong id="scanTokensCount">{hygieneScan.staleTokens}</strong>
                </div>
                <div className="scan-item-row">
                  <span>Expired Brute-Force Lockout Cache</span>
                  <strong id="scanLockoutsCount">{hygieneScan.expiredLockouts}</strong>
                </div>
                <div className="scan-item-row" style={{ color: '#161F36' }}>
                  <span>Total Safe Trash Items Identified</span>
                  <span style={{ color: '#D97706', fontSize: '1.1rem' }} id="scanTotalCount">
                    {hygieneScan.totalTrashItems}
                  </span>
                </div>

                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-action-primary"
                    id="btnExecuteClean"
                    onClick={executeDatabaseCleanup}
                    disabled={hygieneScan.totalTrashItems === 0 || isCleaningTrash}
                  >
                    <i className={`fas fa-${isCleaningTrash ? 'spinner fa-spin' : hygieneScan.totalTrashItems === 0 ? 'circle-check' : 'trash-can'}`}></i>{' '}
                    {hygieneScan.totalTrashItems === 0
                      ? 'Database Hygiene Optimal (No Trash)'
                      : `Clean ${hygieneScan.totalTrashItems} Identified Items`}
                  </button>
                </div>
              </div>
            )}

            {cleanNotice && (
              <div
                id="cleanSummaryNotice"
                style={{
                  display: 'block',
                  marginTop: '1rem',
                  padding: '0.85rem 1rem',
                  background: '#DCFCE7',
                  color: '#15803d',
                  border: '1px solid #BBF7D0',
                  borderRadius: '0.65rem',
                  fontSize: '0.84rem',
                  fontWeight: 600
                }}
              >
                <i className="fas fa-circle-check"></i> {cleanNotice.message} ({cleanNotice.latencyMs}ms)
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
             FEATURE VIEW 4: SYSTEM AUDIT TRAIL
             ══════════════════════════════════════════════════════════ */}
        <div className={`feature-view ${activeTab === 'viewAudit' ? 'active' : ''}`} id="viewAudit">
          <div className="maint-card">
            <div className="maint-card-header">
              <div>
                <h3 className="maint-card-title">
                  <i className="fas fa-clock-rotate-left" style={{ color: '#161F36' }}></i> System &amp; Security Audit Trail
                </h3>
                <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                  Persistent database ledger of administrative actions, account lockouts, user management changes, and hygiene cleanups.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-action-outline" onClick={handleDownloadAuditCsv}>
                  <i className="fas fa-file-csv"></i> Download CSV
                </button>
                <button className="btn-action-outline" onClick={loadAuditLogs} disabled={auditLoading}>
                  <i className={`fas fa-${auditLoading ? 'spinner fa-spin' : 'rotate-right'}`}></i> Refresh Logs
                </button>
              </div>
            </div>

            {/* Filters Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}
            >
              <div className="audit-filters">
                {['ALL', 'WARN', 'CRITICAL', 'INFO', 'SUCCESS'].map((sev) => {
                  const label =
                    sev === 'ALL'
                      ? 'All Events'
                      : sev === 'WARN'
                      ? 'Warnings'
                      : sev === 'CRITICAL'
                      ? 'Critical'
                      : sev === 'INFO'
                      ? 'Info'
                      : 'Success';
                  return (
                    <button
                      key={sev}
                      className={`audit-filter-btn ${currentAuditFilter === sev ? 'active' : ''}`}
                      onClick={() => setCurrentAuditFilter(sev)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ position: 'relative', width: '240px' }}>
                <input
                  type="text"
                  id="auditSearchInput"
                  placeholder="Search audit logs..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.75rem',
                    border: '1.5px solid #E0D7C6',
                    borderRadius: '0.5rem',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Audit Table */}
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th style={{ width: '140px' }}>Timestamp</th>
                    <th style={{ width: '90px' }}>Severity</th>
                    <th style={{ width: '180px' }}>Action</th>
                    <th style={{ width: '110px' }}>Actor</th>
                    <th>Event Details</th>
                    <th style={{ width: '120px' }}>Target</th>
                  </tr>
                </thead>
                <tbody id="auditTableBody">
                  {auditLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.5rem' }}></i> Loading audit logs...
                      </td>
                    </tr>
                  ) : filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No audit logs found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((l) => {
                      const sev = (l.severity || 'INFO').toUpperCase();
                      return (
                        <tr key={l.id || l.timestamp + l.action}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                            {l.timestamp}
                          </td>
                          <td>
                            <span className={`badge-severity ${sev}`}>{sev}</span>
                          </td>
                          <td>
                            <strong style={{ color: '#161F36' }}>{l.action}</strong>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#0369a1' }}>{l.actor || 'system'}</span>
                          </td>
                          <td style={{ wordBreak: 'break-word' }}>{l.details}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                            {l.target || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {registerModalOpen && (
        <div
          className="cred-modal-overlay"
          id="registerModal"
          style={{ display: 'flex' }}
          onClick={() => setRegisterModalOpen(false)}
        >
          <div className="cred-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cred-modal-header">
              <h3><i className="fas fa-user-plus"></i> Create User Account</h3>
              <button
                type="button"
                className="cred-modal-close"
                onClick={() => setRegisterModalOpen(false)}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={handleCreateUserSubmit}>
              <div className="cred-modal-body">
                <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Provision a new university account with system credentials and automated email dispatch.
                </p>
                <div className="auth-form">
                  <div className="form-group">
                    <label className="form-label">
                      Account Role / Access Tier <span className="required-star" style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <select
                      className="form-input"
                      value={regForm.role}
                      onChange={(e) => setRegForm({ ...regForm, role: e.target.value })}
                    >
                      <option value="STUDENT">Student (University Student)</option>
                      <option value="PROFESSIONAL">Staff Professional (Psychologist / Psychometrician)</option>
                      <option value="SUPER_ADMIN">Guidance Center Head (Lead Psychometrician)</option>
                      <option value="MAINTENANCE">System Maintenance Engineer</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Institutional / Staff / Student ID <span className="required-star" style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. 2024-STU-001 or PROF-001"
                      value={regForm.institutionalId}
                      onChange={(e) => setRegForm({ ...regForm, institutionalId: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Full Name <span className="required-star" style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. Maria Santos or Juan Dela Cruz"
                      value={regForm.fullName}
                      onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Email Address <span className="required-star" style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. name@ustp.edu.ph or gmail.com"
                      type="email"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department / Office / College</label>
                    <input
                      className="form-input"
                      placeholder="e.g. College of Science / Guidance Center"
                      value={regForm.department}
                      onChange={(e) => setRegForm({ ...regForm, department: e.target.value })}
                    />
                  </div>
                </div>

                {regResult && (
                  <div style={{ marginTop: '1rem' }}>
                    {regResult.success ? (
                      <div
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '8px',
                          padding: '12px',
                          fontSize: '0.84rem'
                        }}
                      >
                        <h4 style={{ color: '#15803d', margin: '0 0 6px 0' }}>
                          <i className="fas fa-check-circle"></i> Account Created
                        </h4>
                        <div>Sign-In ID: <strong>{regResult.data.institutionalId || regResult.data.username}</strong></div>
                        <div>
                          Temp Password:{' '}
                          <strong style={{ fontFamily: 'monospace' }}>{regResult.data.generatedPassword}</strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                          {regResult.data.message}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: '#fee2e2',
                          color: '#b91c1c',
                          padding: '10px',
                          borderRadius: '6px',
                          fontSize: '0.84rem'
                        }}
                      >
                        {regResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="cred-modal-footer">
                <button
                  type="button"
                  className="cred-btn cred-btn-outline"
                  onClick={() => setRegisterModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cred-btn cred-btn-primary"
                  id="regSubmitBtn"
                  disabled={regSubmitting}
                >
                  <i className={`fas fa-${regSubmitting ? 'spinner fa-spin' : 'user-plus'}`}></i> Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      {batchModalOpen && (
        <div
          className="cred-modal-overlay"
          id="batchModal"
          style={{ display: 'flex' }}
          onClick={() => setBatchModalOpen(false)}
        >
          <div className="cred-modal" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="cred-modal-header">
              <h3><i className="fas fa-file-import"></i> Batch Import Users</h3>
              <button
                type="button"
                className="cred-modal-close"
                onClick={() => setBatchModalOpen(false)}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="cred-modal-body">
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.45 }}>
                Upload a spreadsheet (.xlsx, .xls, or .csv) containing student or staff records to provision accounts in bulk.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => window.open(userAdminApi.getImportTemplateUrl('xlsx'), '_blank')}
                  className="cred-btn cred-btn-outline"
                  style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem' }}
                >
                  <i className="fas fa-file-excel" style={{ color: '#16a34a' }}></i> Download Excel Template
                </button>
                <button
                  type="button"
                  onClick={() => window.open(userAdminApi.getImportTemplateUrl('csv'), '_blank')}
                  className="cred-btn cred-btn-outline"
                  style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem' }}
                >
                  <i className="fas fa-file-csv" style={{ color: '#2563eb' }}></i> Download CSV Template
                </button>
              </div>

              <div
                className="file-upload-zone"
                id="fileUploadZone"
                onClick={() => document.getElementById('fileInput').click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('dragover');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('dragover');
                  if (e.dataTransfer?.files?.length > 0) {
                    setSelectedFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input
                  type="file"
                  id="fileInput"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.length > 0) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="file-upload-icon"><i className="fas fa-cloud-arrow-up"></i></div>
                <p className="file-upload-text"><strong>Drop your file here</strong> or browse files</p>
                <p className="file-upload-hint">Supports .xlsx, .xls, and .csv files</p>
              </div>

              {selectedFile && (
                <div id="filePreview" style={{ marginTop: '0.75rem' }}>
                  <div
                    className="file-preview-header"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#FAF7F2',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '0.5rem'
                    }}
                  >
                    <span id="fileName" style={{ fontWeight: 700, fontSize: '0.84rem' }}>
                      {selectedFile.name}
                    </span>
                    <button
                      className="cred-btn cred-btn-outline"
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                      onClick={() => setSelectedFile(null)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {batchResult && (
                <div style={{ marginTop: '0.75rem' }}>
                  {batchResult.success ? (
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '0.84rem',
                        color: '#15803d'
                      }}
                    >
                      <i className="fas fa-check-circle"></i> Successfully created {batchResult.count} user accounts.{' '}
                      (Failed: {batchResult.failed})
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '0.84rem'
                      }}
                    >
                      {batchResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="cred-modal-footer">
              <button
                type="button"
                className="cred-btn cred-btn-outline"
                onClick={() => setBatchModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cred-btn cred-btn-primary"
                id="batchSubmitBtn"
                onClick={handleBatchFileImport}
                disabled={!selectedFile || batchSubmitting}
              >
                <i className={`fas fa-${batchSubmitting ? 'spinner fa-spin' : 'file-import'}`}></i> Import Users
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Result Modal */}
      {resetModalOpen && resetModalData && (
        <div
          className="cred-modal-overlay"
          id="resetModal"
          style={{ display: 'flex' }}
          onClick={() => setResetModalOpen(false)}
        >
          <div className="cred-modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="cred-modal-header">
              <h3><i className="fas fa-key"></i> Password Reset</h3>
              <button
                type="button"
                className="cred-modal-close"
                onClick={() => setResetModalOpen(false)}
              >
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="cred-modal-body" id="resetResult">
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '0.84rem'
                }}
              >
                <h4 style={{ color: '#15803d', margin: '0 0 6px 0' }}>
                  <i className="fas fa-check-circle"></i> Password Reset
                </h4>
                <p style={{ margin: '0 0 8px 0' }}>
                  Temporary password generated for <strong>@{resetModalData.username}</strong>:
                </p>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#161F36',
                    background: '#fff',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center'
                  }}
                >
                  {resetModalData.generatedPassword}
                </div>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '8px 0 0 0' }}>
                  {resetModalData.message}
                </p>
              </div>
            </div>
            <div className="cred-modal-footer">
              <button
                type="button"
                className="cred-btn cred-btn-primary"
                onClick={() => setResetModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastVisible && (
        <div className="copy-toast" id="copyToast" style={{ display: 'flex' }}>
          <i className="fas fa-circle-check" style={{ color: '#22c55e' }}></i>
          <span id="copyToastMsg">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
