/**
 * Safe Space: Centralized API Client & Service Layer
 */

const getApiBase = () => {
  if (typeof window === 'undefined') return 'http://localhost:8080/api';
  if (import.meta.env?.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (window.SAFE_SPACE_API_URL) return window.SAFE_SPACE_API_URL;
  
  const host = window.location.hostname || '';
  const isLocal = window.location.protocol === 'file:' ||
                  host === 'localhost' ||
                  host === '127.0.0.1' ||
                  host.startsWith('192.168.') ||
                  host.startsWith('10.') ||
                  host.startsWith('172.') ||
                  window.location.port === '5173' ||
                  window.location.port === '5500';

  return isLocal ? `http://${host || 'localhost'}:8080/api` : 'https://safespace-backend-ws0m.onrender.com/api';
};

export const API_BASE = getApiBase();
export const AUTH_API = `${API_BASE}/auth`;

export const getToken = () => sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
export const getUsername = () => sessionStorage.getItem('ss_username') || localStorage.getItem('ss_username');
export const getRole = () => sessionStorage.getItem('ss_role') || localStorage.getItem('ss_role');
export const getFullName = () => sessionStorage.getItem('ss_fullName') || localStorage.getItem('ss_fullName');

export function authHeaders() {
  const token = getToken();
  return token 
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * Authenticated fetch wrapper. Auto-attaches Bearer token.
 * Triggers session clear and redirect on 401 if not silent.
 */
export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!headers['Content-Type'] && options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    if (!options.silent) {
      clearSessionStorage();
      window.dispatchEvent(new CustomEvent('safespace:auth_expired'));
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 403) {
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent('safespace:access_denied'));
    }
    throw new Error('Access denied.');
  }

  return res;
}

export function saveSession({ token, username, role, fullName }) {
  if (token) {
    sessionStorage.setItem('ss_token', token);
    localStorage.setItem('ss_token', token);
  }
  if (username) {
    sessionStorage.setItem('ss_username', username);
    localStorage.setItem('ss_username', username);
  }
  if (role) {
    sessionStorage.setItem('ss_role', role);
    localStorage.setItem('ss_role', role);
  }
  if (fullName) {
    sessionStorage.setItem('ss_fullName', fullName);
    localStorage.setItem('ss_fullName', fullName);
  }
}

