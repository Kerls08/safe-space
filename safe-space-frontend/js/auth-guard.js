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
  const API = 'http://localhost:8080/api/auth';

  // ── Session Data ──
  const getToken    = () => localStorage.getItem('ss_token');
  const getUsername = () => localStorage.getItem('ss_username');
  const getRole     = () => localStorage.getItem('ss_role');
  const getFullName = () => localStorage.getItem('ss_fullName');

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
      clearSession();
      window.location.href = 'login.html';
      throw new Error('Session expired. Redirecting to login.');
    }

    if (res.status === 403) {
      showAccessDenied();
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
    window.location.href = 'login.html';
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
          <button onclick="history.back()" style="padding:0.65rem 1.2rem;border-radius:0.75rem;border:1.5px solid #e5e7eb;background:#fff;color:#374151;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">Go Back</button>
          <button onclick="SafeSpaceAuth.logout()" style="padding:0.65rem 1.2rem;border-radius:0.75rem;border:none;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;">Switch Account</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // ── Navigation Configuration ──

  const NAV_CONFIG = {
    STUDENT: [
      { name: 'Rant Board', href: 'rant-board.html', icon: 'fas fa-comment-dots', id: 'rant-board' },
      { name: 'Chat', href: 'anon-chat.html', icon: 'fas fa-comments', id: 'anon-chat' },
      { name: 'Profile', href: 'profile.html', icon: 'fas fa-user-circle', id: 'profile' }
    ],
    PROFESSIONAL: [
      { name: 'Rant Board', href: 'rant-board.html', icon: 'fas fa-comment-dots', id: 'rant-board' },
      { name: 'Chat', href: 'anon-chat.html', icon: 'fas fa-comments', id: 'anon-chat' },
      { name: 'Dashboard', href: 'pro-dashboard.html', icon: 'fas fa-chart-line', id: 'pro-dashboard' },
      { name: 'Crisis Alerts', href: 'crisis-alerts.html', icon: 'fas fa-bell', id: 'crisis-alerts' },
      { name: 'Resources', href: 'resource-manager.html', icon: 'fas fa-hand-holding-heart', id: 'resource-manager' },
      { name: 'Credentials', href: 'credential-manager.html', icon: 'fas fa-users-gear', id: 'credential-manager' },
      { name: 'Profile', href: 'profile.html', icon: 'fas fa-user-circle', id: 'profile' }
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
      STUDENT: { bg: '#dbeafe', color: '#1d4ed8' },
      PROFESSIONAL: { bg: '#ede9fe', color: '#7c3aed' }
    };
    const badge = roleBadgeColors[role] || roleBadgeColors.STUDENT;

    nav.innerHTML = `
      <div class="navbar-inner">
        <a href="rant-board.html" class="navbar-brand">
          <i class="fas fa-shield-heart"></i>
          Safe<span>Space</span>
        </a>
        <div class="navbar-menu" id="navMenu">
          ${links.map(l =>
            `<a href="${l.href}" class="navbar-link${l.id === activePage ? ' active' : ''}" data-nav-id="${l.id}" style="display:inline-flex;align-items:center;gap:0.3rem;">
              ${l.name}<span class="nav-badge" id="badge-${l.id}" style="display:none;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#dc2626;color:#fff;font-size:0.55rem;font-weight:800;line-height:16px;text-align:center;box-shadow:0 1px 4px rgba(220,38,38,0.3);flex-shrink:0;"></span>
            </a>`
          ).join('')}
          <div class="navbar-actions" style="display:flex;align-items:center;gap:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;background:${badge.bg};color:${badge.color};">${role}</span>
              <span style="font-size:0.8rem;font-weight:600;color:var(--dark,#111827);">${escapeHtml(fullName || '')}</span>
            </div>
            <button id="authLogoutBtn" onclick="SafeSpaceAuth.logout()" style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.4rem 0.8rem;border-radius:0.5rem;border:1.5px solid #e5e7eb;background:#fff;color:#475569;font-size:0.75rem;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all 0.2s ease;">
              <i class="fas fa-right-from-bracket"></i> Logout
            </button>
          </div>
        </div>
        <button id="navToggle" class="navbar-toggle" aria-label="Open navigation" onclick="document.getElementById('navMenu').classList.toggle('open')">
          <span></span><span></span><span></span>
        </button>
      </div>
    `;

    // Start notification badge polling
    pollNavBadges();
    _badgeInterval = setInterval(pollNavBadges, 10000);
  }

  let _badgeInterval = null;

  /**
   * Update a navbar badge count.
   */
  function updateBadge(navId, count) {
    const el = document.getElementById('badge-' + navId);
    if (!el) return;
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
   * PROFESSIONAL:
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

    if (role === 'PROFESSIONAL') {
      await pollProfessionalBadges();
    } else {
      await pollStudentBadges();
    }
  }

  /**
   * Professional badge polling:
   *  - Chat: waiting sessions + unread messages in active sessions
   *  - Alerts: active alert count
   *  - Dashboard: flagged posts + waiting chats
   */
  async function pollProfessionalBadges() {
    const username = getUsername();
    const token = getToken();
    if (!token || !username) return;

    const hdrs = { 'Authorization': 'Bearer ' + token };

    // ── Chat badge: waiting + unread from active ──
    try {
      let waitingCount = 0;
      let unreadCount = 0;

      // 1. Get global stats for waiting count (lightweight, reliable)
      const statsRes = await fetch('http://localhost:8080/api/chat/stats', { headers: hdrs });
      if (statsRes.ok) {
        const stats = await statsRes.json();
        waitingCount = stats.waitingSessions || 0;
      }

      // 2. Get professional's own queue for unread in active sessions
      const queueRes = await fetch('http://localhost:8080/api/chat/sessions/professional/' + encodeURIComponent(username), { headers: hdrs });
      if (queueRes.ok) {
        const queue = await queueRes.json();
        for (const s of (queue.active || [])) {
          if (s.unreadCount > 0) unreadCount += s.unreadCount;
        }
      }

      updateBadge('anon-chat', waitingCount + unreadCount);
    } catch (e) { console.warn('[Badge] Chat poll error:', e.message); }

    // ── Alerts badge ──
    try {
      const res = await fetch('http://localhost:8080/api/alerts/stats', { headers: hdrs });
      if (res.ok) {
        const data = await res.json();
        updateBadge('crisis-alerts', data.active || 0);
      }
    } catch (e) { console.warn('[Badge] Alerts poll error:', e.message); }

    // ── Dashboard badge ──
    try {
      const res = await fetch('http://localhost:8080/api/dashboard/overview', { headers: hdrs });
      if (res.ok) {
        const data = await res.json();
        const count = (data.flaggedPosts || 0) + (data.chatSessionsWaiting || 0);
        updateBadge('pro-dashboard', count);
      }
    } catch (e) { console.warn('[Badge] Dashboard poll error:', e.message); }
  }

  /**
   * Student badge polling:
   *  - Chat: total unread messages across the student's own sessions
   */
  async function pollStudentBadges() {
    const pseudonyms = JSON.parse(localStorage.getItem('safespace_pseudonyms') || '[]');
    const token = getToken();
    if (!token || pseudonyms.length === 0) {
      updateBadge('anon-chat', 0);
      return;
    }

    const hdrs = { 'Authorization': 'Bearer ' + token };
    let totalUnread = 0;

    // Fetch sessions for each stored pseudonym
    for (const pseudonym of pseudonyms) {
      try {
        const res = await fetch(
          'http://localhost:8080/api/chat/sessions/student/' + encodeURIComponent(pseudonym),
          { headers: hdrs }
        );
        if (!res.ok) continue;
        const sessions = await res.json();
        for (const s of sessions) {
          // Only count unread in ACTIVE sessions (professional accepted & sent messages)
          if (s.status === 'ACTIVE' && s.unreadCount > 0) {
            totalUnread += s.unreadCount;
          }
        }
      } catch (e) { /* silent — might not have sessions yet */ }
    }

    updateBadge('anon-chat', totalUnread);
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
      window.location.href = 'login.html';
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
      const data = await res.json();
      if (!data.valid) {
        clearSession();
        window.location.href = 'login.html';
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
