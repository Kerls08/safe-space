import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/maintenance.css';

export default function MaintenanceBottomNav() {
  const { role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isMaintPage = location.pathname === '/system-maintenance' || location.pathname === '/credential-manager';
  const isMaint = role === 'MAINTENANCE' || (role === 'ADMIN' && isMaintPage);

  if (!isMaint) return null;

  const currentTab = isMaintPage ? (searchParams.get('tab') || 'controls') : null;

  const navItems = [
    { id: 'controls', param: '', label: 'Overview', icon: 'fas fa-server', btnId: 'btnTabControls', title: 'Overview & Maintenance' },
    { id: 'users', param: 'users', label: 'User Mgmt', icon: 'fas fa-users-gear', btnId: 'btnTabUsers', title: 'User Management & Accounts' },
    { id: 'hygiene', param: 'hygiene', label: 'Data Hygiene', icon: 'fas fa-broom', btnId: 'btnTabHygiene', title: 'Safe Data Hygiene' },
    { id: 'audit', param: 'audit', label: 'Audit Trail', icon: 'fas fa-shield-halved', btnId: 'btnTabAudit', title: 'Security & System Audit Trail' }
  ];

  const handleNav = (param) => {
    if (location.pathname === '/system-maintenance') {
      if (param) {
        setSearchParams({ tab: param }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    } else {
      navigate(param ? `/system-maintenance?tab=${param}` : '/system-maintenance');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="maint-bottom-nav" id="maintBottomNav" aria-label="Maintenance Navigation">
      <div className="maint-bottom-nav-inner">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`maint-nav-btn ${isActive ? 'active' : ''}`}
              id={item.btnId}
              onClick={() => handleNav(item.param)}
              title={item.title}
            >
              <i className={item.icon}></i>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
