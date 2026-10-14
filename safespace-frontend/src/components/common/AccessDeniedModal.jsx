import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AccessDeniedModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { role, logout, setAccessDeniedOpen } = useAuth();

  if (!isOpen) return null;

  const handleClose = () => {
    if (onClose) onClose();
    else setAccessDeniedOpen(false);
  };

  const handleGoBack = () => {
    handleClose();
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleLogout = async () => {
    handleClose();
    await logout();
    navigate('/login');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17,24,39,0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '1.5rem',
        padding: '2.5rem',
        maxWidth: '420px',
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          width: '4rem',
          height: '4rem',
          borderRadius: '50%',
          background: '#fee2e2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          color: '#dc2626',
          marginBottom: '1rem'
        }}>
          <i className="fas fa-shield-halved"></i>
        </div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', marginBottom: '0.5rem' }}>
          Access Denied
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: '1.4' }}>
          Your role <strong style={{ color: '#dc2626' }}>{role || 'UNKNOWN'}</strong> does not have permission to access this area.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button 
            type="button"
            onClick={handleGoBack}
            style={{
              padding: '0.65rem 1.2rem',
              borderRadius: '0.75rem',
              border: '1.5px solid #E0D7C6',
              background: '#fff',
              color: '#161F36',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            Go Back
          </button>
          <button 
            type="button"
            onClick={handleLogout}
            style={{
              padding: '0.65rem 1.2rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: '#161F36',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 3px 10px rgba(22,31,54,0.3)'
            }}
          >
            Switch Account
          </button>
        </div>
      </div>
    </div>
  );
}
