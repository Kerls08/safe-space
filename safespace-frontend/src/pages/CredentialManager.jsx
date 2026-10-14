import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * In vanilla SafeSpace, credential-manager.html immediately executes:
 * window.location.replace('system-maintenance.html?tab=users');
 * This Navigate component provides a 100% mirror of that behavior.
 */
export default function CredentialManager() {
  return <Navigate to="/system-maintenance?tab=users" replace />;
}

