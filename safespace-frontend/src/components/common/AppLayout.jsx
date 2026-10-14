import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import SystemBanner from './SystemBanner';
import StudentBottomNav from './StudentBottomNav';
import ProfessionalBottomNav from './ProfessionalBottomNav';
import MaintenanceBottomNav from './MaintenanceBottomNav';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { role } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isMaintPage = location.pathname === '/system-maintenance' || location.pathname === '/credential-manager';
    const isPro = (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN' || role === 'ADMIN') && !isMaintPage;
    const isStudent = role === 'STUDENT';
    const isMaint = role === 'MAINTENANCE' || (role === 'ADMIN' && isMaintPage);

    if (isPro) {
      document.body.classList.add('has-pro-bottom-nav');
    } else {
      document.body.classList.remove('has-pro-bottom-nav');
    }

    if (isStudent) {
      document.body.classList.add('has-student-bottom-nav');
    } else {
      document.body.classList.remove('has-student-bottom-nav');
    }

    if (isMaint) {
      document.body.classList.add('has-maint-bottom-nav');
    } else {
      document.body.classList.remove('has-maint-bottom-nav');
    }

    return () => {
      document.body.classList.remove('has-pro-bottom-nav');
      document.body.classList.remove('has-student-bottom-nav');
      document.body.classList.remove('has-maint-bottom-nav');
    };
  }, [role, location.pathname]);

  return (
    <div className="app-container">
      <Navbar />
      <SystemBanner />
      <main className="app-main-content">
        <Outlet />
      </main>
      <StudentBottomNav />
      <ProfessionalBottomNav />
      <MaintenanceBottomNav />
    </div>
  );
}