export function clearSessionStorage() {
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

/*  Auth API Calls  */
export const authApi = {
  async login(username, password) {
    const res = await fetch(`${AUTH_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Login failed');
      err.status = res.status;
      err.locked = data.locked === true || res.status === 403 || res.status === 423;
      err.secondsRemaining = data.secondsRemaining || 0;
      throw err;
    }
    return data;
  },

  async selfRegister(registrationData) {
    const res = await fetch(`${AUTH_API}/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  },

  async logout(token) {
    if (token) {
      try {
        await fetch(`${AUTH_API}/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
      } catch (e) { /* ignore network error on logout */ }
    }
    clearSessionStorage();
  },

  async validateToken(token) {
    try {
      const res = await fetch(`${AUTH_API}/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (!res.ok) return { valid: false };
      return await res.json();
    } catch (e) {
      return { valid: true, networkError: true };
    }
  },

  async changePassword(loginToken, username, currentPassword, newPassword) {
    const res = await fetch(`${AUTH_API}/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginToken}`
      },
      body: JSON.stringify({ username, currentPassword, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  /* Forgot Password Flow */
  async forgotPasswordLookup(identifier) {
    const res = await fetch(`${AUTH_API}/forgot-password/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No account found matching this ID.');
    return data;
  },

  async forgotPasswordSendOtp(identifier) {
    const res = await fetch(`${AUTH_API}/forgot-password/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, method: 'EMAIL' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to dispatch verification code.');
    return data;
  },

  async forgotPasswordVerifyOtp(identifier, otpCode) {
    const res = await fetch(`${AUTH_API}/forgot-password/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, otpCode })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invalid verification code.');
    return data;
  },

  async forgotPasswordReset(identifier, resetToken, newPassword, confirmPassword) {
    const res = await fetch(`${AUTH_API}/forgot-password/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, resetToken, newPassword, confirmPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset password.');
    return data;
  }
};

/*  System Status API  */
export const systemApi = {
  async getStatus() {
    try {
      const res = await fetch(`${API_BASE}/admin/maintenance/status`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
};

/*  Posts & Rant Board API  */
export const postsApi = {
  async getPosts({ page = 0, size = 15, emotion = 'ALL', sort = 'newest' } = {}) {
    let url = `${API_BASE}/posts?page=${page}&size=${size}`;
    if (emotion && emotion !== 'ALL') url += `&emotion=${encodeURIComponent(emotion)}`;
    if (sort) url += `&sort=${encodeURIComponent(sort)}`;
    const res = await authFetch(url);
    if (!res.ok) throw new Error('Failed to load posts');
    return await res.json();
  },

  async createPost({ content, emotionTag, energyScore, pseudonym }) {
    const res = await authFetch(`${API_BASE}/posts`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        emotionTag,
        energyScore: parseInt(energyScore, 10) || 5,
        pseudonym
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to submit post');
    return data;
  },

  async reactPost(postId, reactionType) {
    const res = await authFetch(`${API_BASE}/posts/${postId}/react`, {
      method: 'POST',
      body: JSON.stringify({ type: reactionType })
    });
    if (!res.ok) throw new Error('Failed to react to post');
    return await res.json().catch(() => ({}));
  },

  async getComments(postId) {
    const res = await authFetch(`${API_BASE}/posts/${postId}/comments`);
    if (!res.ok) throw new Error('Failed to load comments');
    return await res.json();
  },

  async addComment(postId, { content, pseudonym }) {
    const res = await authFetch(`${API_BASE}/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, pseudonym })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add comment');
    return data;
  },

  async flagPost(postId, reason) {
    const res = await authFetch(`${API_BASE}/posts/${postId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    return await res.json().catch(() => ({}));
  },

  async getMyPosts(filter = 'ALL') {
    const query = filter && filter !== 'ALL' ? `?filter=${encodeURIComponent(filter)}` : '';
    const res = await authFetch(`${API_BASE}/posts/mine${query}`);
    if (!res.ok) return [];
    return await res.json();
  },

  async archivePost(postId) {
    const res = await authFetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/archive`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to archive post');
    return data;
  },

  async unarchivePost(postId) {
    const res = await authFetch(`${API_BASE}/posts/${encodeURIComponent(postId)}/unarchive`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to restore post');
    return data;
  },

  async deletePost(postId) {
    const res = await authFetch(`${API_BASE}/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete post');
    return data;
  },

  async getResources() {
    try {
      const res = await authFetch(`${API_BASE}/resources`, { silent: true });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  },

  async getCrisisResources() {
    try {
      const res = await authFetch(`${API_BASE}/resources/crisis`, { silent: true });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  }
};

/*  Anonymous Chat API  */
export const chatApi = {
  async createSession({ pseudonym, studentPseudonym, topic, emotionTag, energyScore, studentUserId, userId, forceNew }) {
    const res = await authFetch(`${API_BASE}/chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        pseudonym: pseudonym || studentPseudonym,
        topic,
        emotionTag,
        energyScore: energyScore !== undefined ? parseInt(energyScore, 10) : 5,
        studentUserId: studentUserId || userId,
        forceNew: Boolean(forceNew)
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to create chat session');
    return data;
  },

  async getStudentSessions(pseudonym) {
    const res = await authFetch(`${API_BASE}/chat/sessions/student/${encodeURIComponent(pseudonym)}`);
    if (!res.ok) return [];
    return await res.json();
  },

  async getUserSessions(username) {
    const res = await authFetch(`${API_BASE}/chat/sessions/user/${encodeURIComponent(username)}`);
    if (!res.ok) return [];
    return await res.json();
  },

  async getProfessionalSessions(username) {
    const res = await authFetch(`${API_BASE}/chat/sessions/professional/${encodeURIComponent(username)}`);
    if (!res.ok) return { active: [], waiting: [], invited: [] };
    return await res.json();
  },

  async getSession(sessionId) {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}`);
    if (!res.ok) throw new Error('Session not found');
    return await res.json();
  },

  async getMessages(sessionId, viewer) {
    let url = `${API_BASE}/chat/sessions/${sessionId}/messages`;
    if (viewer) url += `?viewer=${encodeURIComponent(viewer)}`;
    const res = await authFetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to fetch messages (${res.status})`);
    }
    return await res.json();
  },

  async sendMessage(sessionId, { content, senderType, senderName }) {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        senderType,
        senderName
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data;
  },

  async acceptSession(sessionId, professionalId, professionalName = 'Campus Counselor') {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}/accept`, {
      method: 'PUT',
      body: JSON.stringify({
        professionalId,
        professionalName
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to accept session');
    return data;
  },

  async acceptInvite(sessionId) {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}/accept-invite`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');
    return data;
  },

  async declineInvite(sessionId) {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}/decline-invite`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to decline invitation');
    return data;
  },

  async closeSession(sessionId, closedBy = 'student') {
    const res = await authFetch(`${API_BASE}/chat/sessions/${sessionId}/close`, {
      method: 'PUT',
      body: JSON.stringify({ closedBy })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to close session');
    return data;
  },

  async endSession(sessionId, closedBy = 'student') {
    return this.closeSession(sessionId, closedBy);
  },

  async deleteSession(sessionId, pseudonym) {
    let url = `${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}`;
    if (pseudonym) url += `?pseudonym=${encodeURIComponent(pseudonym)}`;
    const res = await authFetch(url, {
      method: 'DELETE'
    });
    if (!res.ok && res.status !== 404) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete session');
    }
    return true;
  },

  async heartbeat(professionalId) {
    if (!professionalId) return;
    try {
      await authFetch(`${API_BASE}/chat/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ professionalId }),
        silent: true
      });
    } catch (e) { /* ignore */ }
  },

  async recordOffline(professionalId) {
    if (!professionalId) return;
    try {
      await authFetch(`${API_BASE}/chat/offline`, {
        method: 'POST',
        body: JSON.stringify({ professionalId }),
        silent: true
      });
    } catch (e) { /* ignore */ }
  },

  async studentHeartbeat(sessionId) {
    if (!sessionId) return;
    try {
      await authFetch(`${API_BASE}/chat/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
        silent: true
      });
    } catch (e) { /* ignore */ }
  },

  async recordStudentOffline(sessionId) {
    if (!sessionId) return;
    try {
      await authFetch(`${API_BASE}/chat/offline`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
        silent: true
      });
    } catch (e) { /* ignore */ }
  },

  async checkCounselorAvailable(targetProfessionalId) {
    try {
      const res = await authFetch(`${API_BASE}/chat/professional-status`, { silent: true });
      if (!res.ok) return { available: false, count: 0, professionals: [] };
      const data = await res.json();
      const professionals = Array.isArray(data.professionals) ? data.professionals : [];
      if (targetProfessionalId && targetProfessionalId.trim()) {
        const targetClean = targetProfessionalId.trim().toLowerCase();
        const found = professionals.find((p) => p.professionalId && p.professionalId.toLowerCase() === targetClean);
        return {
          available: Boolean(found ? found.online : false),
          count: data.onlineCount || 0,
          professionals
        };
      }
      return {
        available: Boolean(data.anyOnline),
        count: data.onlineCount || 0,
        professionals
      };
    } catch (e) {
      return { available: false, count: 0, professionals: [] };
    }
  }
};

/*  Profile API  */
export const profileApi = {
  async getMe() {
    const res = await authFetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error('Failed to load profile');
    return await res.json();
  },

  async updateProfile(data) {
    const res = await authFetch(`${API_BASE}/auth/me/profile`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Failed to update profile');
    return result;
  }
};

/*  Dashboard API  */
export const dashboardApi = {
  async getOverview() {
    const res = await authFetch(`${API_BASE}/dashboard/overview`);
    if (!res.ok) throw new Error('Failed to load dashboard overview');
    return await res.json();
  },

  async getAlerts() {
    const res = await authFetch(`${API_BASE}/dashboard/alerts`);
    if (!res.ok) throw new Error('Failed to load dashboard alerts');
    return await res.json();
  },

  async getTrends(days = 7) {
    const res = await authFetch(`${API_BASE}/dashboard/trends?days=${days}`);
    if (!res.ok) throw new Error('Failed to load dashboard trends');
    return await res.json();
  },

  async getMonthlyReport(year, month) {
    const res = await authFetch(`${API_BASE}/dashboard/monthly-report?year=${year}&month=${month}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }
};

/*  Crisis Alerts API  */
export const alertsApi = {
  async getStats(silent = false) {
    const res = await authFetch(`${API_BASE}/alerts/stats`, { silent });
    if (!res.ok) throw new Error('Failed to load alerts stats');
    return await res.json();
  },

  async getNeedsAction(silent = false) {
    const res = await authFetch(`${API_BASE}/alerts`, { silent });
    if (!res.ok) throw new Error('Failed to load active alerts');
    return await res.json();
  },

  async getInProgress(silent = false) {
    const res = await authFetch(`${API_BASE}/alerts/in-progress`, { silent });
    if (!res.ok) throw new Error('Failed to load in-progress alerts');
    return await res.json();
  },

  async getHistory(status = 'ALL', silent = false) {
    const query = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await authFetch(`${API_BASE}/alerts/history${query}`, { silent });
    if (!res.ok) throw new Error('Failed to load alert history');
    return await res.json();
  },

  async acknowledge(alertId) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'PUT',
      body: '{}'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to acknowledge alert');
    return data;
  },

  async resolve(alertId, notes = '') {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to resolve alert');
    return data;
  },

  async escalate(alertId, notes = '') {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/escalate`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to escalate alert');
    return data;
  },

  async quickResolveDeclined(alertId) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/quick-resolve-declined`, {
      method: 'PUT'
    });
    if (!res.ok) throw new Error('Failed to quick-resolve declined alert');
    return res;
  },

  async initiateChat(alertId, professionalName, force = false) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ professionalName, force })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reach out');
    return data;
  },

  async resolveCase(pseudonym, notes = '') {
    const res = await authFetch(`${API_BASE}/alerts/resolve-case/${encodeURIComponent(pseudonym)}`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to resolve case');
    return data;
  },

  async acknowledgeCase(pseudonym) {
    const res = await authFetch(`${API_BASE}/alerts/ack-case/${encodeURIComponent(pseudonym)}`, {
      method: 'PUT',
      body: '{}'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to acknowledge case');
    return data;
  },

  async archiveAlert(alertId) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/archive`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to archive alert');
    return data;
  },

  async unarchiveAlert(alertId) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}/unarchive`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to restore alert');
    return data;
  },

  async deleteAlert(alertId) {
    const res = await authFetch(`${API_BASE}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'DELETE'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete alert');
    return data;
  }
};

/*  Resource Manager API  */
export const resourceManagerApi = {
  async getAll() {
    const res = await authFetch(`${API_BASE}/resources/all`);
    if (!res.ok) throw new Error('Failed to load resources');
    return await res.json();
  },

  async getStats() {
    const res = await authFetch(`${API_BASE}/resources/stats`);
    if (!res.ok) throw new Error('Failed to load resource stats');
    return await res.json();
  },

  async create(resourceData) {
    const res = await authFetch(`${API_BASE}/resources`, {
      method: 'POST',
      body: JSON.stringify(resourceData)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to create resource');
    return data;
  },

  async update(id, resourceData) {
    const res = await authFetch(`${API_BASE}/resources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(resourceData)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update resource');
    return data;
  },

  async reactivate(id) {
    const res = await authFetch(`${API_BASE}/resources/${id}/reactivate`, {
      method: 'PUT'
    });
    if (!res.ok) throw new Error('Failed to reactivate resource');
    return true;
  },

  async deactivate(id) {
    const res = await authFetch(`${API_BASE}/resources/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to deactivate resource');
    return true;
  },

  async deletePermanent(id) {
    const res = await authFetch(`${API_BASE}/resources/${id}/permanent`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete resource');
    return true;
  }
};

/*  Colleagues API  */
export const colleaguesApi = {
  async getColleagues() {
    const res = await authFetch(`${API_BASE}/auth/colleagues`);
    if (!res.ok) throw new Error('Failed to load colleagues directory');
    return await res.json();
  },

  async registerColleague(data) {
    const res = await authFetch(`${API_BASE}/auth/register-colleague`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Failed to register colleague');
    return result;
  },

  async transferAdmin(username, relinquishAdmin) {
    const res = await authFetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}/transfer-admin`, {
      method: 'POST',
      body: JSON.stringify({ relinquishAdmin })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Failed to transfer administrative role');
    return result;
  },

  async updateRole(username, role) {
    const res = await authFetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Failed to update role');
    return result;
  },

  async resendWelcome(username) {
    const res = await authFetch(`${API_BASE}/auth/colleagues/${encodeURIComponent(username)}/resend-welcome`, {
      method: 'POST'
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Failed to resend welcome email');
    return result;
  }
};

/*  System Maintenance & Health API  */
export const maintenanceApi = {
  async getStatus() {
    const res = await fetch(`${API_BASE}/admin/maintenance/status`);
    if (!res.ok) throw new Error('Failed to fetch maintenance status');
    return await res.json();
  },

  async getHealth() {
    const res = await authFetch(`${API_BASE}/admin/maintenance/health`);
    if (!res.ok) throw new Error('Could not fetch infrastructure health');
    return await res.json();
  },

  async setMaintenanceMode({ active, message, estimatedEnd }) {
    const res = await authFetch(`${API_BASE}/admin/maintenance/mode`, {
      method: 'POST',
      body: JSON.stringify({ active, message, estimatedEnd })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update maintenance mode');
    return data;
  },

  async setBroadcastBanner({ active, type, message }) {
    const res = await authFetch(`${API_BASE}/admin/maintenance/banner`, {
      method: 'POST',
      body: JSON.stringify({ active, type, message })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update broadcast banner');
    return data;
  },

  async scanDatabaseTrash() {
    const res = await authFetch(`${API_BASE}/admin/maintenance/cleanup/scan`);
    if (!res.ok) throw new Error('Could not scan database trash');
    return await res.json();
  },

  async executeDatabaseCleanup() {
    const res = await authFetch(`${API_BASE}/admin/maintenance/cleanup/execute`, {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Cleanup failed');
    return data;
  },

  async testEmailGateway(email = null) {
    const res = await authFetch(`${API_BASE}/admin/maintenance/test-email`, {
      method: 'POST',
      body: JSON.stringify(email ? { email } : {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Email test failed');
    return data;
  },

  async getAuditLogs() {
    const res = await authFetch(`${API_BASE}/admin/maintenance/audit-logs`);
    if (!res.ok) throw new Error('Could not load audit logs');
    return await res.json();
  },

  getAuditLogsCsvUrl() {
    const token = getToken();
    return `${API_BASE}/admin/maintenance/audit-logs/export-csv${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }
};

/*  User Administration API  */
export const userAdminApi = {
  async getUserStats() {
    const res = await authFetch(`${API_BASE}/auth/stats`);
    if (!res.ok) throw new Error('Could not load user stats');
    return await res.json();
  },

  async getUsers(role = null) {
    if (!role || role === 'ALL') {
      // Backend /api/auth/users defaults to STUDENT unless role specified.
      // Fetch all roles in parallel to populate the complete institutional directory.
      const roles = ['STUDENT', 'PROFESSIONAL', 'SUPER_ADMIN', 'MAINTENANCE'];
      const results = await Promise.all(
        roles.map((r) =>
          authFetch(`${API_BASE}/auth/users?role=${r}`)
            .then((res) => (res.ok ? res.json() : []))
            .catch(() => [])
        )
      );
      const map = new Map();
      results.flat().forEach((u) => {
        if (u && u.username) map.set(u.username, u);
      });
      return Array.from(map.values());
    }
    const res = await authFetch(`${API_BASE}/auth/users?role=${encodeURIComponent(role)}`);
    if (!res.ok) throw new Error('Could not load user directory');
    return await res.json();
  },

  async toggleUserStatus(username) {
    const res = await authFetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}/toggle`, {
      method: 'PUT'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to toggle user status');
    return data;
  },

  async resetUserPassword(username) {
    const res = await authFetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}/reset`, {
      method: 'POST'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  },

  async deleteUser(username) {
    const res = await authFetch(`${API_BASE}/auth/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete user');
    return data;
  },

  async createUser({ institutionalId, fullName, email, role, department }) {
    const res = await authFetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ institutionalId, fullName, email, role, department })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return data;
  },

  async importFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/auth/file-import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Import failed');
    return data;
  },

  getImportTemplateUrl(format = 'xlsx') {
    const token = getToken();
    return `${API_BASE}/auth/import-template?format=${encodeURIComponent(format)}&token=${encodeURIComponent(token || '')}`;
  }
};



