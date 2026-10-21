import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import '../styles/auth.css';
import '../styles/register.css';

export default function Register() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (role === 'PROFESSIONAL' || role === 'SUPER_ADMIN') {
        navigate('/pro-dashboard', { replace: true });
      } else if (role === 'MAINTENANCE' || role === 'ADMIN') {
        navigate('/system-maintenance', { replace: true });
      } else {
        navigate('/rant-board', { replace: true });
      }
    }
  }, [isAuthenticated, role, navigate]);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [instId, setInstId] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showRulesError, setShowRulesError] = useState(false);

  // Terms Modal State
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [termsActiveTab, setTermsActiveTab] = useState('terms'); // 'terms' | 'privacy'

  // Success screen data
  const [successData, setSuccessData] = useState(null);

  // Close modal on escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setTermsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Password rules validation
  const hasLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNum = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  let score = 0;
  if (hasLen) score++;
  if (hasUpper) score++;
  if (hasNum) score++;
  if (hasSpecial) score++;

  const clearFieldError = (fieldName) => {
    setFieldErrors((prev) => ({ ...prev, [fieldName]: null }));
    if (fieldName === 'password') setShowRulesError(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setShowRulesError(false);
    const errors = {};

    if (!fullName.trim()) {
      errors.fullName = 'Please enter your full name.';
    }

    if (!instId.trim()) {
      errors.instId = 'Please enter your Institutional ID (e.g. 2021-00001).';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      errors.email = 'Please enter your email address for registration confirmation.';
    } else if (!emailRegex.test(email.trim())) {
      errors.email = 'Please enter a valid email address (e.g. student@ustp.edu.ph or juan@gmail.com).';
    }

    if (!department) {
      errors.department = 'Please select your department.';
    }

    if (!yearLevel) {
      errors.yearLevel = 'Please select your year level.';
    }

    const missingRules = [];
    if (!hasLen) missingRules.push('at least 8 characters');
    if (!hasUpper) missingRules.push('uppercase letter (A-Z)');
    if (!hasNum) missingRules.push('at least one number (0-9)');
    if (!hasSpecial) missingRules.push('special symbol (!@#$%...)');

    if (missingRules.length > 0) {
      errors.password = 'Password must comply with all requirements below.';
      setShowRulesError(true);
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please re-enter your password to confirm.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match. Please ensure both passwords are identical.';
    }

    if (!termsAccepted) {
      errors.terms = 'Please agree to the Terms and Conditions and Privacy Policy to proceed.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      let topMsg = 'Please complete the highlighted fields before proceeding.';
      if (errors.terms && Object.keys(errors).length === 1) {
        topMsg = 'Please agree to the Terms and Conditions and Privacy Policy to create your account.';
      } else if (missingRules.length > 0) {
        topMsg = 'Password rejected: does not comply with requirements. Missing: ' + missingRules.join(', ') + '.';
      } else if (errors.confirmPassword) {
        topMsg = errors.confirmPassword;
      }
      setErrorMsg(topMsg);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        fullName: fullName.trim(),
        institutionalId: instId.trim(),
        email: email.trim(),
        department,
        yearLevel,
        role: 'STUDENT',
        password,
        confirmPassword
      };

      const data = await authApi.selfRegister(payload);
      setSuccessData(data);
    } catch (err) {
      let msg = err.message || 'Registration failed.';
      if (msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      } else if (msg.toLowerCase().includes('institutional id')) {
        setFieldErrors((prev) => ({ ...prev, instId: msg }));
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const openTermsModal = (tab = 'terms') => {
    setTermsActiveTab(tab);
    setTermsModalOpen(true);
  };

  const acceptTermsAndClose = () => {
    setTermsAccepted(true);
    setFieldErrors((prev) => ({ ...prev, terms: null }));
    setTermsModalOpen(false);
  };

  return (
    <div className="register-page">
      <div className="register-card">

        <Link to="/" className="back-link">
          <i className="fas fa-arrow-left"></i> Back to Home
        </Link>

        <div className="register-brand">
          <div className="brand-icon logo-only">
            <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="brand-logo-img" />
          </div>
          <h1>Create Your <span>Student Account</span></h1>
          <p>USTP Balubal Student Registration</p>
        </div>

        {/* Error Banner */}
        <div className={`register-error ${errorMsg ? 'visible' : ''}`} id="registerError">
          <i className="fas fa-exclamation-circle"></i>
          <span id="registerErrorText">{errorMsg}</span>
        </div>

        {/* Success State */}
        {successData ? (
          <div className="register-success visible" id="registerSuccess">
            <div className="success-icon"><i className="fas fa-check"></i></div>
            <h2>Registration Successful!</h2>
            <p>Your account has been created. An official confirmation email with your registration details and emergency support contacts has been dispatched to your inbox.</p>
            
            <div className="cred-info" id="credInfo">
              <div className="cred-row">
                <span className="label">Username</span>
                <span className="value">{successData.username}</span>
              </div>
              <div className="cred-row">
                <span className="label">Full Name</span>
                <span className="value">{successData.fullName}</span>
              </div>
              <div className="cred-row">
                <span className="label">Role</span>
                <span className="value">{successData.role}</span>
              </div>
              <div className="cred-row">
                <span className="label">Confirmation Email</span>
                <span className="value" style={{ color: '#1E5E3A', fontWeight: 600 }}>
                  <i className="fas fa-envelope-circle-check" style={{ color: '#2D7D46', marginRight: '4px' }}></i>
                  Sent to {successData.email || email}
                </span>
              </div>
              {successData.department && (
                <div className="cred-row">
                  <span className="label">Department</span>
                  <span className="value">{successData.department}</span>
                </div>
              )}
              {successData.yearLevel && (
                <div className="cred-row">
                  <span className="label">Year Level</span>
                  <span className="value">{successData.yearLevel}</span>
                </div>
              )}
            </div>

            <Link to="/login" className="login-btn" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center' }}>
              <i className="fas fa-right-to-bracket"></i> Go to Login
            </Link>
          </div>
        ) : (
          /* Registration Form */
          <form className="auth-form" id="registerForm" onSubmit={handleRegister} noValidate style={{ display: 'block' }}>
            {/* Row 1: Full Name & Institutional ID */}
            <div className="register-row">
              <div className="form-group">
                <label className="form-label" htmlFor="regFullName">
                  Full Name
                </label>
                <div className={`input-wrapper ${fieldErrors.fullName ? 'has-error' : ''}`}>
                  <input
                    className="form-input"
                    type="text"
                    id="regFullName"
                    placeholder="e.g. Juan Dela Cruz"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      clearFieldError('fullName');
                    }}
                  />
                </div>
                {fieldErrors.fullName && (
                  <div className="field-feedback visible" id="regFullNameFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.fullName}</span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="regInstId">
                  Institutional ID
                </label>
                <div className={`input-wrapper ${fieldErrors.instId ? 'has-error' : ''}`}>
                  <input
                    className="form-input"
                    type="text"
                    id="regInstId"
                    placeholder="e.g. 2021-00001"
                    value={instId}
                    onChange={(e) => {
                      setInstId(e.target.value);
                      clearFieldError('instId');
                    }}
                  />
                </div>
                {fieldErrors.instId && (
                  <div className="field-feedback visible" id="regInstIdFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.instId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Email Address (Full Width) */}
            <div className="form-group">
              <label className="form-label" htmlFor="regEmail">
                Email Address
              </label>
              <div className={`input-wrapper ${fieldErrors.email ? 'has-error' : ''}`}>
                <input
                  className="form-input"
                  type="email"
                  id="regEmail"
                  placeholder="e.g. juan@ustp.edu.ph or juan@gmail.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                />
              </div>
              {fieldErrors.email && (
                <div className="field-feedback visible" id="regEmailFeedback">
                  <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>

            {/* Row 3: Department & Year Level */}
            <div className="register-row" id="deptRow">
              <div className="form-group" id="studentDeptGroup">
                <label className="form-label" htmlFor="regDepartment">
                  Department
                </label>
                <div className={`input-wrapper ${fieldErrors.department ? 'has-error' : ''}`}>
                  <select
                    className="form-input form-select"
                    id="regDepartment"
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      clearFieldError('department');
                    }}
                  >
                    <option value="" disabled>Select Department</option>
                    <option value="BSIT">BSIT</option>
                    <option value="BSA">BSA</option>
                    <option value="BAT">BAT</option>
                    <option value="BTLED">BTLED</option>
                  </select>
                  <i className="fas fa-chevron-down select-arrow"></i>
                </div>
                {fieldErrors.department && (
                  <div className="field-feedback visible" id="regDepartmentFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.department}</span>
                  </div>
                )}
              </div>

              <div className="form-group" id="yearLevelGroup">
                <label className="form-label" htmlFor="regYearLevel">
                  Year Level
                </label>
                <div className={`input-wrapper ${fieldErrors.yearLevel ? 'has-error' : ''}`}>
                  <select
                    className="form-input form-select"
                    id="regYearLevel"
                    value={yearLevel}
                    onChange={(e) => {
                      setYearLevel(e.target.value);
                      clearFieldError('yearLevel');
                    }}
                  >
                    <option value="" disabled>Select Year Level</option>
                    <option value="1ST YEAR">1ST YEAR</option>
                    <option value="2ND YEAR">2ND YEAR</option>
                    <option value="3RD YEAR">3RD YEAR</option>
                    <option value="4TH YEAR">4TH YEAR</option>
                  </select>
                  <i className="fas fa-chevron-down select-arrow"></i>
                </div>
                {fieldErrors.yearLevel && (
                  <div className="field-feedback visible" id="regYearLevelFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.yearLevel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Password & Confirm Password */}
            <div className="register-row">
              <div className="form-group">
                <label className="form-label" htmlFor="regPassword">
                  Password
                </label>
                <div className={`input-wrapper ${fieldErrors.password ? 'has-error' : ''}`}>
                  <input
                    className="form-input has-toggle"
                    type={showPassword ? 'text' : 'password'}
                    id="regPassword"
                    placeholder="Min. 8 characters"
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearFieldError('password');
                    }}
                  />
                  <button
                    type="button"
                    className="input-toggle-pw"
                    onClick={() => setShowPassword((p) => !p)}
                    tabIndex={-1}
                  >
                    <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                  </button>
                </div>
                {fieldErrors.password && (
                  <div className="field-feedback visible" id="regPasswordFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.password}</span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="regConfirmPassword">
                  Confirm Password
                </label>
                <div className={`input-wrapper ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
                  <input
                    className="form-input has-toggle"
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="regConfirmPassword"
                    placeholder="Re-enter password"
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearFieldError('confirmPassword');
                    }}
                  />
                  <button
                    type="button"
                    className="input-toggle-pw"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    tabIndex={-1}
                  >
                    <i className={showConfirmPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <div className="field-feedback visible" id="regConfirmPasswordFeedback">
                    <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.confirmPassword}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Password Strength & Compact Criteria Bar */}
            {password && (
              <div className="pw-compact-wrap">
                <div className="pw-compact-header">
                  <div className="pw-strength" id="pwStrength">
                    <div className={`pw-strength-bar ${score >= 1 ? (score <= 1 ? 'weak' : score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                    <div className={`pw-strength-bar ${score >= 2 ? (score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                    <div className={`pw-strength-bar ${score >= 3 ? 'strong' : ''}`}></div>
                    <div className={`pw-strength-bar ${score >= 4 ? 'strong' : ''}`}></div>
                  </div>
                  <span className="pw-strength-tag" style={{ color: score <= 1 ? '#ef4444' : score <= 2 ? '#f59e0b' : score === 3 ? '#10b981' : '#059669' }}>
                    {score <= 1 ? 'Weak' : score <= 2 ? 'Medium' : score === 3 ? 'Good' : 'Strong'}
                  </span>
                </div>
                <div className="pw-compact-criteria">
                  <span className={`pw-pill ${hasLen ? 'valid' : ''}`}>8+ chars</span>
                  <span className={`pw-pill ${hasUpper ? 'valid' : ''}`}>Uppercase</span>
                  <span className={`pw-pill ${hasNum ? 'valid' : ''}`}>Number</span>
                  <span className={`pw-pill ${hasSpecial ? 'valid' : ''}`}>Symbol</span>
                </div>
              </div>
            )}
            {showRulesError && !password && (
              <div className="field-feedback visible" style={{ marginTop: '-0.35rem', marginBottom: '0.65rem' }}>
                <i className="fas fa-circle-exclamation"></i> <span>Password must satisfy all criteria (8+ chars, uppercase, number, symbol).</span>
              </div>
            )}

            {/* Terms and Privacy Checkbox */}
            <div className={`terms-row ${fieldErrors.terms ? 'has-error' : ''}`} id="termsRow">
              <label className="terms-label" htmlFor="regTerms">
                <input
                  type="checkbox"
                  id="regTerms"
                  className="terms-checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    clearFieldError('terms');
                  }}
                />
                <span className="terms-text">
                  I agree to the{' '}
                  <a href="#terms" className="terms-link" onClick={(e) => { e.preventDefault(); openTermsModal('terms'); }}>
                    Terms and Conditions
                  </a>{' '}
                  and{' '}
                  <a href="#privacy" className="terms-link" onClick={(e) => { e.preventDefault(); openTermsModal('privacy'); }}>
                    Privacy Policy
                  </a>
                </span>
              </label>
              {fieldErrors.terms && (
                <div className="terms-feedback" id="termsFeedback" style={{ display: 'flex', opacity: 1, transform: 'translateY(0)' }}>
                  <i className="fas fa-circle-exclamation"></i>
                  <span>Please agree to the Terms and Conditions and Privacy Policy to proceed.</span>
                </div>
              )}
            </div>

            <button type="submit" className="login-btn" id="registerBtn" style={{ marginTop: '0.5rem' }} disabled={loading}>
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        )}

        {!successData && (
          <div className="register-footer" id="registerFooter">
            Already have an account? <Link to="/login">Sign In</Link>
          </div>
        )}
      </div>

      {/* Terms and Conditions Modal */}
      <div 
        className={`terms-modal-overlay ${termsModalOpen ? 'open' : ''}`} 
        id="termsModal"
        onClick={(e) => {
          if (e.target.id === 'termsModal') setTermsModalOpen(false);
        }}
      >
        <div className="terms-modal-card" role="dialog" aria-modal="true" aria-labelledby="termsModalTitle">
          <div className="terms-modal-header">
            <div className="terms-modal-header-left">
              <div className="terms-modal-icon">
                <i className="fas fa-shield-halved"></i>
              </div>
              <div>
                <h2 id="termsModalTitle" className="terms-modal-title">
                  {termsActiveTab === 'terms' ? 'Terms of Use' : 'Privacy & Confidentiality'}
                </h2>
                <p className="terms-modal-subtitle">SafeSpace University Sanctuary Agreement • Effective 2026</p>
              </div>
            </div>
            <button
              type="button"
              className="terms-modal-close"
              onClick={() => setTermsModalOpen(false)}
              aria-label="Close modal"
            >
              <i className="fas fa-xmark"></i>
            </button>
          </div>

          <div className="terms-modal-tabs">
            <button
              type="button"
              className={`terms-tab-btn ${termsActiveTab === 'terms' ? 'active' : ''}`}
              onClick={() => setTermsActiveTab('terms')}
            >
              <i className="fas fa-file-contract"></i> Terms of Use
            </button>
            <button
              type="button"
              className={`terms-tab-btn ${termsActiveTab === 'privacy' ? 'active' : ''}`}
              onClick={() => setTermsActiveTab('privacy')}
            >
              <i className="fas fa-user-shield"></i> Privacy &amp; Confidentiality
            </button>
          </div>

          <div className="terms-modal-body" id="termsBody">
            {termsActiveTab === 'terms' ? (
              <div className="terms-tab-content active" id="tabContentTerms">
                <div className="terms-section">
                  <h3>1. Purpose &amp; Voluntary Engagement</h3>
                  <p>SafeSpace is an institution-affiliated psychological wellness sanctuary developed to provide students and campus mental health professionals with safe, confidential emotional support, psychoeducational tools, peer venting boards, and guided counseling. All registration and participation in SafeSpace is completely voluntary.</p>
                </div>

                <div className="terms-section">
                  <h3>2. User Accounts &amp; Verification</h3>
                  <p>Users must provide accurate institutional identification for credential verification. Accounts are personal and non-transferable. You are solely responsible for maintaining the confidentiality of your chosen password.</p>
                </div>

                <div className="terms-section">
                  <h3>3. Community Standards &amp; Safe Conduct</h3>
                  <p>SafeSpace is an empathetic, healing space. By using the platform, you agree to treat every peer and professional with dignity. The following behaviors are strictly prohibited:</p>
                  <ul>
                    <li>Cyberbullying, harassment, intimidation, or targeted hate speech against any student, faculty, or staff member.</li>
                    <li>Publishing non-consensual personal information, doxxing, or defamatory statements.</li>
                    <li>Intentional misuse or spamming of anonymous rant boards or counseling queue systems.</li>
                  </ul>
                  <p>Violations will result in immediate content removal and permanent revocation of platform privileges.</p>
                </div>

                <div className="terms-section">
                  <h3>4. Boundaries of Psychological Support &amp; Emergency Situations</h3>
                  <p>Psychologists and psychometricians provide psychological first aid, emotional guidance, and supportive triage. SafeSpace is <strong>not an emergency healthcare facility or 24/7 psychiatric emergency ward</strong>.</p>
                  <div className="terms-alert-box">
                    <i className="fas fa-triangle-exclamation"></i>
                    <div>
                      <strong>Life-Threatening Emergency Notice:</strong> If you or someone you know is experiencing severe immediate distress or life-threatening harm, please contact national emergency services immediately:
                      <br /><strong>National Crisis Hotline: 1553 (Toll-Free) or 0966-351-4518</strong>.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="terms-tab-content active" id="tabContentPrivacy">
                <div className="terms-section">
                  <h3>1. Philippine Data Privacy Act Compliance</h3>
                  <p>SafeSpace strictly adheres to the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>. Your personal data is collected solely for institutional verification, session routing, and platform integrity, and is never sold, harvested, or shared with unauthorized third parties.</p>
                </div>

                <div className="terms-section">
                  <h3>2. Shielded Identity &amp; Decoupled Anonymity</h3>
                  <p>When participating in public or community features (such as the Rant Board), your real name, institutional ID, and personal identifiers are completely decoupled and replaced with randomized anonymous handles. Your peers cannot see your real identity.</p>
                </div>

                <div className="terms-section">
                  <h3>3. Limits of Confidentiality &amp; Duty of Care</h3>
                  <p>Counseling confidentiality is sacred. However, in compliance with Philippine mental health laws and professional ethical standards, confidentiality is subject to mandatory ethical limits:</p>
                  <ul>
                    <li>When a client poses a clear, immediate, and imminent danger of suicide or severe self-harm.</li>
                    <li>When there is an active, imminent threat to the life or physical safety of another individual.</li>
                    <li>When disclosure is legally mandated by child protection laws or judicial court orders.</li>
                  </ul>
                  <p>In such rare life-safety emergencies, authorized professionals may initiate designated campus safety protocols to protect human life.</p>
                </div>

                <div className="terms-section">
                  <h3>4. Data Encryption &amp; Security Standards</h3>
                  <p>Passwords are salted and cryptographically hashed before storage. Data transmission is secured using industry-standard TLS encryption, and access permissions are governed by strict Role-Based Access Controls (RBAC).</p>
                </div>
              </div>
            )}
          </div>

          <div className="terms-modal-footer">
            <button
              type="button"
              className="terms-btn-secondary"
              onClick={() => setTermsModalOpen(false)}
            >
              Close
            </button>
            <button
              type="button"
              className="terms-btn-primary"
              onClick={acceptTermsAndClose}
            >
              <i className="fas fa-check"></i> I Understand &amp; Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
