import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PlaceholderPage({ title, phase, icon = 'fas fa-hammer' }) {
  const location = useLocation();
  const { role, fullName } = useAuth();

  return (
    <div style={{
      maxWidth: '800px',
      margin: '2rem auto',
      padding: '2.5rem 1.5rem',
      textAlign: 'center',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div style={{
        width: '4.5rem',
        height: '4.5rem',
        borderRadius: '1.25rem',
        background: 'linear-gradient(135deg, #243E4C 0%, #1A313D 100%)',
        color: '#7E9F9D',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.8rem',
        marginBottom: '1.25rem',
        boxShadow: '0 8px 24px rgba(36, 62, 76, 0.15)'
      }}>
        <i className={icon}></i>
      </div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#243E4C', marginBottom: '0.5rem' }}>
        {title}
      </h1>
      <p style={{ fontSize: '0.9rem', color: '#51646E', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
        This page route (<code>{location.pathname}</code>) is successfully protected and connected to your active session ({fullName} • {role}).
      </p>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '999px',
        background: '#EBF2F3',
        color: '#243E4C',
        fontSize: '0.8rem',
        fontWeight: 600
      }}>
        <i className="fas fa-arrow-right-arrow-left"></i> Scheduled for {phase}
      </div>
    </div>
  );
}
