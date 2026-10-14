import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/common/AppLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Phase 1 Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

// Phase 2 Pages
import RantBoard from './pages/RantBoard';
import AnonChat from './pages/AnonChat';
import Profile from './pages/Profile';

// Phase 3 Pages (Professional Hub)
import ProDashboard from './pages/ProDashboard';
import CrisisAlerts from './pages/CrisisAlerts';
import ResourceManager from './pages/ResourceManager';
import Colleagues from './pages/Colleagues';

// Phase 4 Pages (IT & Maintenance)
import SystemMaintenance from './pages/SystemMaintenance';
import CredentialManager from './pages/CredentialManager';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/landing.html" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login.html" element={<Navigate to="/login" replace />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register.html" element={<Navigate to="/register" replace />} />

          {/* Legacy .html redirects for protected pages */}
          <Route path="/rant-board.html" element={<Navigate to="/rant-board" replace />} />
          <Route path="/anon-chat.html" element={<Navigate to="/anon-chat" replace />} />
          <Route path="/profile.html" element={<Navigate to="/profile" replace />} />
          <Route path="/pro-dashboard.html" element={<Navigate to="/pro-dashboard" replace />} />
          <Route path="/crisis-alerts.html" element={<Navigate to="/crisis-alerts" replace />} />
          <Route path="/resource-manager.html" element={<Navigate to="/resource-manager" replace />} />
          <Route path="/colleagues.html" element={<Navigate to="/colleagues" replace />} />
          <Route path="/system-maintenance.html" element={<Navigate to="/system-maintenance" replace />} />
          <Route path="/credential-manager.html" element={<Navigate to="/credential-manager" replace />} />

          {/* Authenticated Application Layout */}
          <Route element={<AppLayout />}>
            {/* Student & Shared Protected Routes */}
            <Route element={<ProtectedRoute allowedRoles={['STUDENT', 'PROFESSIONAL', 'SUPER_ADMIN', 'ADMIN']} />}>
              <Route path="/rant-board" element={<RantBoard />} />
              <Route path="/anon-chat" element={<AnonChat />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['STUDENT', 'PROFESSIONAL', 'SUPER_ADMIN', 'MAINTENANCE', 'ADMIN']} />}>
              <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Professional Hub Routes */}
            <Route element={<ProtectedRoute allowedRoles={['PROFESSIONAL', 'SUPER_ADMIN', 'ADMIN']} />}>
              <Route path="/pro-dashboard" element={<ProDashboard />} />
              <Route path="/crisis-alerts" element={<CrisisAlerts />} />
              <Route path="/resource-manager" element={<ResourceManager />} />
              <Route path="/colleagues" element={<Colleagues />} />
            </Route>

            {/* IT & Maintenance Routes */}
            <Route element={<ProtectedRoute allowedRoles={['MAINTENANCE', 'ADMIN']} />}>
              <Route path="/system-maintenance" element={<SystemMaintenance />} />
              <Route path="/credential-manager" element={<CredentialManager />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
