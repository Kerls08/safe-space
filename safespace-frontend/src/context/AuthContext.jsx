import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  getToken, 
  getUsername, 
  getRole, 
  getFullName, 
  saveSession, 
  clearSessionStorage, 
  authApi,
  chatApi 
} from '../services/api';

const AuthContext = createContext(null);

export const roleBadgeColors = {
  STUDENT: { bg: '#E8EFF4', color: '#161F36', border: '#BACBD8', label: 'STUDENT' },
  PROFESSIONAL: { bg: '#F2EDE2', color: '#161F36', border: '#E0D7C6', label: 'PROFESSIONAL' },
  SUPER_ADMIN: { bg: '#F2EDE2', color: '#161F36', border: '#E0D7C6', label: 'PROFESSIONAL' },
  MAINTENANCE: { bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD', label: 'MAINTENANCE (IT)' },
  ADMIN: { bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE', label: 'ADMINISTRATOR' }
};

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken());
  const [username, setUsername] = useState(() => getUsername());
  const [role, setRole] = useState(() => getRole());
  const [fullName, setFullName] = useState(() => getFullName());
  const [accessDeniedOpen, setAccessDeniedOpen] = useState(false);
  const [badges, setBadges] = useState({
    'anon-chat': 0,
    'crisis-alerts': 0,
    'pro-dashboard': 0,
    'maint-users': 0,
    'maint-audit': 0
  });

  const isAuthenticated = Boolean(token && role);

  const logout = useCallback(async () => {
    const curToken = token;
    const curUsername = username;
    const curRole = role;
    if (curUsername && (curRole === 'PROFESSIONAL' || curRole === 'SUPER_ADMIN')) {
      chatApi.recordOffline(curUsername).catch(() => {});
    }
    await authApi.logout(curToken);
    setToken(null);
    setUsername(null);
    setRole(null);
    setFullName(null);
    clearSessionStorage();
  }, [token, username, role]);

  const login = useCallback((data) => {
    saveSession(data);
    setToken(data.token);
    setUsername(data.username);
    setRole(data.role);
    setFullName(data.fullName);
  }, []);

  // Check token validity on boot
  useEffect(() => {
    if (token) {
      authApi.validateToken(token).then((res) => {
        if (res && res.valid === false) {
          if (!token.startsWith('session-seed-')) {
            logout();
          }
        }
      });
    }
  }, [token, logout]);

  // Event listeners for global auth errors
  useEffect(() => {
    const handleExpired = () => logout();
    const handleDenied = () => setAccessDeniedOpen(true);

    window.addEventListener('safespace:auth_expired', handleExpired);
    window.addEventListener('safespace:access_denied', handleDenied);

    return () => {
      window.removeEventListener('safespace:auth_expired', handleExpired);
      window.removeEventListener('safespace:access_denied', handleDenied);
    };
  }, [logout]);

  const updateBadge = useCallback((id, count) => {
    setBadges((prev) => ({ ...prev, [id]: count }));
  }, []);

  const badgeInfo = roleBadgeColors[role] || roleBadgeColors.STUDENT;

  const value = {
    token,
    username,
    role,
    fullName,
    isAuthenticated,
    badgeInfo,
    badges,
    updateBadge,
    login,
    logout,
    accessDeniedOpen,
    setAccessDeniedOpen
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
