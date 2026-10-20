import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { colleaguesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard.css';
import '../styles/auth.css';
import '../styles/colleagues.css';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function getColleagueCategory(c) {
  const text = ((c.department || '') + ' ' + (c.fullName || '')).toLowerCase();
  if (text.includes('psychologist') || text.includes('rpsy')) return 'PSYCHOLOGIST';
  return 'PSYCHOMETRICIAN';
}

export default function Colleagues() {
  const { role: userRole, username: currentUsername } = useAuth();
  const isSuperAdminViewer = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  const [allColleagues, setAllColleagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentFilter, setCurrentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [resendingId, setResendingId] = useState(null);

  // Register Modal
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerResult, setRegisterResult] = useState(null);
  const [regForm, setRegForm] = useState({
    accountRole: 'PROFESSIONAL',
    name: '',
    title: 'Psychometrician',
    instId: '',
    email: '',
    dept: 'Guidance & Counseling Center',
    phone: ''
  });

  // Transfer Admin Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState({ username: '', fullName: '' });
  const [transferMode, setTransferMode] = useState('relinquish');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccessMsg, setTransferSuccessMsg] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  const isMountedRef = useRef(true);

  const showCopyToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3500);
  };

  const copyText = (str) => {
    navigator.clipboard
      .writeText(str)
      .then(() => {
        showCopyToast('Copied to clipboard!');
      })
      .catch(() => {
        showCopyToast('Failed to copy');
      });
  };

  const copyAllDetails = (name, id, pw) => {
    const text = `Safe Space Campus Counseling Team Account:\nName: ${name}\nStaff ID / Login ID: ${id}\nTemporary Password: ${pw}\nSign In: ${window.location.origin}/login`;
    copyText(text);
  };

  const loadColleagues = useCallback(async () => {
    setIsSpinning(true);
    setLoading(true);
    setErrorMsg('');
    try {
      const list = await colleaguesApi.getColleagues();
      if (!isMountedRef.current) return;
      setAllColleagues(Array.isArray(list) ? list : []);
    } catch (err) {
      if (!isMountedRef.current) return;
      setErrorMsg(err.message || 'Failed to load colleagues directory');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setTimeout(() => setIsSpinning(false), 400);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadColleagues();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadColleagues]);

  // Metrics
  const total = allColleagues.length;
  let psychometricians = 0;
  let psychologists = 0;
  allColleagues.forEach((c) => {
    const cat = getColleagueCategory(c);
    if (cat === 'PSYCHOLOGIST') psychologists++;
    else psychometricians++;
  });

  // Filter & Search
  let filteredList = allColleagues;
  if (currentFilter !== 'ALL') {
    filteredList = filteredList.filter((c) => getColleagueCategory(c) === currentFilter);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filteredList = filteredList.filter(
      (c) =>
        (c.fullName && c.fullName.toLowerCase().includes(q)) ||
        (c.institutionalId && c.institutionalId.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.department && c.department.toLowerCase().includes(q))
    );
  }

  // Register Modal handlers
  const openRegisterColleagueModal = () => {
    setRegForm({
      accountRole: 'PROFESSIONAL',
      name: '',
      title: 'Psychometrician',
      instId: '',
      email: '',
      dept: 'Guidance & Counseling Center',
      phone: ''
    });
    setRegisterResult(null);
    setRegisterSubmitting(false);
    setRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    setRegisterModalOpen(false);
    setRegisterResult(null);
  };

  const handleAccountRoleChange = (e) => {
    const role = e.target.value;
    setRegForm((prev) => ({
      ...prev,
      accountRole: role,
      title: role === 'SUPER_ADMIN' ? 'Psychometrician' : prev.title
    }));
  };

  const submitRegisterColleague = async () => {
    const name = regForm.name.trim();
    const instId = regForm.instId.trim();
    const email = regForm.email.trim();
    const dept = regForm.dept.trim() || 'Guidance & Counseling Center';
    const phone = regForm.phone.trim();
    const title = regForm.title;
    const accountRole = regForm.accountRole;

    if (!name) {
      showCopyToast("Please enter your colleague's full name.");
      return;
    }
    if (!instId) {
      showCopyToast('Please enter their Campus Staff ID number.');
      return;
    }
    if (!email) {
      showCopyToast('Please enter their work email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showCopyToast('Please enter a valid work email address (e.g. name@ustp.edu.ph).');
      return;
    }

    setRegisterSubmitting(true);
    try {
      const data = await colleaguesApi.registerColleague({
        fullName: name,
        institutionalId: instId,
        email,
        title,
        department: dept,
        phoneNumber: phone,
        role: accountRole
      });
      setRegisterResult(data);
      loadColleagues();
    } catch (err) {
      showCopyToast(err.message || 'Registration failed');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  // Transfer Admin handlers
  const openTransferAdminModal = (username, fullName) => {
    setTransferTarget({ username, fullName });
    setTransferMode('relinquish');
    setTransferSuccessMsg('');
    setTransferSubmitting(false);
    setTransferModalOpen(true);
  };

  const closeTransferModal = () => {
    setTransferModalOpen(false);
    setTransferTarget({ username: '', fullName: '' });
    setTransferSuccessMsg('');
  };

  const submitTransferAdmin = async () => {
    if (!transferTarget.username) return;
    const relinquish = transferMode === 'relinquish';
    setTransferSubmitting(true);

    try {
      const data = await colleaguesApi.transferAdmin(transferTarget.username, relinquish);
      showCopyToast(data.message || 'Admin role transferred successfully');
      setTransferSuccessMsg(data.message || 'Role updated successfully');

      setTimeout(() => {
        closeTransferModal();
        if (relinquish) {
          sessionStorage.setItem('ss_role', 'PROFESSIONAL');
          localStorage.setItem('ss_role', 'PROFESSIONAL');
          window.location.reload();
        } else {
          loadColleagues();
        }
      }, 1600);
    } catch (err) {
      showCopyToast(err.message || 'Role transfer failed');
      setTransferSubmitting(false);
    }
  };

  const revokeAdminColleague = async (username, fullName) => {
    if (
      !window.confirm(
        `Revoke administrator privileges from ${fullName} (@${username})? Their account will return to a standard Professional.`
      )
    ) {
      return;
    }
    try {
      const data = await colleaguesApi.updateRole(username, 'PROFESSIONAL');
      showCopyToast(data.message || 'Administrator privileges revoked successfully');
      loadColleagues();
    } catch (err) {
      showCopyToast(err.message || 'Failed to revoke admin role');
    }
  };

  const resendColleagueEmail = async (username, fullName, staffId) => {
    if (!window.confirm(`Resend a welcome email with new temporary login credentials to ${fullName}?`)) {
      return;
    }
    setResendingId(staffId);
    showCopyToast('Sending welcome email...');
    try {
      const data = await colleaguesApi.resendWelcome(username);
      showCopyToast(`Welcome email resent to ${data.email || 'colleague'}`);
    } catch (err) {
      showCopyToast(err.message || 'Failed to resend email');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="dash-layout">
      <div className="dash-container">
        {/* Cohesive Page Header */}
        <div className="colleagues-page-header">
          <div className="colleagues-header-info">
            <h1>
              <i className="fas fa-user-doctor"></i> Campus Counseling Team &amp; Colleagues
            </h1>
            <p className="colleagues-header-desc">
              Collaborate and manage verified campus professionals (Psychometricians and Psychologists) authorized to assist and observe students.
            </p>
          </div>
          <div className="colleagues-header-actions">
            {isSuperAdminViewer && (
              <button
                className="dash-btn-primary"
                id="btnRegisterColleagueHeader"
                onClick={openRegisterColleagueModal}
              >
                <i className="fas fa-user-plus"></i> Add Team Member
              </button>
            )}
            <button
              className={`refresh-btn ${isSpinning ? 'spinning' : ''}`}
              id="refreshBtn"
              onClick={loadColleagues}
            >
              <i className="fas fa-rotate-right"></i> Refresh
            </button>
            <Link
              to="/pro-dashboard"
              className="refresh-btn"
              id="dashShortcutBtn"
              style={{ textDecoration: 'none' }}
            >
              <i className="fas fa-chart-line"></i> Dashboard
            </Link>
          </div>
        </div>

        {/* Stat Cards Row */}
        <div className="colleagues-stats-row">
          {/* Total Professionals */}
          <div
            className={`stat-card interactive ${currentFilter === 'ALL' ? 'active-filter' : ''}`}
            id="cardTotal"
            onClick={() => setCurrentFilter('ALL')}
          >
            <div className="stat-card-icon">
              <i className="fas fa-users"></i>
            </div>
            <div className="stat-card-value" id="statTotalColleagues">
              {total}
            </div>
            <div className="stat-card-label">Total Campus Professionals</div>
            <div className="stat-card-sub neutral">
              <i className="fas fa-shield-halved"></i> Verified Staff
            </div>
          </div>

          {/* Psychometricians */}
          <div
            className={`stat-card purple interactive ${
              currentFilter === 'PSYCHOMETRICIAN' ? 'active-filter' : ''
            }`}
            id="cardPsychometrician"
            onClick={() => setCurrentFilter('PSYCHOMETRICIAN')}
          >
            <div className="stat-card-icon">
              <i className="fas fa-chart-line"></i>
            </div>
            <div className="stat-card-value" id="statPsychometricians">
              {psychometricians}
            </div>
            <div className="stat-card-label">Psychometricians</div>
            <div
              className="stat-card-sub"
              style={{ background: '#ede9fe', color: '#7c3aed', border: '1px solid #ddd6fe' }}
            >
              <i className="fas fa-square-poll-vertical"></i> Mental Health Metrics
            </div>
          </div>

          {/* Psychologists */}
          <div
            className={`stat-card amber interactive ${
              currentFilter === 'PSYCHOLOGIST' ? 'active-filter' : ''
            }`}
            id="cardPsychologist"
            onClick={() => setCurrentFilter('PSYCHOLOGIST')}
          >
            <div className="stat-card-icon">
              <i className="fas fa-brain"></i>
            </div>
            <div className="stat-card-value" id="statPsychologists">
              {psychologists}
            </div>
            <div className="stat-card-label">Psychologists</div>
            <div
              className="stat-card-sub"
              style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}
            >
              <i className="fas fa-stethoscope"></i> Clinical Assessment
            </div>
          </div>
        </div>

        {/* Directory Toolbar */}
        <div className="directory-toolbar">
          <div className="directory-search">
            <i className="fas fa-search search-icon"></i>
            <input
              type="text"
              id="colleagueSearchInput"
              placeholder="Search colleague by name, staff ID, or office..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                id="clearSearchBtn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
                style={{ display: 'inline-flex' }}
              >
                <i className="fas fa-xmark"></i>
              </button>
            )}
          </div>
          <div className="directory-filters">
            <button
              className={`directory-filter-btn ${currentFilter === 'ALL' ? 'active' : ''}`}
              id="filterBtnAll"
              onClick={() => setCurrentFilter('ALL')}
            >
              All Roles <span className="filter-count" id="countAll">{total}</span>
            </button>
            <button
              className={`directory-filter-btn ${
                currentFilter === 'PSYCHOMETRICIAN' ? 'active' : ''
              }`}
              id="filterBtnPsychometrician"
              onClick={() => setCurrentFilter('PSYCHOMETRICIAN')}
            >
              Psychometricians{' '}
              <span className="filter-count" id="countPsychometrician">
                {psychometricians}
              </span>
            </button>
            <button
              className={`directory-filter-btn ${
                currentFilter === 'PSYCHOLOGIST' ? 'active' : ''
              }`}
              id="filterBtnPsychologist"
              onClick={() => setCurrentFilter('PSYCHOLOGIST')}
            >
              Psychologists{' '}
              <span className="filter-count" id="countPsychologist">
                {psychologists}
              </span>
            </button>
          </div>
        </div>

        {/* Colleagues Grid */}
        <div className="colleagues-grid" id="colleaguesGrid">
          {loading ? (
            <div
              style={{
                gridColumn: '1/-1',
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '1rem',
                border: '1.5px solid #E1E8EB'
              }}
            >
              <i
                className="fas fa-spinner fa-spin"
                style={{ fontSize: '2rem', color: '#243E4C', marginBottom: '0.75rem' }}
              ></i>
              <p style={{ color: '#728590', fontSize: '0.92rem', margin: 0, fontWeight: 600 }}>
                Loading campus counseling colleagues...
              </p>
            </div>
          ) : errorMsg ? (
            <div
              style={{
                gridColumn: '1/-1',
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '1rem',
                border: '1.5px solid #E1E8EB'
              }}
            >
              <div
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  marginBottom: '1rem'
                }}
              >
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#243E4C', margin: '0 0 0.4rem 0' }}>
                Could not load colleagues directory
              </h3>
              <p style={{ color: '#728590', fontSize: '0.86rem', margin: '0 0 1.25rem 0' }}>
                {errorMsg}
              </p>
              <button className="dash-btn-primary" onClick={loadColleagues}>
                <i className="fas fa-rotate-right"></i> Try Again
              </button>
            </div>
          ) : filteredList.length === 0 ? (
            <div
              style={{
                gridColumn: '1/-1',
                textAlign: 'center',
                padding: '3.5rem 1.5rem',
                background: '#FFFFFF',
                borderRadius: '1.15rem',
                border: '1.5px dashed #7E9F9D'
              }}
            >
              <div
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '50%',
                  background: '#F4F7F7',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  color: '#243E4C',
                  marginBottom: '1rem'
                }}
              >
                <i className="fas fa-user-doctor"></i>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#243E4C', margin: '0 0 0.4rem 0' }}>
                No Colleagues Found
              </h3>
              <p
                style={{
                  fontSize: '0.86rem',
                  color: '#728590',
                  margin: '0 0 1.25rem 0',
                  maxWidth: '420px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.5
                }}
              >
                {searchQuery
                  ? `No registered colleagues match "${searchQuery}". Try clearing your search or checking role filters.`
                  : 'No colleagues are currently registered under this category.'}
              </p>
              {searchQuery ? (
                <button className="dash-btn-primary" onClick={() => setSearchQuery('')}>
                  <i className="fas fa-xmark"></i> Clear Search
                </button>
              ) : isSuperAdminViewer ? (
                <button className="dash-btn-primary" onClick={openRegisterColleagueModal}>
                  <i className="fas fa-user-plus"></i> Add Colleague
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {filteredList.map((c) => {
                const initials = getInitials(c.fullName);
                const cat = getColleagueCategory(c);
                const deptText = c.department || 'Guidance & Counseling Center';
                const isSelf =
                  c.username === currentUsername || c.institutionalId === currentUsername;
                const staffId = c.institutionalId || c.username;

                return (
                  <div key={c.username || c.institutionalId} className="colleague-card">
                    <div>
                      <div className="colleague-card-header">
                        <div className={`colleague-avatar ${isSelf ? 'self' : ''}`}>{initials}</div>
                        <div className="colleague-meta">
                          <div className="colleague-name-row">
                            <span className="colleague-name">{c.fullName}</span>
                            {isSelf && (
                              <span className="colleague-you-pill">
                                <i className="fas fa-user-check"></i> You
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {(c.role === 'SUPER_ADMIN' || c.role === 'ADMIN') && (
                              <span className="colleague-admin-badge" style={{ marginRight: '0.35rem' }}>
                                Lead Psychometrician
                              </span>
                            )}
                            {cat === 'PSYCHOLOGIST' ? (
                              <span className="colleague-role-badge psychologist">
                                <i className="fas fa-brain"></i> Psychologist
                              </span>
                            ) : (
                              <span className="colleague-role-badge psychometrician">
                                <i className="fas fa-chart-line"></i> Psychometrician
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Information Details */}
                      <div className="colleague-details-box">
                        <div className="colleague-detail-row">
                          <i className="fas fa-id-badge colleague-detail-icon" title="Staff ID"></i>
                          <div className="colleague-detail-content">
                            <span style={{ color: '#728590', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.1rem' }}>
                              Staff ID
                            </span>
                            <span className="staff-id-pill">{staffId}</span>
                            <button
                              className="btn-copy-id"
                              onClick={() => copyText(staffId)}
                              title="Copy Staff ID"
                            >
                              <i className="fas fa-copy"></i>
                            </button>
                          </div>
                        </div>

                        <div className="colleague-detail-row">
                          <i className="fas fa-envelope colleague-detail-icon" title="Work Email"></i>
                          <div className="colleague-detail-content">
                            <span style={{ color: '#728590', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.1rem' }}>
                              Work Email
                            </span>
                            {c.email ? (
                              <a href={`mailto:${c.email}`}>{c.email}</a>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>No email on file</span>
                            )}
                          </div>
                        </div>

                        <div className="colleague-detail-row">
                          <i className="fas fa-building colleague-detail-icon" title="Department / Office"></i>
                          <div className="colleague-detail-content">
                            <span style={{ color: '#728590', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.1rem' }}>
                              Department / Office
                            </span>
                            <strong style={{ color: '#243E4C' }}>{deptText}</strong>
                          </div>
                        </div>

                        {c.phoneNumber && (
                          <div className="colleague-detail-row">
                            <i className="fas fa-phone colleague-detail-icon" title="Contact Number"></i>
                            <div className="colleague-detail-content">
                              <span style={{ color: '#728590', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.1rem' }}>
                                Contact
                              </span>
                              <a href={`tel:${c.phoneNumber}`}>{c.phoneNumber}</a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="colleague-footer">
                      <div className="colleague-status">
                        <span
                          className="colleague-status-dot"
                          style={{
                            background:
                              c.role === 'SUPER_ADMIN' || c.role === 'ADMIN' ? '#7C3AED' : undefined,
                            boxShadow:
                              c.role === 'SUPER_ADMIN' || c.role === 'ADMIN'
                                ? '0 0 6px rgba(124,58,237,0.4)'
                                : undefined
                          }}
                        ></span>
                        <span>
                          {c.role === 'SUPER_ADMIN' || c.role === 'ADMIN'
                            ? 'Lead Psychometrician'
                            : 'Active & Authorized'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {isSuperAdminViewer && !isSelf && c.role !== 'SUPER_ADMIN' && c.role !== 'ADMIN' ? (
                          <button
                            className="btn-transfer-admin"
                            onClick={() => openTransferAdminModal(c.username, c.fullName)}
                          >
                            <i className="fas fa-shield-halved"></i> Transfer Lead Role
                          </button>
                        ) : isSuperAdminViewer &&
                          !isSelf &&
                          (c.role === 'SUPER_ADMIN' || c.role === 'ADMIN') &&
                          c.username !== 'admin' &&
                          c.username !== 'psychometrician' ? (
                          <button
                            className="btn-transfer-admin"
                            style={{ background: '#F4F7F7', borderColor: '#E1E8EB', color: '#51646E' }}
                            onClick={() => revokeAdminColleague(c.username, c.fullName)}
                          >
                            <i className="fas fa-user-minus"></i> Demote
                          </button>
                        ) : null}

                        {isSuperAdminViewer && (
                          <button
                            className="btn-resend-welcome"
                            id={`resendBtn_${staffId}`}
                            disabled={resendingId === staffId}
                            onClick={() => resendColleagueEmail(c.username, c.fullName, staffId)}
                          >
                            <i
                              className={`fas ${
                                resendingId === staffId ? 'fa-spinner fa-spin' : 'fa-paper-plane'
                              }`}
                            ></i>{' '}
                            {resendingId === staffId ? 'Sending...' : 'Resend Email'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* When only 1 colleague is registered, render inviting card for Super Admin */}
              {filteredList.length === 1 && currentFilter === 'ALL' && !searchQuery && isSuperAdminViewer && (
                <div className="colleague-add-card">
                  <div className="colleague-add-icon">
                    <i className="fas fa-user-plus"></i>
                  </div>
                  <h4>Register a Colleague</h4>
                  <p>Add fellow campus psychometricians or psychologists to collaborate on student wellbeing.</p>
                  <button className="dash-btn-primary" onClick={openRegisterColleagueModal}>
                    <i className="fas fa-user-plus"></i> Add Colleague
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Register Colleague Modal */}
      {registerModalOpen && (
        <div className="cred-modal-overlay" id="registerColleagueModal" style={{ display: 'flex' }}>
          <div className="cred-modal" style={{ maxWidth: '520px' }}>
            <div className="cred-modal-header">
              <h3>
                <i className="fas fa-user-plus" style={{ color: '#243E4C' }}></i> Register Guidance Colleague
              </h3>
              <button className="cred-modal-close" onClick={closeRegisterModal}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="cred-modal-body" id="colleagueModalBody">
              {!registerResult ? (
                <div className="auth-form" id="colleagueFormFields">
                  <div className="form-group">
                    <label className="form-label">
                      Guidance Role / Responsibility <span className="required-star">*</span>
                    </label>
                    <select
                      className="form-input"
                      id="colleagueAccountRole"
                      value={regForm.accountRole}
                      onChange={handleAccountRoleChange}
                    >
                      <option value="PROFESSIONAL">Counseling Staff (Psychologist / Psychometrician)</option>
                      <option value="SUPER_ADMIN">Guidance Supervisor (Lead Psychometrician)</option>
                    </select>
                    <span style={{ fontSize: '0.75rem', color: '#728590', marginTop: '0.25rem', display: 'block' }}>
                      Guidance Supervisors have clinical oversight authority to manage the team and clinic operations.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Full Name <span className="required-star">*</span>
                    </label>
                    <input
                      className="form-input"
                      id="colleagueName"
                      placeholder="e.g. Dr. Clara Reyes, RPsy"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Professional Role / Specialization <span className="required-star">*</span>
                    </label>
                    <select
                      className="form-input"
                      id="colleagueTitle"
                      value={regForm.title}
                      onChange={(e) => setRegForm({ ...regForm, title: e.target.value })}
                    >
                      <option value="Psychometrician">Psychometrician</option>
                      <option value="Psychologist">Psychologist</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Campus Staff ID <span className="required-star">*</span>
                    </label>
                    <input
                      className="form-input"
                      id="colleagueInstId"
                      placeholder="e.g. PROF-001 or 2023304523"
                      value={regForm.instId}
                      onChange={(e) => setRegForm({ ...regForm, instId: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Work Email Address <span className="required-star">*</span>
                    </label>
                    <input
                      className="form-input"
                      id="colleagueEmail"
                      type="email"
                      placeholder="e.g. clara.reyes@ustp.edu.ph"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Department / Office</label>
                    <input
                      className="form-input"
                      id="colleagueDept"
                      value={regForm.dept}
                      placeholder="e.g. Guidance &amp; Counseling Center"
                      onChange={(e) => setRegForm({ ...regForm, dept: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Number (Optional)</label>
                    <input
                      className="form-input"
                      id="colleaguePhone"
                      placeholder="e.g. 0912 345 6789"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div id="colleagueRegResult" style={{ display: 'block' }}>
                  <div
                    style={{
                      background: '#F0FDF4',
                      border: '1.5px solid #BBF7D0',
                      borderRadius: '1rem',
                      padding: '1.5rem',
                      textAlign: 'center',
                      marginBottom: '1.25rem'
                    }}
                  >
                    <div
                      style={{
                        width: '3.5rem',
                        height: '3.5rem',
                        borderRadius: '50%',
                        background: '#DCFCE7',
                        color: '#15803d',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.6rem',
                        marginBottom: '0.75rem'
                      }}
                    >
                      <i className="fas fa-circle-check"></i>
                    </div>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#166534', margin: '0 0 0.4rem 0' }}>
                      {registerResult.role === 'SUPER_ADMIN' || registerResult.role === 'ADMIN'
                        ? 'Guidance Supervisor'
                        : 'Team Member'}{' '}
                      Registered Successfully!
                    </h4>
                    <p style={{ fontSize: '0.86rem', color: '#15803d', margin: 0, lineHeight: 1.5 }}>
                      A welcome email with login instructions has been sent to{' '}
                      <strong>{registerResult.email || regForm.email}</strong>.
                    </p>
                  </div>

                  <div
                    style={{
                      background: '#F4F7F7',
                      border: '1.5px solid #E1E8EB',
                      borderRadius: '0.85rem',
                      padding: '1.25rem',
                      marginBottom: '1.5rem'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#728590',
                        letterSpacing: '0.5px',
                        marginBottom: '0.75rem'
                      }}
                    >
                      Staff Sign-In Details (Shareable)
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0',
                        borderBottom: '1px solid #E1E8EB'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#51646E' }}>Name:</span>
                      <strong style={{ color: '#243E4C' }}>
                        {registerResult.fullName || regForm.name}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0',
                        borderBottom: '1px solid #E1E8EB'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#51646E' }}>System Role:</span>
                      <span
                        className="role-badge"
                        style={{
                          background: '#EDE9FE',
                          color: '#5B21B6',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {registerResult.role || regForm.accountRole}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0',
                        borderBottom: '1px solid #E1E8EB'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#51646E' }}>Staff Sign-In ID:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: '#243E4C'
                          }}
                        >
                          {registerResult.institutionalId || regForm.instId}
                        </span>
                        <button
                          className="cred-btn cred-btn-outline"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                          onClick={() => copyText(registerResult.institutionalId || regForm.instId)}
                        >
                          <i className="fas fa-copy"></i> Copy
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.6rem 0'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#51646E' }}>Temporary Password:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: '#0284C7',
                            background: '#E0F2FE',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}
                        >
                          {registerResult.generatedPassword || ''}
                        </span>
                        <button
                          className="cred-btn cred-btn-outline"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                          onClick={() => copyText(registerResult.generatedPassword || '')}
                        >
                          <i className="fas fa-copy"></i> Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      className="cred-btn cred-btn-outline"
                      style={{ flex: 1 }}
                      onClick={() =>
                        copyAllDetails(
                          registerResult.fullName || regForm.name,
                          registerResult.institutionalId || regForm.instId,
                          registerResult.generatedPassword || ''
                        )
                      }
                    >
                      <i className="fas fa-copy"></i> Copy Details
                    </button>
                    <button
                      className="dash-btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={closeRegisterModal}
                    >
                      <i className="fas fa-check"></i> Done
                    </button>
                  </div>
                </div>
              )}
            </div>
            {!registerResult && (
              <div className="cred-modal-footer" id="colleagueModalFooter">
                <button className="cred-btn cred-btn-outline" onClick={closeRegisterModal}>
                  Cancel
                </button>
                <button
                  className="dash-btn-primary"
                  id="colleagueSubmitBtn"
                  disabled={registerSubmitting}
                  onClick={submitRegisterColleague}
                  style={{ padding: '0.65rem 1.3rem' }}
                >
                  <i className={`fas ${registerSubmitting ? 'fa-spinner fa-spin' : 'fa-user-plus'}`}></i>{' '}
                  {registerSubmitting ? 'Adding to Team...' : 'Add to Team'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Admin Modal */}
      {transferModalOpen && (
        <div className="cred-modal-overlay" id="transferAdminModal" style={{ display: 'flex' }}>
          <div className="cred-modal" style={{ maxWidth: '520px' }}>
            <div className="cred-modal-header">
              <h3>
                <i className="fas fa-shield-halved" style={{ color: '#7C3AED' }}></i> Transfer Admin Role
              </h3>
              <button className="cred-modal-close" onClick={closeTransferModal}>
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            <div className="cred-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#51646E', marginBottom: '1rem', lineHeight: 1.5 }}>
                You are about to transfer administrative leadership to{' '}
                <strong id="transferTargetName" style={{ color: '#243E4C' }}>
                  {transferTarget.fullName}
                </strong>{' '}
                (<span id="transferTargetUsername" style={{ fontFamily: 'monospace', color: '#7C3AED' }}>
                  @{transferTarget.username}
                </span>).
              </p>
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1.5px solid #FECACA',
                  borderRadius: '0.75rem',
                  padding: '0.9rem 1rem',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                  <i
                    className="fas fa-triangle-exclamation"
                    style={{ color: '#DC2626', fontSize: '1.15rem', marginTop: '0.15rem', flexShrink: 0 }}
                  ></i>
                  <div style={{ fontSize: '0.82rem', color: '#991B1B', lineHeight: 1.45 }}>
                    <strong>Administrative Governance Policy:</strong>
                    <p style={{ margin: '0.25rem 0 0 0' }}>
                      Administrators hold full custody over platform maintenance, user accounts, and security audit logs.
                    </p>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, color: '#243E4C' }}>
                  Transfer Mode
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.4rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      fontSize: '0.84rem',
                      color: '#51646E',
                      cursor: 'pointer',
                      background: '#F8FAFC',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #E2E8F0'
                    }}
                  >
                    <input
                      type="radio"
                      name="transferMode"
                      value="relinquish"
                      checked={transferMode === 'relinquish'}
                      onChange={() => setTransferMode('relinquish')}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <div>
                      <strong>Primary Leadership Transfer</strong>
                      <div style={{ color: '#728590', fontSize: '0.77rem', marginTop: '0.1rem' }}>
                        Transfer primary admin to this colleague and transition my account to regular Professional.
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      fontSize: '0.84rem',
                      color: '#51646E',
                      cursor: 'pointer',
                      background: '#F8FAFC',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #E2E8F0'
                    }}
                  >
                    <input
                      type="radio"
                      name="transferMode"
                      value="coadmin"
                      checked={transferMode === 'coadmin'}
                      onChange={() => setTransferMode('coadmin')}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <div>
                      <strong>Appoint Co-Administrator</strong>
                      <div style={{ color: '#728590', fontSize: '0.77rem', marginTop: '0.1rem' }}>
                        Grant administrative privileges to this colleague while retaining my own Admin status.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {transferSuccessMsg && (
                <div
                  id="transferResult"
                  style={{
                    display: 'block',
                    marginTop: '1rem',
                    background: '#F0FDF4',
                    border: '1.5px solid #BBF7D0',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    textAlign: 'center'
                  }}
                >
                  <i
                    className="fas fa-circle-check"
                    style={{ color: '#15803d', fontSize: '1.5rem', marginBottom: '0.4rem' }}
                  ></i>
                  <h4 style={{ color: '#166534', margin: '0 0 0.3rem 0', fontSize: '1rem' }}>
                    Role Updated Successfully
                  </h4>
                  <p style={{ color: '#15803d', fontSize: '0.84rem', margin: 0 }}>
                    {transferSuccessMsg}
                  </p>
                </div>
              )}
            </div>

            {!transferSuccessMsg && (
              <div className="cred-modal-footer" id="transferModalFooter">
                <button className="cred-btn cred-btn-outline" onClick={closeTransferModal}>
                  Cancel
                </button>
                <button
                  className="dash-btn-primary"
                  id="confirmTransferBtn"
                  disabled={transferSubmitting}
                  onClick={submitTransferAdmin}
                  style={{ background: '#7C3AED', borderColor: '#6D28D9', padding: '0.65rem 1.3rem' }}
                >
                  <i className={`fas ${transferSubmitting ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>{' '}
                  {transferSubmitting ? 'Transferring Role...' : 'Confirm Role Transfer'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="copy-toast" id="copyToast" style={{ display: 'flex' }}>
          <i className="fas fa-circle-check" style={{ color: '#22c55e' }}></i>
          <span id="copyToastMsg">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
