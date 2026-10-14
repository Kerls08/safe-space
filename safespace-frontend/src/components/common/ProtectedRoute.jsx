import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AccessDeniedModal from './AccessDeniedModal';

export default function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, role, accessDeniedOpen, setAccessDeniedOpen } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    return (
      <>
        <AccessDeniedModal isOpen={true} onClose={() => setAccessDeniedOpen(false)} />
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#6b7280' }}>
          <h3>Permission restricted</h3>
        </div>
      </>
    );
  }

  return (
    <>
      <Outlet />
      <AccessDeniedModal isOpen={accessDeniedOpen} onClose={() => setAccessDeniedOpen(false)} />
    </>
  );
}
