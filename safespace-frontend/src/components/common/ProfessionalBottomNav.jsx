import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProfessionalBottomNav() {
  const { role, badges } = useAuth();
  const location = useLocation();

  const isMaintPage = location.pathname === '/system-maintenance' || location.pathname === '/credential-manager';
  const isPro = (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN' || role === 'ADMIN') && !isMaintPage;

  if (!isPro) return null;

  const proLinks = [
    { name: 'Dashboard', href: '/pro-dashboard', icon: 'fas fa-chart-line', id: 'pro-dashboard', badgeKey: 'pro-dashboard', badgeColor: 'badge-amber', title: 'Psychometrician Dashboard' },
    { name: 'Alerts', href: '/crisis-alerts', icon: 'fas fa-bell', id: 'crisis-alerts', badgeKey: 'crisis-alerts', badgeColor: 'badge-red', title: 'Crisis Alerts' },
    { name: 'Rant Board', href: '/rant-board', icon: 'fas fa-comment-dots', id: 'rant-board', title: 'Student Rant Board' },
    { name: 'Chat', href: '/anon-chat', icon: 'fas fa-comments', id: 'anon-chat', badgeKey: 'anon-chat', badgeColor: 'badge-blue', title: 'Anonymous Support Chat' },
    { name: 'Resources', href: '/resource-manager', icon: 'fas fa-hand-holding-heart', id: 'resource-manager', title: 'Campus Resources' },
    { name: 'Colleagues', href: '/colleagues', icon: 'fas fa-user-doctor', id: 'colleagues', title: 'Counseling Colleagues' }
  ];

  return (
    <nav className="pro-bottom-nav" id="proBottomNav" aria-label="Professional Navigation">
      <div className="pro-bottom-nav-inner">
        {proLinks.map((l) => {
          const isActive = location.pathname === l.href;
          const badgeCount = l.badgeKey ? badges[l.badgeKey] : 0;

          return (
            <Link
              key={l.id}
              to={l.href}
              className={`pro-nav-btn${isActive ? ' active' : ''}`}
              title={l.title}
            >
              <span className="pro-nav-icon-wrap">
                <i className={l.icon}></i>
                {badgeCount > 0 && (
                  <span className={`pro-nav-badge ${l.badgeColor || 'badge-red'}`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              <span>{l.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
