import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function StudentBottomNav() {
  const { role, badges, updateBadge } = useAuth();
  const location = useLocation();

  if (role !== 'STUDENT') return null;

  const links = [
    { name: 'Rant Board', href: '/rant-board', icon: 'fas fa-comment-dots', id: 'rant-board', title: 'Anonymous Rant Board' },
    { name: 'Chat', href: '/anon-chat', icon: 'fas fa-comments', id: 'anon-chat', badgeKey: 'anon-chat', title: 'Anonymous Support Chat' }
  ];

  return (
    <nav className="student-bottom-nav" id="studentBottomNav" aria-label="Student Navigation">
      <div className="student-bottom-nav-inner">
        {links.map((l) => {
          const isActive = location.pathname === l.href;
          const badgeCount = !l.badgeKey ? 0 : (badges[l.badgeKey] || 0);

          return (
            <Link
              key={l.id}
              to={l.href}
              className={`student-nav-btn${isActive ? ' active' : ''}`}
              title={l.title}
              onClick={() => {
                if (l.badgeKey) {
                  updateBadge(l.badgeKey, 0);
                }
              }}
            >
              <span className="student-nav-icon-wrap">
                <i className={l.icon}></i>
                {badgeCount > 0 && (
                  <span className="student-nav-badge badge-blue">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              <span className="student-nav-label">{l.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
