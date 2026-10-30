import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { systemApi } from '../../services/api';

export default function SystemBanner() {
  const { role } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      const data = await systemApi.getStatus();
      if (mounted && data) {
        setStatus(data);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const isMaintenanceActive = Boolean(status?.maintenance?.active && role !== 'MAINTENANCE' && role !== 'ADMIN');
  const isBroadcastActive = Boolean(status?.broadcast?.active);
  const isVisible = Boolean(status && (isMaintenanceActive || isBroadcastActive));

  useEffect(() => {
    if (isVisible) {
      document.body.classList.add('has-system-banner');
    } else {
      document.body.classList.remove('has-system-banner');
    }
    return () => {
      document.body.classList.remove('has-system-banner');
    };
  }, [isVisible]);

  if (!status || !isVisible) return null;

  if (isMaintenanceActive) {
    return (
      <div 
        id="systemBroadcastBanner"
        className="system-broadcast-banner banner-maintenance"
      >
        <i className="fas fa-triangle-exclamation banner-icon"></i>
        <span className="banner-text">
          <strong>Maintenance Notice:</strong> {status.maintenance.message || 'Scheduled platform maintenance is currently active.'}
        </span>
      </div>
    );
  }

  if (isBroadcastActive) {
    const type = (status.broadcast.type || 'INFO').toUpperCase();
    let typeClass = 'banner-info';
    let icon = 'fas fa-bullhorn';
    if (type === 'WARNING') {
      typeClass = 'banner-warning';
      icon = 'fas fa-triangle-exclamation';
    } else if (type === 'CRITICAL') {
      typeClass = 'banner-critical';
      icon = 'fas fa-circle-exclamation';
    }

    return (
      <div 
        id="systemBroadcastBanner"
        className={`system-broadcast-banner ${typeClass}`}
      >
        <i className={`${icon} banner-icon`}></i>
        <span className="banner-text">{status.broadcast.message}</span>
      </div>
    );
  }

  return null;
}
