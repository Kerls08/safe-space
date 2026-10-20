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

  if (!status) return null;

  const isMaintenanceActive = status.maintenance?.active && role !== 'MAINTENANCE' && role !== 'ADMIN';
  const isBroadcastActive = status.broadcast?.active;

  if (isMaintenanceActive) {
    return (
      <div 
        id="systemBroadcastBanner"
        style={{
          position: 'fixed',
          top: '56px',
          left: 0,
          right: 0,
          zIndex: 999,
          background: '#FFFBEB',
          color: '#92400E',
          padding: '0.65rem 1.25rem',
          borderBottom: '1px solid #FDE68A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(24, 42, 52, 0.06)'
        }}
      >
        <i className="fas fa-triangle-exclamation" style={{ color: '#D97706', fontSize: '1rem' }}></i>
        <span>
          <strong>Maintenance Notice:</strong> {status.maintenance.message || 'Scheduled platform maintenance is currently active.'}
        </span>
      </div>
    );
  }

  if (isBroadcastActive) {
    const type = (status.broadcast.type || 'INFO').toUpperCase();
    let bg = '#F4F7F7', text = '#243E4C', border = '#E1E8EB', icon = 'fas fa-bullhorn';
    if (type === 'WARNING') {
      bg = '#FFFBEB'; text = '#92400E'; border = '#FDE68A'; icon = 'fas fa-triangle-exclamation';
    } else if (type === 'CRITICAL') {
      bg = '#FEF2F2'; text = '#991B1B'; border = '#FECACA'; icon = 'fas fa-circle-exclamation';
    }

    return (
      <div 
        id="systemBroadcastBanner"
        style={{
          position: 'fixed',
          top: '56px',
          left: 0,
          right: 0,
          zIndex: 999,
          background: bg,
          color: text,
          padding: '0.6rem 1.25rem',
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          fontSize: '0.84rem',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(24, 42, 52, 0.06)'
        }}
      >
        <i className={icon} style={{ fontSize: '0.95rem' }}></i>
        <span>{status.broadcast.message}</span>
      </div>
    );
  }

  return null;
}
