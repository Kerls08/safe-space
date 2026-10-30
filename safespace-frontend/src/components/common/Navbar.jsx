import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, getInitials, roleBadgeColors } from '../../context/AuthContext';
import { API_BASE, getToken } from '../../services/api';

const NAV_CONFIG = {
  STUDENT: [],
  PROFESSIONAL: [],
  SUPER_ADMIN: [],
  MAINTENANCE: [],
  ADMIN: []
};

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* ignore */ }
}

export default function Navbar() {
  const { role, fullName, username, logout, badges, updateBadge } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [outreachToast, setOutreachToast] = useState(null);
  const dropdownRef = useRef(null);

  const links = NAV_CONFIG[role] || NAV_CONFIG.STUDENT;
  const badgeStyle = roleBadgeColors[role] || roleBadgeColors.STUDENT;

  const brandLink = (role === 'MAINTENANCE' || role === 'ADMIN')
    ? '/system-maintenance'
    : (role === 'SUPER_ADMIN' || role === 'PROFESSIONAL')
      ? '/pro-dashboard'
      : '/rant-board';

  // Badge polling logic matching auth-guard.js
  useEffect(() => {
    let mounted = true;
    const token = getToken();
    if (!token) return;

    const pollBadges = async () => {
      const hdrs = { 'Authorization': `Bearer ${token}` };

      if (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN' || role === 'ADMIN') {
        // Chat badge
        if (location.pathname === '/anon-chat') {
          if (mounted) updateBadge('anon-chat', 0);
        } else {
          try {
            const queueRes = await fetch(`${API_BASE}/chat/sessions/professional/${encodeURIComponent(username || '')}`, { headers: hdrs });
            if (queueRes.ok) {
              const data = await queueRes.json();
              const waitingCount = Array.isArray(data.waiting) ? data.waiting.length : 0;
              const activeList = Array.isArray(data.active) ? data.active : [];
              const unreadCount = activeList.reduce((acc, s) => acc + (s.unreadCount > 0 ? s.unreadCount : 0), 0);
              if (mounted) updateBadge('anon-chat', waitingCount + unreadCount);

              // Detect new outreach acceptance and show notification
              try {
                const notifiedSet = new Set(JSON.parse(localStorage.getItem('safespace_notified_sessions') || '[]'));
                let updatedNotified = false;
                for (const s of activeList) {
                  if (s.unreadCount > 0 && !notifiedSet.has(s.sessionId)) {
                    notifiedSet.add(s.sessionId);
                    updatedNotified = true;
                    if (location.pathname !== '/anon-chat') {
                      playNotificationSound();
                      setOutreachToast({
                        sessionId: s.sessionId,
                        pseudonym: s.studentPseudonym || 'Student',
                        message: `Student ${s.studentPseudonym || 'Anonymous'} accepted your outreach check-in! Active counseling is ready.`
                      });
                      setTimeout(() => setOutreachToast(null), 8000);
                    }
                  }
                }
                if (updatedNotified) {
                  localStorage.setItem('safespace_notified_sessions', JSON.stringify(Array.from(notifiedSet)));
                }
              } catch (err) { /* ignore */ }
            } else {
              const statsRes = await fetch(`${API_BASE}/chat/stats`, { headers: hdrs });
              if (statsRes.ok) {
                const stats = await statsRes.json();
                if (mounted) updateBadge('anon-chat', stats.waitingSessions || 0);
              }
            }
          } catch (e) { /* ignore */ }
        }

        // Alerts badge
        if (location.pathname === '/crisis-alerts') {
          if (mounted) updateBadge('crisis-alerts', 0);
        } else {
          try {
            const lastSeenAlerts = localStorage.getItem('safespace_last_seen_alerts');
            const lastSeenTime = lastSeenAlerts ? new Date(lastSeenAlerts).getTime() : 0;

            const res = await fetch(`${API_BASE}/alerts`, { headers: hdrs });
            if (res.ok) {
              const alerts = await res.json();
              if (Array.isArray(alerts)) {
                const newAlerts = alerts.filter((a) => {
                  const alertTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                  return alertTime > lastSeenTime;
                });
                if (mounted) updateBadge('crisis-alerts', newAlerts.length);
              }
            }
          } catch (e) { /* ignore */ }
        }

        // Dashboard badge
        if (location.pathname === '/pro-dashboard') {
          if (mounted) updateBadge('pro-dashboard', 0);
          try {
            const res = await fetch(`${API_BASE}/dashboard/overview`, { headers: hdrs });
            if (res.ok) {
              const data = await res.json();
              const flaggedCount = data.flaggedPosts || 0;
              localStorage.setItem('safespace_seen_flagged_posts', String(flaggedCount));
            }
          } catch (e) { /* ignore */ }
        } else {
          try {
            const res = await fetch(`${API_BASE}/dashboard/overview`, { headers: hdrs });
            if (res.ok) {
              const data = await res.json();
              const stored = localStorage.getItem('safespace_seen_flagged_posts');
              const seenFlagged = stored !== null ? parseInt(stored, 10) : 0;
              const flaggedCount = data.flaggedPosts || 0;
              if (seenFlagged > flaggedCount) {
                localStorage.setItem('safespace_seen_flagged_posts', String(flaggedCount));
              }
              const effectiveSeen = Math.min(seenFlagged, flaggedCount);
              const newFlagged = Math.max(0, flaggedCount - effectiveSeen);
              if (mounted) updateBadge('pro-dashboard', newFlagged);
            }
          } catch (e) { /* ignore */ }
        }
      } else if (role === 'STUDENT') {
        // When student is currently on /anon-chat, AnonChat component actively manages the badge based on active session selection
        if (location.pathname === '/anon-chat') {
          return;
        }

        // Student badge for /rant-board, /profile, etc.
        try {
          let totalUnread = 0;
          const pseudonyms = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
          const seenInvites = new Set(JSON.parse(localStorage.getItem('safespace_seen_invites') || '[]'));
          const seenIds = new Set();

          const processSession = (s) => {
            if (seenIds.has(s.sessionId)) return;
            seenIds.add(s.sessionId);
            if (s.status === 'INVITED') {
              if (!seenInvites.has(s.sessionId)) totalUnread++;
            } else if (s.status !== 'CLOSED' && s.status !== 'DECLINED' && (s.unreadCount || 0) > 0) {
              totalUnread += s.unreadCount;
            }
          };

          for (const pseudo of pseudonyms) {
            const res = await fetch(`${API_BASE}/chat/sessions/student/${encodeURIComponent(pseudo)}`, { headers: hdrs });
            if (res.ok) {
              const sessions = await res.json();
              for (const s of sessions) processSession(s);
            }
          }

          if (username) {
            const res = await fetch(`${API_BASE}/chat/sessions/user/${encodeURIComponent(username)}`, { headers: hdrs });
            if (res.ok) {
              const sessions = await res.json();
              for (const s of sessions) processSession(s);
            }
          }

          if (mounted) updateBadge('anon-chat', totalUnread);
        } catch (e) { /* silent */ }
      } else if (role === 'MAINTENANCE' || role === 'ADMIN') {
        const isUsersTab = location.pathname === '/system-maintenance' && location.search.includes('tab=users');
        const isAuditTab = location.pathname === '/system-maintenance' && location.search.includes('tab=audit');

        // User Management badge: locked accounts
        if (isUsersTab) {
          if (mounted) updateBadge('maint-users', 0);
        } else {
          try {
            const statsRes = await fetch(`${API_BASE}/auth/stats`, { headers: hdrs });
            if (statsRes.ok) {
              const data = await statsRes.json();
              const locked = data.lockedAccounts || 0;
              const lastSeenUsers = localStorage.getItem('safespace_last_seen_maint_users');
              if (lastSeenUsers && locked === 0) {
                if (mounted) updateBadge('maint-users', 0);
              } else {
                if (mounted) updateBadge('maint-users', locked);
              }
            }
          } catch (e) { /* ignore */ }
        }

        // Audit Trail badge: critical security logs
        if (isAuditTab) {
          if (mounted) updateBadge('maint-audit', 0);
        } else {
          try {
            const lastSeenAudit = localStorage.getItem('safespace_last_seen_maint_audit');
            const lastSeenTime = lastSeenAudit ? new Date(lastSeenAudit).getTime() : 0;
            const logsRes = await fetch(`${API_BASE}/admin/maintenance/audit-logs`, { headers: hdrs });
            if (logsRes.ok) {
              const logs = await logsRes.json();
              if (Array.isArray(logs)) {
                const critLogs = logs.filter((l) => {
                  const logTime = l.timestamp || l.createdAt ? new Date(l.timestamp || l.createdAt).getTime() : 0;
                  return (l.severity === 'CRITICAL' || l.severity === 'WARN') && logTime > lastSeenTime;
                });
                if (mounted) updateBadge('maint-audit', critLogs.length);
              }
            }
          } catch (e) { /* ignore */ }
        }
      }
    };

    pollBadges();
    const interval = setInterval(pollBadges, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [role, username, updateBadge, location.pathname, location.search]);

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };

    document.addEventListener('click', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar" id="navbar">
      <div className="navbar-inner">
        <Link to={brandLink} className="navbar-brand">
          <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="navbar-brand-logo" />
          <span className="brand-text">Safe<span>Space</span></span>
        </Link>

        <div className="navbar-menu" id="navMenu">
          <div className="navbar-user-dropdown" id="userDropdown" ref={dropdownRef}>
            <button
              className={`navbar-user-trigger ${dropdownOpen ? 'open' : ''}`}
              type="button"
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen((prev) => !prev);
              }}
            >
              <div className="navbar-user-avatar">{getInitials(fullName)}</div>
              <span className="navbar-user-name">{fullName || ''}</span>
              <i className="fas fa-chevron-down navbar-user-chevron"></i>
            </button>

            <div className={`navbar-dropdown-panel ${dropdownOpen ? 'open' : ''}`}>
              <div className="dropdown-user-header">
                <div className="dropdown-avatar">{getInitials(fullName)}</div>
                <div className="dropdown-user-info">
                  <span className="dropdown-user-fullname">{fullName || ''}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <span 
                      className="dropdown-role-badge" 
                      style={{ 
                        background: badgeStyle.bg, 
                        color: badgeStyle.color, 
                        border: `1px solid ${badgeStyle.border}` 
                      }}
                    >
                      {badgeStyle.label || role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="dropdown-menu-items">
                <Link 
                  to="/profile" 
                  className="dropdown-menu-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  <i className="fas fa-user-circle"></i> My Profile
                </Link>
                <div className="dropdown-divider"></div>
                <button 
                  type="button" 
                  className="dropdown-menu-item logout-item" 
                  onClick={handleSignOut}
                >
                  <i className="fas fa-arrow-right-from-bracket"></i> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {outreachToast && (
        <div 
          className="outreach-accepted-toast"
          onClick={() => {
            navigate(`/anon-chat?session=${outreachToast.sessionId}`);
            setOutreachToast(null);
          }}
          style={{
            position: 'fixed',
            top: 'calc(var(--header-height, 56px) + var(--sat, 0px) + 0.65rem)',
            right: 'max(1rem, var(--sar, 0px))',
            maxWidth: 'calc(100vw - 2rem)',
            zIndex: 9999,
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: '#FFFFFF',
            padding: '0.85rem 1.25rem',
            borderRadius: '0.85rem',
            boxShadow: '0 8px 24px rgba(5, 150, 105, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            cursor: 'pointer',
            animation: 'fadeInTab 0.3s ease-out',
            fontFamily: 'Inter, sans-serif',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-comments" style={{ fontSize: '1rem', color: '#fff' }}></i>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.02em' }}>Outreach Accepted ✓</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.95, marginTop: '2px' }}>{outreachToast.message}</div>
          </div>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setOutreachToast(null); }}
            style={{ background: 'transparent', border: 'none', color: '#fff', opacity: 0.75, cursor: 'pointer', marginLeft: '0.5rem', fontSize: '1rem' }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}
    </nav>
  );
}
