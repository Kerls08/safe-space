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

export default function Navbar() {
  const { role, fullName, username, logout, badges, updateBadge } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
        try {
          const queueRes = await fetch(`${API_BASE}/chat/sessions/professional/${encodeURIComponent(username || '')}`, { headers: hdrs });
          if (queueRes.ok) {
            const data = await queueRes.json();
            const waitingCount = Array.isArray(data.waiting) ? data.waiting.length : 0;
            const activeList = Array.isArray(data.active) ? data.active : [];
            const unreadCount = activeList.reduce((acc, s) => acc + (s.unreadCount > 0 ? s.unreadCount : 0), 0);
            if (mounted) updateBadge('anon-chat', waitingCount + unreadCount);
          } else {
            const statsRes = await fetch(`${API_BASE}/chat/stats`, { headers: hdrs });
            if (statsRes.ok) {
              const stats = await statsRes.json();
              if (mounted) updateBadge('anon-chat', stats.waitingSessions || 0);
            }
          }
        } catch (e) { /* ignore */ }

        // Alerts badge
        try {
          const res = await fetch(`${API_BASE}/alerts/stats`, { headers: hdrs });
          if (res.ok) {
            const stats = await res.json();
            const unresolved = (stats.active || 0) + (stats.acknowledged || 0);
            if (mounted) updateBadge('crisis-alerts', unresolved);
          }
        } catch (e) { /* ignore */ }

        // Dashboard badge
        try {
          const res = await fetch(`${API_BASE}/dashboard/overview`, { headers: hdrs });
          if (res.ok) {
            const data = await res.json();
            if (mounted) updateBadge('pro-dashboard', data.flaggedPosts || 0);
          }
        } catch (e) { /* ignore */ }
      } else if (role === 'STUDENT') {
        // Student badge
        try {
          let totalUnread = 0;
          const pseudonyms = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
          const seenIds = new Set();

          for (const pseudo of pseudonyms) {
            const res = await fetch(`${API_BASE}/chat/sessions/student/${encodeURIComponent(pseudo)}`, { headers: hdrs });
            if (res.ok) {
              const sessions = await res.json();
              for (const s of sessions) {
                if (seenIds.has(s.sessionId)) continue;
                seenIds.add(s.sessionId);
                if (s.status === 'INVITED') totalUnread++;
                else if (s.unreadCount > 0) totalUnread += s.unreadCount;
              }
            }
          }

          if (username) {
            const res = await fetch(`${API_BASE}/chat/sessions/user/${encodeURIComponent(username)}`, { headers: hdrs });
            if (res.ok) {
              const sessions = await res.json();
              for (const s of sessions) {
                if (seenIds.has(s.sessionId)) continue;
                seenIds.add(s.sessionId);
                if (s.status === 'INVITED') totalUnread++;
                else if (s.unreadCount > 0) totalUnread += s.unreadCount;
              }
            }
          }

          if (mounted) updateBadge('anon-chat', totalUnread);
        } catch (e) { /* silent */ }
      }
    };

    pollBadges();
    const interval = setInterval(pollBadges, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [role, username, updateBadge]);

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
          <i className="fas fa-shield-heart"></i>
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
    </nav>
  );
}
