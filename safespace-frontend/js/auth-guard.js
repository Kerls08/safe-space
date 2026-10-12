/**
 * Safe Space — RBAC Auth Guard & Dynamic Navigation
 *
 * Include this script on EVERY protected page (before the page's own scripts).
 * It handles:
 *
 *   1. Session validation — redirects to login if no/invalid token
 *   2. Role-based page guard — blocks access based on RBAC rules
 *   3. Dynamic navbar rendering — shows only role-appropriate links
 *   4. Auth header injection — provides authHeaders() for fetch calls
 *   5. Logout — clears session, invalidates token on server
 *
 * Usage:
 *   <script src="js/auth-guard.js" data-page="rant-board"
 *           data-allowed-roles="STUDENT,PROFESSIONAL,ADMIN"></script>
 *
 *   data-page:          Current page identifier (for navbar "active" state)
 *   data-allowed-roles: Comma-separated roles allowed on this page
 *                        Omit or set "ALL" for any authenticated user
 */

const SafeSpaceAuth = (() => {
  const API_BASE = window.SAFE_SPACE_API_URL || (window.location.protocol === 'file:' || window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') ? 'http://localhost:8080/api' : 'https://safespace-backend-ws0m.onrender.com/api');
  const API = API_BASE + '/auth';

  // ── Session Data ──
  const getToken    = () => sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
  const getUsername = () => sessionStorage.getItem('ss_username') || localStorage.getItem('ss_username');
  const getRole     = () => sessionStorage.getItem('ss_role') || localStorage.getItem('ss_role');
  const getFullName = () => sessionStorage.getItem('ss_fullName') || localStorage.getItem('ss_fullName');

  /**
   * Returns Authorization headers for API calls.
   */
  function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  /**
   * Authenticated fetch wrapper — auto-attaches Bearer token.
   * On 401 response, clears session and redirects to login.
   */
  async function authFetch(url, options = {}) {
    const token = getToken();
    if (!options.headers) options.headers = {};
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (!options.headers['Content-Type'] && options.body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, options);

    if (res.status === 401) {
      if (!options.silent) {
        clearSession();
        window.location.href = 'landing.html';
      }
      throw new Error('Session expired. Redirecting to login.');
    }

    if (res.status === 403) {
      if (!options.silent) {
        showAccessDenied();
      }
      throw new Error('Access denied.');
    }

    return res;
  }

  /**
   * Clear all session data.
   */
  function clearSession() {
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_username');
    localStorage.removeItem('ss_role');
    localStorage.removeItem('ss_fullName');
    localStorage.removeItem('safespace_pseudonyms');
    localStorage.removeItem('safespace_pseudonym');
    sessionStorage.removeItem('ss_token');
    sessionStorage.removeItem('ss_username');
    sessionStorage.removeItem('ss_role');
    sessionStorage.removeItem('ss_fullName');
  }

  /**
   * Log out — invalidate token on server and redirect.
   */
  async function logout() {
    const token = getToken();
    if (token) {
      try {
        await fetch(`${API}/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch (e) { /* ignore */ }
    }
    clearSession();
    window.location.href = 'landing.html';
  }

  /**
   * Show access denied overlay (for unauthorized page access).
   */
  function showAccessDenied() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(17,24,39,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:1.5rem;padding:2.5rem;max-width:400px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.2);">
        <div style="width:4rem;height:4rem;border-radius:50%;background:#fee2e2;display:inline-flex;align-items:center;justify-content:center;font-size:1.5rem;color:#dc2626;margin-bottom:1rem;">
          <i class="fas fa-shield-halved"></i>
        </div>
        <h2 style="font-size:1.3rem;font-weight:800;color:#111827;margin-bottom:0.5rem;">Access Denied</h2>
        <p style="font-size:0.85rem;color:#6b7280;margin-bottom:1.5rem;">
          Your role <strong style="color:#dc2626;">${getRole() || 'UNKNOWN'}</strong> does not have permission to access this page.
        </p>
        <div style="display:flex;gap:0.75rem;justify-content:center;">
          <button onclick="history.back()" style="padding:0.65rem 1.2rem;border-radius:0.75rem;border:1.5px solid #E0D7C6;background:#fff;color:#161F36;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">Go Back</button>
          <button onclick="SafeSpaceAuth.logout()" style="padding:0.65rem 1.2rem;border-radius:0.75rem;border:none;background:#161F36;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;box-shadow:0 3px 10px rgba(22,31,54,0.3);">Switch Account</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // ── Navigation Configuration ──

  const NAV_CONFIG = {
    STUDENT: [
      { name: 'Rant Board', href: 'rant-board.html', icon: 'fas fa-comment-dots', id: 'rant-board' },
      { name: 'Chat', href: 'anon-chat.html', icon: 'fas fa-comments', id: 'anon-chat' }
    ],
    PROFESSIONAL: [
      { name: 'Rant Board', href: 'rant-board.html', icon: 'fas fa-comment-dots', id: 'rant-board' },
      { name: 'Chat', href: 'anon-chat.html', icon: 'fas fa-comments', id: 'anon-chat' },
      { name: 'Dashboard', href: 'pro-dashboard.html', icon: 'fas fa-chart-line', id: 'pro-dashboard' },
      { name: 'Crisis Alerts', href: 'crisis-alerts.html', icon: 'fas fa-bell', id: 'crisis-alerts' },
      { name: 'Resources', href: 'resource-manager.html', icon: 'fas fa-hand-holding-heart', id: 'resource-manager' },
      { name: 'Colleagues', href: 'colleagues.html', icon: 'fas fa-user-doctor', id: 'colleagues' }
    ],
    SUPER_ADMIN: [
      { name: 'Rant Board', href: 'rant-board.html', icon: 'fas fa-comment-dots', id: 'rant-board' },
      { name: 'Chat', href: 'anon-chat.html', icon: 'fas fa-comments', id: 'anon-chat' },
      { name: 'Dashboard', href: 'pro-dashboard.html', icon: 'fas fa-chart-line', id: 'pro-dashboard' },
      { name: 'Crisis Alerts', href: 'crisis-alerts.html', icon: 'fas fa-bell', id: 'crisis-alerts' },
      { name: 'Resources', href: 'resource-manager.html', icon: 'fas fa-hand-holding-heart', id: 'resource-manager' },
      { name: 'Colleagues', href: 'colleagues.html', icon: 'fas fa-user-doctor', id: 'colleagues' }
    ],
    MAINTENANCE: [
      { name: 'System Maintenance', href: 'system-maintenance.html', icon: 'fas fa-server', id: 'system-maintenance' },
      { name: 'User Management', href: 'credential-manager.html', icon: 'fas fa-users-gear', id: 'credential-manager' }
    ],
    ADMIN: [
      { name: 'System Maintenance', href: 'system-maintenance.html', icon: 'fas fa-server', id: 'system-maintenance' },
      { name: 'User Management', href: 'credential-manager.html', icon: 'fas fa-users-gear', id: 'credential-manager' },
      { name: 'Colleagues', href: 'colleagues.html', icon: 'fas fa-user-doctor', id: 'colleagues' },
      { name: 'Dashboard', href: 'pro-dashboard.html', icon: 'fas fa-chart-line', id: 'pro-dashboard' }
    ]
  };

  /**
   * Build the dynamic navbar based on the user's role.
   * On mobile (<768px), the menu collapses behind a hamburger toggle.
   * User info + logout are INSIDE the collapsible menu so they appear on mobile.
   */
  function renderNavbar(activePage) {
    const nav = document.getElementById('navbar');
    if (!nav) return;

    const role = getRole();
    const fullName = getFullName();
    const links = NAV_CONFIG[role] || NAV_CONFIG['STUDENT'];

    const roleBadgeColors = {
      STUDENT: { bg: '#E8EFF4', color: '#161F36', border: '#BACBD8', label: 'STUDENT' },
      PROFESSIONAL: { bg: '#F2EDE2', color: '#161F36', border: '#E0D7C6', label: 'PROFESSIONAL' },
      SUPER_ADMIN: { bg: '#F2EDE2', color: '#161F36', border: '#E0D7C6', label: 'PROFESSIONAL' },
      MAINTENANCE: { bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD', label: 'MAINTENANCE (IT)' },
      ADMIN: { bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE', label: 'ADMINISTRATOR' }
    };
    const badge = roleBadgeColors[role] || roleBadgeColors.STUDENT;

    nav.innerHTML = `
      <div class="navbar-inner">
        <a href="${(role === 'MAINTENANCE' || role === 'ADMIN') ? 'system-maintenance.html' : (role === 'SUPER_ADMIN' || role === 'PROFESSIONAL') ? 'pro-dashboard.html' : 'rant-board.html'}" class="navbar-brand">
          <i class="fas fa-shield-heart"></i>
          <span class="brand-text">Safe<span>Space</span></span>
        </a>
        <div class="navbar-menu" id="navMenu">
          ${links.map(l =>
            `<a href="${l.href}" class="navbar-link${l.id === activePage ? ' active' : ''}" data-nav-id="${l.id}" style="display:inline-flex;align-items:center;gap:0.3rem;">
              ${l.name}<span class="nav-badge" id="badge-${l.id}" style="display:none;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EF4444;color:#FFFFFF;font-size:0.68rem;font-weight:700;line-height:18px;text-align:center;box-shadow:0 1px 4px rgba(239,68,68,0.25);flex-shrink:0;"></span>
            </a>`
          ).join('')}
          <div class="navbar-user-dropdown" id="userDropdown">
            <button class="navbar-user-trigger" id="userDropdownTrigger" type="button" aria-haspopup="true" aria-expanded="false">
              <div class="navbar-user-avatar" id="userAvatar">${getInitials(fullName)}</div>
              <span class="navbar-user-name">${escapeHtml(fullName || '')}</span>
              <i class="fas fa-chevron-down navbar-user-chevron"></i>
            </button>
            <div class="navbar-dropdown-panel" id="userDropdownPanel">
              <div class="dropdown-user-header">
                <div class="dropdown-avatar">${getInitials(fullName)}</div>
                <div class="dropdown-user-info">
                  <span class="dropdown-user-fullname">${escapeHtml(fullName || '')}</span>
                  <div style="display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;margin-top:0.25rem;">
                    <span class="dropdown-role-badge" style="background:${badge.bg};color:${badge.color};border:1px solid ${badge.border};">${badge.label || role}</span>
                  </div>
                </div>
              </div>
              <div class="dropdown-menu-items">
                <a href="profile.html" class="dropdown-menu-item">
                  <i class="fas fa-user-circle"></i> My Profile
                </a>
                <div class="dropdown-divider"></div>
                <button class="dropdown-menu-item logout-item" onclick="SafeSpaceAuth.logout()">
                  <i class="fas fa-arrow-right-from-bracket"></i> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
        <button id="navToggle" class="navbar-toggle" aria-label="Open navigation" onclick="document.getElementById('navMenu').classList.toggle('open')">
          <span></span><span></span><span></span>
        </button>
      </div>
    `;

    // ── Dropdown Toggle Logic ──
    const trigger = document.getElementById('userDropdownTrigger');
    const panel = document.getElementById('userDropdownPanel');
    if (trigger && panel) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains('open');
        panel.classList.toggle('open');
        trigger.classList.toggle('open');
        trigger.setAttribute('aria-expanded', !isOpen);
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#userDropdown')) {
          panel.classList.remove('open');
          trigger.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Close dropdown on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          panel.classList.remove('open');
          trigger.classList.remove('open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Check for broadcast announcements and maintenance mode
    checkSystemStatusBanner();

    // Start notification badge polling
    pollNavBadges();
    _badgeInterval = setInterval(pollNavBadges, 10000);
  }

  async function checkSystemStatusBanner() {
    try {
      const res = await fetch(API_BASE + '/admin/maintenance/status');
      if (!res.ok) return;
      const data = await res.json();
      
      const role = getRole();
      const existing = document.getElementById('systemBroadcastBanner');
      if (existing) existing.remove();

      let bannerHtml = '';
      if (data.maintenance && data.maintenance.active && role !== 'MAINTENANCE' && role !== 'ADMIN') {
        bannerHtml = `
          <div id="systemBroadcastBanner" style="position:fixed;top:56px;left:0;right:0;z-index:999;background:#FEF3C7;color:#92400E;padding:0.65rem 1.25rem;border-bottom:1px solid #FDE68A;display:flex;align-items:center;justify-content:center;gap:0.6rem;font-size:0.85rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <i class="fas fa-triangle-exclamation" style="color:#D97706;font-size:1rem;"></i>
            <span><strong>Maintenance Notice:</strong> ${escapeHtml(data.maintenance.message || 'Scheduled platform maintenance is currently active.')}</span>
          </div>
        `;
      } else if (data.broadcast && data.broadcast.active) {
        const type = (data.broadcast.type || 'INFO').toUpperCase();
        let bg = '#E0F2FE', text = '#0369A1', border = '#BAE6FD', icon = 'fas fa-bullhorn';
        if (type === 'WARNING') {
          bg = '#FEF3C7'; text = '#92400E'; border = '#FDE68A'; icon = 'fas fa-triangle-exclamation';
        } else if (type === 'CRITICAL') {
          bg = '#FEE2E2'; text = '#991B1B'; border = '#FECACA'; icon = 'fas fa-circle-exclamation';
        }
        bannerHtml = `
          <div id="systemBroadcastBanner" style="position:fixed;top:56px;left:0;right:0;z-index:999;background:${bg};color:${text};padding:0.6rem 1.25rem;border-bottom:1px solid ${border};display:flex;align-items:center;justify-content:center;gap:0.6rem;font-size:0.84rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <i class="${icon}" style="font-size:0.95rem;"></i>
            <span>${escapeHtml(data.broadcast.message)}</span>
          </div>
        `;
      }

      if (bannerHtml) {
        const div = document.createElement('div');
        div.innerHTML = bannerHtml;
        document.body.appendChild(div.firstElementChild);
      }
    } catch (e) { /* ignore */ }
  }

  let _badgeInterval = null;

  /**
   * Update a navbar badge count.
   */
  function updateBadge(navId, count) {
    const el = document.getElementById('badge-' + navId);
    if (!el) return;
    if (count === '!') {
      el.textContent = '!';
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      return;
    }
    const n = typeof count === 'number' ? count : 0;
    if (n > 0) {
      el.textContent = n > 99 ? '99+' : n;
      el.style.display = 'inline-flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
    } else {
      el.style.display = 'none';
    }
  }

  /**
   * Force an immediate badge refresh (callable from other pages after actions).
   */
  function refreshBadges() {
    pollNavBadges();
  }

  /**
   * Poll API endpoints to fetch notification counts for navbar badges.
   *
   * PROFESSIONAL & SUPER_ADMIN:
   *   Chat      → waiting sessions + unread messages from students in active sessions
   *   Alerts    → active (unresolved) alert count
   *   Dashboard → flagged posts needing review
   *
   * STUDENT:
   *   Chat      → unread messages from professional/system across own sessions
   */
  async function pollNavBadges() {
    const role = getRole();
    const token = getToken();
    if (!token) return;

    if (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN' || role === 'ADMIN') {
      await pollProfessionalBadges();
    } else if (role === 'STUDENT') {
      await pollStudentBadges();
    }
  }

  /**
   * Professional badge polling:
   *  - Chat: waiting sessions in queue + unread messages in active sessions
   *  - Alerts: active + acknowledged (unresolved) alert count
   *  - Dashboard: flagged posts needing review
   */
  async function pollProfessionalBadges() {
    const username = getUsername();
    const token = getToken();
    if (!token || !username) return;

    const hdrs = { 'Authorization': 'Bearer ' + token };

    // 1. Chat badge: waiting sessions in queue + unread messages in active sessions
    try {
      let chatCount = 0;
      const queueRes = await fetch(API_BASE + '/chat/sessions/professional/' + encodeURIComponent(username), { headers: hdrs });
      if (queueRes.ok) {
        const data = await queueRes.json();
        const waitingList = Array.isArray(data.waiting) ? data.waiting : [];
        const activeList = Array.isArray(data.active) ? data.active : [];

        // Unread messages from students in active chats
        const unreadMessagesCount = activeList.reduce((acc, s) => acc + (s.unreadCount > 0 ? s.unreadCount : 0), 0);

        // Waiting sessions needing counselor pickup
        const waitingCount = waitingList.length;

        chatCount = waitingCount + unreadMessagesCount;
      } else {
        const statsRes = await fetch(API_BASE + '/chat/stats', { headers: hdrs });
        if (statsRes.ok) {
          const stats = await statsRes.json();
          chatCount = stats.waitingSessions || 0;
        }
      }
      updateBadge('anon-chat', chatCount);
    } catch (e) { /* ignore */ }

    // 2. Alerts badge: active + acknowledged (unresolved) crisis alerts
    try {
      const res = await fetch(API_BASE + '/alerts/stats', { headers: hdrs });
      if (res.ok) {
        const stats = await res.json();
        const unresolvedAlerts = (stats.active || 0) + (stats.acknowledged || 0);
        updateBadge('crisis-alerts', unresolvedAlerts);
      }
    } catch (e) { /* ignore */ }

    // 3. Dashboard badge: flagged posts requiring review
    try {
      const res = await fetch(API_BASE + '/dashboard/overview', { headers: hdrs });
      if (res.ok) {
        const data = await res.json();
        const flagged = data.flaggedPosts || 0;
        updateBadge('pro-dashboard', flagged);
      }
    } catch (e) { /* ignore */ }
  }

  async function pollStudentBadges() {
    const pseudonyms = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
    const token = getToken();
    const username = getUsername();
    if (!token) {
      updateBadge('anon-chat', 0);
      return;
    }

    const hdrs = { 'Authorization': 'Bearer ' + token };
    let totalUnread = 0;
    const seenSessionIds = new Set();

    // 1. Fetch sessions for each stored pseudonym
    for (const pseudonym of pseudonyms) {
      try {
        const res = await fetch(
          API_BASE + '/chat/sessions/student/' + encodeURIComponent(pseudonym),
          { headers: hdrs }
        );
        if (!res.ok) continue;
        const sessions = await res.json();
        for (const s of sessions) {
          if (seenSessionIds.has(s.sessionId)) continue;
          seenSessionIds.add(s.sessionId);
          if (s.status === 'INVITED') {
            totalUnread += 1;
          } else if (s.unreadCount > 0) {
            totalUnread += s.unreadCount;
          }
        }
      } catch (e) { /* silent */ }
    }

    // 2. Fetch sessions by userId (discovers crisis-alert-initiated sessions)
    if (username) {
      try {
        const res = await fetch(
          API_BASE + '/chat/sessions/user/' + encodeURIComponent(username),
          { headers: hdrs }
        );
        if (res.ok) {
          const sessions = await res.json();
          for (const s of sessions) {
            if (seenSessionIds.has(s.sessionId)) continue;
            seenSessionIds.add(s.sessionId);
            if (s.status === 'INVITED') {
              totalUnread += 1;
            } else if (s.unreadCount > 0) {
              totalUnread += s.unreadCount;
            }
          }
        }
      } catch (e) { /* silent */ }
    }

    updateBadge('anon-chat', totalUnread);
  }

  /**
   * Helper: extract initials from full name (e.g. "Kerlsan Acoymo" → "KA").
   */
  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  /**
   * Helper: escape HTML.
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Init Guard ──

  function init() {
    // 1. Read config from the script tag
    const scriptTag = document.querySelector('script[data-page]');
    const currentPage = scriptTag ? scriptTag.getAttribute('data-page') : '';
    const allowedRolesAttr = scriptTag ? scriptTag.getAttribute('data-allowed-roles') : 'ALL';
    const allowedRoles = (!allowedRolesAttr || allowedRolesAttr === 'ALL')
      ? null  // null = any authenticated user
      : allowedRolesAttr.split(',').map(r => r.trim().toUpperCase());

    // 2. Check session exists
    const token = getToken();
    const role = getRole();

    if (!token || !role) {
      clearSession();
      window.location.href = 'landing.html';
      return;
    }

    // 3. Check role-based page access
    if (allowedRoles && !allowedRoles.includes(role)) {
      showAccessDenied();
      return;
    }

    // 4. Render dynamic navbar
    renderNavbar(currentPage);

    // 5. Background token validation (non-blocking)
    validateTokenAsync(token);
  }

  /**
   * Asynchronously validate the token with the server.
   * If invalid, redirect to login.
   */
  async function validateTokenAsync(token) {
    try {
      const res = await fetch(`${API}/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) {
        // Server might be temporarily reloading or under maintenance — do not kick user out
        return;
      }
      const data = await res.json();
      if (data && data.valid === false) {
        // Double check: if this is a known seeded account session, do not kick out
        const username = getUsername();
        if (username && (token === 'session-seed-' + username || token.startsWith('session-seed-'))) {
          return;
        }
        clearSession();
        window.location.href = 'landing.html';
      }
    } catch (e) {
      // Server unreachable — don't kick the user out for network issues
      console.warn('Token validation failed (network):', e);
    }
  }

  // Run guard on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  return {
    getToken,
    getUsername,
    getRole,
    getFullName,
    authHeaders,
    authFetch,
    logout,
    clearSession,
    renderNavbar,
    refreshBadges
  };
})();
