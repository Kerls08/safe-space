import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import '../styles/auth.css';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, role } = useAuth();

  // Helper navigation by role
  const navigateByRole = (userRole) => {
    switch (userRole) {
      case 'MAINTENANCE':
      case 'ADMIN':
        navigate('/system-maintenance', { replace: true });
        break;
      case 'SUPER_ADMIN':
      case 'PROFESSIONAL':
        navigate('/pro-dashboard', { replace: true });
        break;
      default:
        navigate('/rant-board', { replace: true });
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigateByRole(role);
    }
  }, [isAuthenticated, role]);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Field feedbacks & Alerts
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState(null); // { type: 'danger'|'warning'|'success', text: '', icon: '' }

  // Lockout State
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutTimerRef = useRef(null);

  const startLockout = (seconds) => {
    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    setIsLocked(true);
    setLockoutSeconds(seconds);

    const targetTime = Date.now() + seconds * 1000;
    localStorage.setItem('ss_lockout_until', targetTime.toString());

    setAlert({
      type: 'warning',
      text: `Too many failed attempts. Account locked for ${seconds}s.`,
      icon: 'fas fa-lock'
    });

    lockoutTimerRef.current = setInterval(() => {
      const msLeft = targetTime - Date.now();
      const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setLockoutSeconds(secsLeft);

      if (secsLeft <= 0) {
        clearInterval(lockoutTimerRef.current);
        setIsLocked(false);
        localStorage.removeItem('ss_lockout_until');
        setAlert({
          type: 'success',
          text: 'Lockout period expired. You can try signing in again.',
          icon: 'fas fa-circle-check'
        });
      } else {
        setAlert({
          type: 'warning',
          text: `Too many failed attempts. Account locked (${secsLeft}s remaining).`,
          icon: 'fas fa-lock'
        });
      }
    }, 1000);
  };

  const clearErrors = () => {
    setFieldErrors({});
    if (!isLocked) setAlert(null);
  };

  // Restore existing lockout from localStorage on mount
  useEffect(() => {
    const untilStr = localStorage.getItem('ss_lockout_until');
    if (untilStr) {
      const until = parseInt(untilStr, 10);
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining > 0) {
        startLockout(remaining);
      } else {
        localStorage.removeItem('ss_lockout_until');
      }
    }
  }, []);

  // Force Password Change Modal State
  const [pwChangeModalOpen, setPwChangeModalOpen] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [tempUsername, setTempUsername] = useState(null);
  const [tempRole, setTempRole] = useState(null);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwChangeError, setPwChangeError] = useState('');
  const [pwChangeLoading, setPwChangeLoading] = useState(false);

  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Lookup, 2: Confirm Email, 3: Verify OTP, 4: Reset Password, 5: Success
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [recoveryState, setRecoveryState] = useState({
    identifier: '',
    maskedEmail: '',
    resetToken: '',
    countdownSeconds: 300
  });
  const [otpCode, setOtpCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotConfirmPw, setForgotConfirmPw] = useState('');
  const [showForgotNewPw, setShowForgotNewPw] = useState(false);
  const [showForgotConfirmPw, setShowForgotConfirmPw] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFieldErrors, setForgotFieldErrors] = useState({});
  const otpTimerRef = useRef(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    clearErrors();

    const errors = {};
    if (!username.trim()) errors.username = 'Please enter your Institutional ID or username.';
    if (!password) errors.password = 'Please enter your password.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setAlert({
        type: 'danger',
        text: 'Please provide both your ID and password.',
        icon: 'fas fa-circle-exclamation'
      });
      return;
    }

    setLoading(true);

    try {
      const data = await authApi.login(username.trim(), password);

      // Handle mandatory password change requirement
      if (data.forcePasswordChange) {
        setTempToken(data.token);
        setTempUsername(data.username);
        setTempRole(data.role);
        setPwChangeModalOpen(true);
        setLoading(false);
        return;
      }

      // Normal login success
      login(data);
      navigateByRole(data.role);
    } catch (err) {
      const errorMsg = err.message || 'Invalid credentials.';

      if (errorMsg.includes('locked')) {
        const match = errorMsg.match(/(\d+)\s*(?:seconds|s)/i);
        const secs = match ? parseInt(match[1], 10) : 60;
        startLockout(secs);
      } else {
        setAlert({
          type: 'danger',
          text: errorMsg,
          icon: 'fas fa-circle-exclamation'
        });
        setFieldErrors({
          username: 'Invalid student ID or username.',
          password: 'Incorrect password.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Password Strength Calculator
  const calcPwStrength = (pw) => {
    const hasLen = pw.length >= 8;
    const hasUpper = /[A-Z]/.test(pw);
    const hasNum = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    let score = 0;
    if (hasLen) score++;
    if (hasUpper) score++;
    if (hasNum) score++;
    if (hasSpecial) score++;
    return { hasLen, hasUpper, hasNum, hasSpecial, score };
  };

  const pwChangeStrength = calcPwStrength(newPw);
  const forgotPwStrength = calcPwStrength(forgotNewPw);

  // Forced Password Change Handler
  const handlePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    setPwChangeError('');

    if (!currentPw) {
      setPwChangeError('Please enter your current password.');
      return;
    }

    if (pwChangeStrength.score < 4) {
      setPwChangeError('Password must comply with all requirements below.');
      return;
    }

    if (newPw !== confirmPw) {
      setPwChangeError('New passwords do not match.');
      return;
    }

    setPwChangeLoading(true);

    try {
      await authApi.changePassword(tempToken, tempUsername, currentPw, newPw);
      setPwChangeModalOpen(false);

      // Log the user in with the now-valid account
      login({
        token: tempToken,
        username: tempUsername,
        role: tempRole
      });
      navigateByRole(tempRole);
    } catch (err) {
      setPwChangeError(err.message || 'Failed to update password.');
    } finally {
      setPwChangeLoading(false);
    }
  };

  // Forgot Password Handlers
  const handleForgotLookup = async (e) => {
    if (e) e.preventDefault();
    setForgotError('');
    setForgotFieldErrors({});

    const id = forgotIdentifier.trim();
    if (!id) {
      setForgotFieldErrors({ identifier: 'Please enter your Institutional ID or username.' });
      return;
    }

    setForgotLoading(true);

    try {
      const data = await authApi.forgotPasswordLookup(id);
      setRecoveryState({
        identifier: id,
        maskedEmail: data.maskedEmail,
        resetToken: '',
        countdownSeconds: 300
      });
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message || 'No registered account found with that ID.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotSendOtp = async () => {
    setForgotError('');
    setForgotLoading(true);

    try {
      await authApi.forgotPasswordSendOtp(recoveryState.identifier);
      setForgotStep(3);

      // Start countdown
      setRecoveryState((prev) => ({ ...prev, countdownSeconds: 300 }));
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      otpTimerRef.current = setInterval(() => {
        setRecoveryState((prev) => {
          if (prev.countdownSeconds <= 1) {
            clearInterval(otpTimerRef.current);
            return { ...prev, countdownSeconds: 0 };
          }
          return { ...prev, countdownSeconds: prev.countdownSeconds - 1 };
        });
      }, 1000);
    } catch (err) {
      setForgotError(err.message || 'Failed to dispatch verification code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setForgotError('');
    setForgotFieldErrors({});

    const code = otpCode.trim();
    if (!code || code.length < 6) {
      setForgotFieldErrors({ otp: 'Please enter the full 6-digit verification code.' });
      return;
    }

    setForgotLoading(true);

    try {
      const data = await authApi.forgotPasswordVerifyOtp(recoveryState.identifier, code);
      setRecoveryState((prev) => ({ ...prev, resetToken: data.resetToken }));
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      setForgotStep(4);
    } catch (err) {
      setForgotError(err.message || 'Invalid or expired verification code.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotResetPassword = async (e) => {
    if (e) e.preventDefault();
    setForgotError('');
    setForgotFieldErrors({});

    if (forgotPwStrength.score < 4) {
      setForgotError('Password must satisfy all 4 criteria below.');
      return;
    }

    if (forgotNewPw !== forgotConfirmPw) {
      setForgotFieldErrors({ confirmPw: 'Passwords do not match.' });
      setForgotError('Passwords do not match.');
      return;
    }

    setForgotLoading(true);

    try {
      await authApi.forgotPasswordReset(
        recoveryState.identifier,
        recoveryState.resetToken,
        forgotNewPw,
        forgotConfirmPw
      );
      setForgotStep(5);
    } catch (err) {
      setForgotError(err.message || 'Password reset failed.');
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    setForgotModalOpen(false);
    setForgotStep(1);
    setForgotIdentifier('');
    setOtpCode('');
    setForgotNewPw('');
    setForgotConfirmPw('');
    setForgotError('');
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Back to Home */}
        <Link to="/" className="back-link">
          <i className="fas fa-arrow-left"></i> Back to Home
        </Link>

        {/* Brand */}
        <div className="login-brand">
          <div className="brand-icon logo-only">
            <img src="/SafeSpace logo v2.svg" alt="SafeSpace Logo" className="brand-logo-img" />
          </div>
          <h1>Safe<span>Space</span></h1>
          <p>Sign in with your credentials</p>
        </div>

        {/* Error / Status Alert Banner */}
        <div
          className={`login-alert ${alert ? `alert-${alert.type} visible` : 'alert-danger'}`}
          id="loginError"
          role="alert"
          aria-live="polite"
          style={{ display: alert ? 'flex' : 'none' }}
        >
          <i className={`login-alert-icon ${alert?.icon || 'fas fa-circle-exclamation'}`} id="loginErrorIcon"></i>
          <span className="login-alert-text" id="loginErrorText">{alert?.text || ''}</span>
        </div>

        {/* Login Form */}
        <form className="auth-form" id="loginForm" onSubmit={handleLogin} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="loginUsername">Student / Employee ID</label>
            <div className={`input-wrapper ${fieldErrors.username ? 'has-error' : ''}`}>
              <i className="fas fa-id-badge input-icon-left"></i>
              <input
                className="form-input input-icon"
                type="text"
                id="loginUsername"
                placeholder="e.g. 2021-00001"
                autoComplete="username"
                value={username}
                disabled={isLocked}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, username: null }));
                  if (!isLocked) setAlert(null);
                }}
              />
            </div>
            {fieldErrors.username && (
              <div className="field-feedback visible" id="loginUsernameFeedback">
                <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.username}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loginPassword">Password</label>
            <div className={`input-wrapper ${fieldErrors.password ? 'has-error' : ''}`}>
              <i className="fas fa-lock input-icon-left"></i>
              <input
                className="form-input input-icon"
                type={showPassword ? 'text' : 'password'}
                id="loginPassword"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                disabled={isLocked}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: null }));
                  if (!isLocked) setAlert(null);
                }}
              />
              <button
                type="button"
                className="input-toggle-pw"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
              >
                <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
              </button>
            </div>
            {fieldErrors.password && (
              <div className="field-feedback visible" id="loginPasswordFeedback">
                <i className="fas fa-circle-exclamation"></i> <span>{fieldErrors.password}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="login-btn"
            id="loginBtn"
            disabled={loading || isLocked}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Signing In...
              </>
            ) : isLocked ? (
              <>
                <i className="fas fa-lock"></i> Locked ({lockoutSeconds}s)
              </>
            ) : (
              <>
                <i className="fas fa-right-to-bracket"></i> Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <i className="fas fa-shield-halved"></i>
          Your identity is protected. All activity is anonymous.
        </div>

        <div className="login-links-bottom">
          <div>
            <a
              href="#forgot"
              className="forgot-link"
              onClick={(e) => {
                e.preventDefault();
                setForgotStep(1);
                setForgotIdentifier(username || '');
                setForgotError('');
                setForgotModalOpen(true);
              }}
            >
              Forgot password?
            </a>
          </div>
          <div>
            Don't have an account? <Link to="/register" className="register-here-link">Register here</Link>
          </div>
        </div>
      </div>

      {/* Force Password Change Overlay */}
      <div
        className="pw-change-overlay"
        id="pwChangeOverlay"
        style={{ display: pwChangeModalOpen ? 'flex' : 'none' }}
      >
        <div className="login-card" style={{ animation: 'modal-slide 0.3s ease' }}>
          <div className="login-brand">
            <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <i className="fas fa-key"></i>
            </div>
            <h1>Change Password</h1>
            <p>You must set a new password before continuing</p>
          </div>

          {pwChangeError && (
            <div className="login-alert alert-danger visible" id="pwChangeError" role="alert">
              <i className="login-alert-icon fas fa-circle-exclamation"></i>
              <span className="login-alert-text">{pwChangeError}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handlePasswordChangeSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="pwCurrent">Current Password</label>
              <div className="input-wrapper">
                <i className="fas fa-lock input-icon-left"></i>
                <input
                  className="form-input input-icon"
                  type="password"
                  id="pwCurrent"
                  placeholder="Enter current password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pwNew">New Password (min. 8 characters)</label>
              <div className="input-wrapper">
                <i className="fas fa-shield-halved input-icon-left"></i>
                <input
                  className="form-input input-icon"
                  type={showNewPw ? 'text' : 'password'}
                  id="pwNew"
                  placeholder="Create a strong password"
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <button
                  type="button"
                  className="input-toggle-pw"
                  onClick={() => setShowNewPw((prev) => !prev)}
                  tabIndex={-1}
                >
                  <i className={showNewPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                </button>
              </div>

              <div className="pw-strength" id="pwStrength">
                <div className={`pw-strength-bar ${pwChangeStrength.score >= 1 ? (pwChangeStrength.score <= 1 ? 'weak' : pwChangeStrength.score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                <div className={`pw-strength-bar ${pwChangeStrength.score >= 2 ? (pwChangeStrength.score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                <div className={`pw-strength-bar ${pwChangeStrength.score >= 3 ? 'strong' : ''}`}></div>
                <div className={`pw-strength-bar ${pwChangeStrength.score >= 4 ? 'strong' : ''}`}></div>
              </div>
              <div className="pw-strength-label" id="pwStrengthLabel" style={{ color: pwChangeStrength.score <= 1 && newPw ? '#ef4444' : pwChangeStrength.score <= 2 ? '#f59e0b' : pwChangeStrength.score >= 3 ? '#10b981' : '' }}>
                {newPw.length === 0 ? '' : pwChangeStrength.score <= 1 ? 'Weak' : pwChangeStrength.score <= 2 ? 'Medium' : pwChangeStrength.score === 3 ? 'Good' : 'Strong'}
              </div>

              <div className="pw-rules" id="pwRules">
                <div className={`pw-rule-item ${pwChangeStrength.hasLen ? 'valid' : ''}`} id="ruleLen">
                  <i className={pwChangeStrength.hasLen ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> At least 8 characters
                </div>
                <div className={`pw-rule-item ${pwChangeStrength.hasUpper ? 'valid' : ''}`} id="ruleUpper">
                  <i className={pwChangeStrength.hasUpper ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> Uppercase letter (A-Z)
                </div>
                <div className={`pw-rule-item ${pwChangeStrength.hasNum ? 'valid' : ''}`} id="ruleNum">
                  <i className={pwChangeStrength.hasNum ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> At least one number (0-9)
                </div>
                <div className={`pw-rule-item ${pwChangeStrength.hasSpecial ? 'valid' : ''}`} id="ruleSpecial">
                  <i className={pwChangeStrength.hasSpecial ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> Special symbol (!@#$%...)
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pwConfirm">Confirm New Password</label>
              <div className="input-wrapper">
                <i className="fas fa-check-double input-icon-left"></i>
                <input
                  className="form-input input-icon"
                  type={showConfirmPw ? 'text' : 'password'}
                  id="pwConfirm"
                  placeholder="Re-enter new password"
                  minLength={8}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
                <button
                  type="button"
                  className="input-toggle-pw"
                  onClick={() => setShowConfirmPw((prev) => !prev)}
                  tabIndex={-1}
                >
                  <i className={showConfirmPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-btn"
              id="pwChangeBtn"
              disabled={pwChangeLoading}
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
            >
              {pwChangeLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Updating Password...
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i> Update Password
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Forgot Password Recovery Modal */}
      <div
        className="pw-change-overlay"
        id="forgotPwOverlay"
        style={{ display: forgotModalOpen ? 'flex' : 'none' }}
      >
        <div className="login-card" style={{ animation: 'modal-slide 0.3s ease', maxWidth: '440px', position: 'relative', maxHeight: '92vh', overflowY: 'auto' }}>
          <button
            type="button"
            className="modal-close-btn"
            onClick={closeForgotModal}
            aria-label="Close"
          >
            <i className="fas fa-xmark"></i>
          </button>

          <div className="login-brand" style={{ marginBottom: '1.5rem' }}>
            <div className="brand-icon">
              <i className="fas fa-key"></i>
            </div>
            <h1>Account <span>Recovery</span></h1>
            <p id="forgotModalSubtitle">
              {forgotStep === 1 && 'Search your account to begin recovery'}
              {forgotStep === 2 && 'Confirm your verified contact channel'}
              {forgotStep === 3 && 'Enter verification code'}
              {forgotStep === 4 && 'Create a new secure password'}
              {forgotStep === 5 && 'Account recovered successfully'}
            </p>
          </div>

          <div className="auth-form" style={{ width: '100%' }}>
            {forgotError && (
              <div className="login-alert alert-danger visible" id="forgotError" role="alert">
                <i className="login-alert-icon fas fa-circle-exclamation" id="forgotErrorIcon"></i>
                <span className="login-alert-text" id="forgotErrorText">{forgotError}</span>
              </div>
            )}

            {/* STEP 1: Account Lookup */}
            {forgotStep === 1 && (
              <div id="forgotStep1">
                <div className="form-group">
                  <label className="form-label" htmlFor="forgotIdentifier">Student / Employee ID</label>
                  <div className={`input-wrapper ${forgotFieldErrors.identifier ? 'has-error' : ''}`}>
                    <i className="fas fa-id-badge input-icon-left"></i>
                    <input
                      className="form-input input-icon"
                      type="text"
                      id="forgotIdentifier"
                      placeholder="e.g. 2021-00001"
                      autoComplete="username"
                      value={forgotIdentifier}
                      onChange={(e) => {
                        setForgotIdentifier(e.target.value);
                        setForgotFieldErrors({});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleForgotLookup();
                        }
                      }}
                    />
                  </div>
                  {forgotFieldErrors.identifier && (
                    <div className="field-feedback visible" id="forgotIdentifierFeedback">
                      <i className="fas fa-circle-exclamation"></i> <span>{forgotFieldErrors.identifier}</span>
                    </div>
                  )}
                  <p style={{ fontSize: '0.75rem', color: '#728590', marginTop: '6px', lineHeight: 1.4 }}>
                    Enter your Institutional ID to search for your registered recovery options.
                  </p>
                </div>

                <button
                  type="button"
                  className="login-btn"
                  id="forgotLookupBtn"
                  onClick={handleForgotLookup}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Searching...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-magnifying-glass"></i> Find Account
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STEP 2: Confirm Registered Email */}
            {forgotStep === 2 && (
              <div id="forgotStep2">
                <p style={{ fontSize: '0.85rem', color: '#51646E', marginBottom: '1rem', fontWeight: 500 }}>
                  We found your account. A 6-digit recovery code will be dispatched to your registered email:
                </p>

                <div className="recovery-option-card selected" style={{ cursor: 'default', marginBottom: '1.25rem' }}>
                  <div className="option-icon-box">
                    <i className="fas fa-envelope"></i>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#182A34' }}>Registered Recovery Email</div>
                    <div style={{ fontSize: '0.85rem', color: '#1e5e3a', fontWeight: 700, marginTop: '2px' }} id="maskedEmailText">
                      {recoveryState.maskedEmail}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', fontWeight: 700, padding: '3px 8px', borderRadius: '12px' }}>
                    Verified
                  </span>
                </div>

                <button
                  type="button"
                  className="login-btn"
                  id="forgotSendOtpBtn"
                  onClick={handleForgotSendOtp}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Sending Code...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane"></i> Send Verification Code
                    </>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="forgot-back-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <i className="fas fa-arrow-left"></i> Change ID
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Enter 6-Digit OTP */}
            {forgotStep === 3 && (
              <div id="forgotStep3">
                <p style={{ fontSize: '0.85rem', color: '#51646E', marginBottom: '1.25rem', lineHeight: 1.4 }}>
                  We sent a 6-digit verification code to <strong id="otpTargetText" style={{ color: '#182A34' }}>{recoveryState.maskedEmail}</strong>. Please check your inbox (and spam folder) and enter the code below:
                </p>

                <div className="form-group" style={{ textAlign: 'center' }}>
                  <label className="form-label" htmlFor="forgotOtpCode" style={{ textAlign: 'center' }}>6-Digit Verification Code</label>
                  <div style={{ maxWidth: '260px', margin: '0.4rem auto 0' }}>
                    <input
                      className={`form-input otp-input-field ${forgotFieldErrors.otp ? 'has-error' : ''}`}
                      type="text"
                      id="forgotOtpCode"
                      maxLength={6}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, ''));
                        setForgotFieldErrors({});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleForgotVerifyOtp();
                        }
                      }}
                    />
                  </div>
                  {forgotFieldErrors.otp && (
                    <div className="field-feedback visible" id="forgotOtpCodeFeedback" style={{ textAlign: 'center', justifyContent: 'center' }}>
                      <i className="fas fa-circle-exclamation"></i> <span>{forgotFieldErrors.otp}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
                  <span style={{ color: '#728590' }}>
                    <i className="fas fa-clock"></i> Expires: <strong id="otpCountdown" style={{ color: '#DC2626' }}>
                      {String(Math.floor(recoveryState.countdownSeconds / 60)).padStart(2, '0')}:{String(recoveryState.countdownSeconds % 60).padStart(2, '0')}
                    </strong>
                  </span>
                  <button
                    type="button"
                    id="resendOtpLink"
                    onClick={handleForgotSendOtp}
                    className="forgot-resend-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Resend Code
                  </button>
                </div>

                <button
                  type="button"
                  className="login-btn"
                  id="forgotVerifyBtn"
                  onClick={handleForgotVerifyOtp}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Verifying...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i> Verify &amp; Continue
                    </>
                  )}
                </button>

                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="forgot-back-link"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <i className="fas fa-arrow-left"></i> Change ID
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Set New Password */}
            {forgotStep === 4 && (
              <div id="forgotStep4">
                <p style={{ fontSize: '0.85rem', color: '#51646E', marginBottom: '1rem', fontWeight: 500 }}>
                  Create a new strong password for your account:
                </p>

                <div className="form-group">
                  <label className="form-label" htmlFor="forgotNewPw">New Password</label>
                  <div className="input-wrapper">
                    <i className="fas fa-lock input-icon-left"></i>
                    <input
                      className="form-input input-icon"
                      type={showForgotNewPw ? 'text' : 'password'}
                      id="forgotNewPw"
                      placeholder="Enter new password"
                      minLength={8}
                      value={forgotNewPw}
                      onChange={(e) => setForgotNewPw(e.target.value)}
                    />
                    <button
                      type="button"
                      className="input-toggle-pw"
                      onClick={() => setShowForgotNewPw((prev) => !prev)}
                      tabIndex={-1}
                    >
                      <i className={showForgotNewPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                    </button>
                  </div>

                  <div className="pw-strength" id="forgotPwStrength">
                    <div className={`pw-strength-bar ${forgotPwStrength.score >= 1 ? (forgotPwStrength.score <= 1 ? 'weak' : forgotPwStrength.score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                    <div className={`pw-strength-bar ${forgotPwStrength.score >= 2 ? (forgotPwStrength.score <= 2 ? 'medium' : 'strong') : ''}`}></div>
                    <div className={`pw-strength-bar ${forgotPwStrength.score >= 3 ? 'strong' : ''}`}></div>
                    <div className={`pw-strength-bar ${forgotPwStrength.score >= 4 ? 'strong' : ''}`}></div>
                  </div>
                  <div className="pw-strength-label" id="forgotPwStrengthLabel" style={{ color: forgotPwStrength.score <= 1 && forgotNewPw ? '#ef4444' : forgotPwStrength.score <= 2 ? '#f59e0b' : forgotPwStrength.score >= 3 ? '#10b981' : '' }}>
                    {forgotNewPw.length === 0 ? '' : forgotPwStrength.score <= 1 ? 'Weak' : forgotPwStrength.score <= 2 ? 'Medium' : forgotPwStrength.score === 3 ? 'Good' : 'Strong'}
                  </div>

                  <div className="pw-rules" id="forgotPwRules">
                    <div className={`pw-rule-item ${forgotPwStrength.hasLen ? 'valid' : ''}`} id="forgotRuleLen">
                      <i className={forgotPwStrength.hasLen ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> At least 8 characters
                    </div>
                    <div className={`pw-rule-item ${forgotPwStrength.hasUpper ? 'valid' : ''}`} id="forgotRuleUpper">
                      <i className={forgotPwStrength.hasUpper ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> Uppercase letter (A-Z)
                    </div>
                    <div className={`pw-rule-item ${forgotPwStrength.hasNum ? 'valid' : ''}`} id="forgotRuleNum">
                      <i className={forgotPwStrength.hasNum ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> At least one number (0-9)
                    </div>
                    <div className={`pw-rule-item ${forgotPwStrength.hasSpecial ? 'valid' : ''}`} id="forgotRuleSpecial">
                      <i className={forgotPwStrength.hasSpecial ? 'fas fa-circle-check' : 'fas fa-circle-dot'}></i> Special symbol (!@#$%...)
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="forgotConfirmPw">Confirm New Password</label>
                  <div className={`input-wrapper ${forgotFieldErrors.confirmPw ? 'has-error' : ''}`}>
                    <i className="fas fa-check-double input-icon-left"></i>
                    <input
                      className="form-input input-icon"
                      type={showForgotConfirmPw ? 'text' : 'password'}
                      id="forgotConfirmPw"
                      placeholder="Re-enter new password"
                      minLength={8}
                      value={forgotConfirmPw}
                      onChange={(e) => {
                        setForgotConfirmPw(e.target.value);
                        setForgotFieldErrors({});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleForgotResetPassword();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="input-toggle-pw"
                      onClick={() => setShowForgotConfirmPw((prev) => !prev)}
                      tabIndex={-1}
                    >
                      <i className={showForgotConfirmPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
                    </button>
                  </div>
                  {forgotFieldErrors.confirmPw && (
                    <div className="field-feedback visible" id="forgotConfirmPwFeedback">
                      <i className="fas fa-circle-exclamation"></i> <span>{forgotFieldErrors.confirmPw}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="login-btn"
                  id="forgotResetBtn"
                  onClick={handleForgotResetPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Resetting...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-shield-halved"></i> Reset Password
                    </>
                  )}
                </button>
              </div>
            )}

            {/* STEP 5: Success */}
            {forgotStep === 5 && (
              <div id="forgotStep5" style={{ textAlign: 'center' }}>
                <div style={{ width: '4.5rem', height: '4.5rem', borderRadius: '1rem', background: 'linear-gradient(135deg, #243E4C 0%, #1A313D 100%)', color: '#7E9F9D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', margin: '0.5rem auto 1.25rem', boxShadow: '0 8px 22px rgba(24, 42, 52, 0.2)' }}>
                  <i className="fas fa-check"></i>
                </div>
                <h2 style={{ fontSize: '1.35rem', color: '#182A34', marginBottom: '0.5rem' }}>Password Reset Complete!</h2>
                <p style={{ fontSize: '0.85rem', color: '#51646E', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Your account password has been successfully updated. You can now sign in with your new credentials.
                </p>

                <button
                  type="button"
                  className="login-btn"
                  onClick={() => {
                    closeForgotModal();
                    setPassword('');
                  }}
                >
                  <i className="fas fa-right-to-bracket"></i> Sign In to SafeSpace
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
