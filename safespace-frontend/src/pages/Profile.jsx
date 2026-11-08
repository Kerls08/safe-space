import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getInitials } from '../context/AuthContext';
import { profileApi, authApi, getToken } from '../services/api';
import '../styles/auth.css';
import '../styles/profile.css';


function formatRole(role) {
  const map = {
    'STUDENT': 'Student',
    'PROFESSIONAL': 'Mental Health Professional',
    'SUPER_ADMIN': 'Mental Health Professional',
    'MAINTENANCE': 'System Maintenance (IT Developer)',
    'ADMIN': 'System Administrator'
  };
  return map[role] || role || 'Student';
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

export default function Profile() {
  const { role, username: authUsername, fullName: authFullName, token, updateProfilePicture } = useAuth();
  const isProfessional = role === 'PROFESSIONAL' || role === 'SUPER_ADMIN';

  // Profile data & original data for reset
  const [profileData, setProfileData] = useState(null);
  const [originalData, setOriginalData] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Profile picture upload state
  const fileInputRef = useRef(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [fieldUsername, setFieldUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Change Password Modal
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwRulesHasError, setPwRulesHasError] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // Load profile data
  const loadProfile = useCallback(async () => {
    try {
      const data = await profileApi.getMe();
      setProfileData(data);
      setOriginalData(data);
      setFullName(data.fullName || '');
      setEmail(data.email || '');
      setDepartment(data.department || '');
      setYearLevel(data.yearLevel || '');
      setFieldUsername(data.username || authUsername || '');
      if (data.profilePicture !== undefined) {
        updateProfilePicture(data.profilePicture);
      }
    } catch (err) {
      console.error('Profile load error:', err);
      showToast('Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, [authUsername, updateProfilePicture]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Profile Picture Handlers (Professionals Only)
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so selecting the same file triggers change
    e.target.value = '';

    if (!file.type.match(/^image\/(jpeg|png|webp)$/i)) {
      showToast('Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size must be less than 5 MB.');
      return;
    }

    setPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Crop and resize to square 320x320 centered
          const canvas = document.createElement('canvas');
          const size = 320;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const base64Data = canvas.toDataURL('image/jpeg', 0.85);

          const updated = await profileApi.updateAvatar(base64Data);
          const newPhoto = updated.profilePicture || base64Data;
          setProfileData((prev) => (prev ? { ...prev, profilePicture: newPhoto } : prev));
          updateProfilePicture(newPhoto);
          showToast('Profile photo updated.');
        } catch (err) {
          console.error('Failed to update avatar:', err);
          showToast(err.message || 'Failed to update photo.');
        } finally {
          setPhotoLoading(false);
        }
      };
      img.onerror = () => {
        setPhotoLoading(false);
        showToast('Failed to process image file.');
      };
      img.src = readerEvent.target.result;
    };
    reader.onerror = () => {
      setPhotoLoading(false);
      showToast('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (!profileData?.profilePicture) return;
    setPhotoLoading(true);
    try {
      await profileApi.deleteAvatar();
      setProfileData((prev) => (prev ? { ...prev, profilePicture: null } : prev));
      updateProfilePicture(null);
      showToast('Profile photo removed.');
    } catch (err) {
      console.error('Failed to remove photo:', err);
      showToast(err.message || 'Failed to remove photo.');
    } finally {
      setPhotoLoading(false);
    }
  };

  // Handle Save
  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const body = {
        username: fieldUsername.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        department: department.trim(),
        yearLevel: yearLevel.trim()
      };

      const updated = await profileApi.updateProfile(body);
      const merged = { ...profileData, ...updated, ...body };
      setProfileData(merged);
      setOriginalData(merged);

      // Synchronize session values
      if (merged.fullName) {
        localStorage.setItem('ss_fullName', merged.fullName);
        sessionStorage.setItem('ss_fullName', merged.fullName);
      }
      if (merged.username) {
        localStorage.setItem('ss_username', merged.username);
        sessionStorage.setItem('ss_username', merged.username);
      }

      showToast('Profile updated successfully ✓');
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Reset Form
  const handleReset = () => {
    setFullName(originalData.fullName || '');
    setEmail(originalData.email || '');
    setDepartment(originalData.department || '');
    setYearLevel(originalData.yearLevel || '');
    setFieldUsername(originalData.username || authUsername || '');
    showToast('Form reset to original values.');
  };


  // Password calculations
  const pwHasLen = newPw.length >= 8;
  const pwHasUpper = /[A-Z]/.test(newPw);
  const pwHasNum = /[0-9]/.test(newPw);
  const pwHasSpecial = /[^A-Za-z0-9]/.test(newPw);

  let pwScore = 0;
  if (pwHasLen) pwScore++;
  if (pwHasUpper) pwScore++;
  if (pwHasNum) pwScore++;
  if (pwHasSpecial) pwScore++;

  let pwStrengthLabel = '';
  let pwStrengthColor = '';
  if (newPw.length > 0) {
    if (pwScore <= 1) {
      pwStrengthLabel = 'Weak';
      pwStrengthColor = '#ef4444';
    } else if (pwScore <= 2) {
      pwStrengthLabel = 'Medium';
      pwStrengthColor = '#f59e0b';
    } else if (pwScore === 3) {
      pwStrengthLabel = 'Good';
      pwStrengthColor = '#10b981';
    } else {
      pwStrengthLabel = 'Strong';
      pwStrengthColor = '#10b981';
    }
  }

  // Change Password Modal Controls
  const openChangePasswordModal = () => {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setPwError('');
    setPwRulesHasError(false);
    setAttemptedSubmit(false);
    setPwModalOpen(true);
  };

  const closeChangePasswordModal = () => {
    setPwModalOpen(false);
  };

  // Escape key handler
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && pwModalOpen) {
        closeChangePasswordModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pwModalOpen]);

  const submitChangePassword = async (e) => {
    e.preventDefault();
    setAttemptedSubmit(true);
    setPwError('');
    setPwRulesHasError(false);

    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All fields are required.');
      return;
    }

    const missing = [];
    if (!pwHasLen) missing.push('at least 8 characters');
    if (!pwHasUpper) missing.push('uppercase letter (A-Z)');
    if (!pwHasNum) missing.push('at least one number (0-9)');
    if (!pwHasSpecial) missing.push('special symbol (!@#$%...)');

    if (missing.length > 0) {
      setPwRulesHasError(true);
      setPwError(`Password rejected: does not comply with requirements. Missing: ${missing.join(', ')}.`);
      return;
    }

    if (newPw !== confirmPw) {
      setPwError('New passwords do not match.');
      return;
    }

    setPwLoading(true);
    try {
      const activeToken = token || getToken();
      const currentUsername = profileData?.username || authUsername;
      await authApi.changePassword(activeToken, currentUsername, currentPw, newPw);

      closeChangePasswordModal();
      showToast('Password changed successfully ✓');

      // Update security status in state
      setProfileData((prev) => prev ? { ...prev, passwordChanged: true } : prev);
    } catch (err) {
      setPwError(err.message || 'Password change failed');
    } finally {
      setPwLoading(false);
    }
  };

  // Avatar initials
  const initials = getInitials(fullName || authFullName || authUsername || '?');

  if (loading) {
    return (
      <div className="profile-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#51646E' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '1rem', color: '#243E4C' }}></i>
          <p style={{ fontWeight: 600 }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-layout">
      {/* Toast Notification */}
      {toast && (
        <div className="profile-toast" role="status" aria-live="polite">
          <i className="fas fa-check" aria-hidden="true"></i>
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="profile-header" id="profileHeader">
        <div
          className="profile-avatar"
          id="profileAvatar"
          style={isProfessional && !profileData?.profilePicture ? { background: 'linear-gradient(135deg, #7E9F9D, #243E4C)' } : {}}
        >
          {isProfessional && profileData?.profilePicture ? (
            <img
              src={profileData.profilePicture}
              alt={fullName || 'Profile'}
              className="profile-avatar-img"
            />
          ) : (
            initials
          )}
        </div>
        <div className="profile-header-name" id="profileName">
          {fullName || authFullName || authUsername || 'Unknown'}
        </div>
        <div className="profile-header-role" id="profileRole">
          <i className="fas fa-shield-halved"></i>{' '}
          <span id="profileRoleText">{formatRole(profileData?.role || role)}</span>
        </div>
        <div className="profile-header-id" id="profileHeaderId">
          {profileData?.institutionalId || ''}
        </div>
        {isProfessional && (
          <div className="profile-avatar-actions">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
              aria-label="Upload profile photo"
            />
            <button
              type="button"
              className="profile-avatar-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoLoading}
            >
              <i className="fas fa-camera" aria-hidden="true"></i>
              <span>{photoLoading ? 'Processing...' : profileData?.profilePicture ? 'Change photo' : 'Upload photo'}</span>
            </button>
            {profileData?.profilePicture && !photoLoading && (
              <button
                type="button"
                className="profile-avatar-action-btn remove"
                onClick={handleRemovePhoto}
                disabled={photoLoading}
              >
                <i className="fas fa-trash-can" aria-hidden="true"></i>
                <span>Remove photo</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="profile-content">
        {/* Personal Information Card */}
        <div className="profile-card">
          <h3>
            <i className="fas fa-user-pen"></i> Personal Information
          </h3>
          <form id="profileForm" onSubmit={handleSave} autoComplete="off">
            <div className="profile-form-grid">
              <div className="profile-field">
                <label htmlFor="fieldFullName">Full Name</label>
                <input
                  type="text"
                  id="fieldFullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="profile-field">
                <label htmlFor="fieldEmail">Email Address</label>
                <input
                  type="email"
                  id="fieldEmail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@school.edu"
                />
              </div>
              <div className="profile-field" id="fieldDeptWrap">
                <label htmlFor="fieldDepartment" id="labelDepartment">
                  {isProfessional ? 'Specialization' : 'Department / Program'}
                </label>
                <input
                  type="text"
                  id="fieldDepartment"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={isProfessional ? 'e.g. Clinical Psychology' : 'e.g. Computer Science'}
                />
              </div>
              <div className="profile-field" id="fieldYearWrap">
                <label htmlFor="fieldYearLevel" id="labelYearLevel">
                  {isProfessional ? 'License / PRC No.' : 'Year Level'}
                </label>
                <input
                  type="text"
                  id="fieldYearLevel"
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                  placeholder={isProfessional ? 'e.g. PRC-0012345' : 'e.g. 3rd Year'}
                />
              </div>
            </div>

            {/* Read-Only & Username Fields */}
            <div className="profile-form-grid" style={{ marginTop: '1rem' }}>
              <div className="profile-field">
                <label>Institutional ID</label>
                <input
                  type="text"
                  id="fieldInstId"
                  value={profileData?.institutionalId || ''}
                  readOnly
                  className="readonly"
                />
              </div>
              <div className="profile-field">
                <label htmlFor="fieldUsername">Username</label>
                <input
                  type="text"
                  id="fieldUsername"
                  value={fieldUsername}
                  onChange={(e) => setFieldUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="profile-actions">
              <button type="button" className="btn-profile-secondary" onClick={handleReset}>
                <i className="fas fa-undo"></i> Reset
              </button>
              <button type="submit" className="btn-profile-save" id="saveBtn" disabled={isSaving}>
                {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}{' '}
                Save Changes
              </button>
            </div>
          </form>
        </div>


        {/* Account Security Card */}
        <div className="profile-card">
          <h3>
            <i className="fas fa-shield-check"></i> Account Security
          </h3>

          <div className="security-row">
            <span className="security-label">Password Status</span>
            <span className={`security-value ${profileData?.passwordChanged ? 'changed' : 'pending'}`} id="secPasswordStatus">
              {profileData?.passwordChanged ? (
                <>
                  <i className="fas fa-circle-check" style={{ color: '#10b981' }}></i> Changed
                </>
              ) : (
                <>
                  <i className="fas fa-clock" style={{ color: '#d97706' }}></i> Pending Change
                </>
              )}
            </span>
          </div>

          <div className="security-row">
            <span className="security-label">Account Status</span>
            <span className="security-value" id="secAccountStatus">
              <span className={`security-badge ${profileData?.active !== false ? 'active' : 'inactive'}`}>
                <i className="fas fa-circle"></i> {profileData?.active !== false ? 'Active' : 'Inactive'}
              </span>
            </span>
          </div>

          <div className="security-row">
            <span className="security-label">Last Login</span>
            <span className="security-value" id="secLastLogin">
              {profileData?.lastLoginAt ? formatDateTime(profileData.lastLoginAt) : 'Never'}
            </span>
          </div>

          <div className="security-row">
            <span className="security-label">Account Created</span>
            <span className="security-value" id="secCreatedAt">
              {profileData?.createdAt ? formatDateTime(profileData.createdAt) : 'N/A'}
            </span>
          </div>

          <div className="profile-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-profile-secondary" onClick={openChangePasswordModal}>
              <i className="fas fa-key"></i> Change Password
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {pwModalOpen && (
        <div className="pw-modal-overlay" id="pwModal" onClick={closeChangePasswordModal}>
          <div className="pw-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <i className="fas fa-key"></i> Change Password
            </h3>
            <form onSubmit={submitChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="profile-field">
                <label htmlFor="pwCurrent">Current Password</label>
                <div className="profile-pw-wrapper">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    id="pwCurrent"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    className="profile-pw-toggle"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    title={showCurrentPw ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas ${showCurrentPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              <div className="profile-field">
                <label htmlFor="pwNew">New Password (min. 8 characters)</label>
                <div className="profile-pw-wrapper">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    id="pwNew"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Create a strong password"
                    required
                  />
                  <button
                    type="button"
                    className="profile-pw-toggle"
                    onClick={() => setShowNewPw(!showNewPw)}
                    title={showNewPw ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas ${showNewPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>

                {/* Password Strength Meter */}
                <div className="pw-strength" id="profilePwStrength">
                  <div className={`pw-strength-bar ${pwScore >= 1 ? (pwScore <= 1 ? 'weak' : pwScore <= 2 ? 'medium' : 'strong') : ''}`}></div>
                  <div className={`pw-strength-bar ${pwScore >= 2 ? (pwScore <= 2 ? 'medium' : 'strong') : ''}`}></div>
                  <div className={`pw-strength-bar ${pwScore >= 3 ? 'strong' : ''}`}></div>
                  <div className={`pw-strength-bar ${pwScore >= 4 ? 'strong' : ''}`}></div>
                </div>
                <div className="pw-strength-label" id="profilePwStrengthLabel" style={{ color: pwStrengthColor }}>
                  {pwStrengthLabel}
                </div>

                {/* Password Rules Checklist */}
                <div className={`pw-rules ${pwRulesHasError ? 'has-error' : ''}`} id="profilePwRules">
                  <div className={`pw-rule-item ${pwHasLen ? 'valid' : (attemptedSubmit && !pwHasLen ? 'invalid' : '')}`} id="profRuleLen">
                    <i className={`fas ${pwHasLen ? 'fa-circle-check' : (attemptedSubmit && !pwHasLen ? 'fa-circle-xmark' : 'fa-circle-dot')}`}></i> At least 8 characters
                  </div>
                  <div className={`pw-rule-item ${pwHasUpper ? 'valid' : (attemptedSubmit && !pwHasUpper ? 'invalid' : '')}`} id="profRuleUpper">
                    <i className={`fas ${pwHasUpper ? 'fa-circle-check' : (attemptedSubmit && !pwHasUpper ? 'fa-circle-xmark' : 'fa-circle-dot')}`}></i> Uppercase letter (A-Z)
                  </div>
                  <div className={`pw-rule-item ${pwHasNum ? 'valid' : (attemptedSubmit && !pwHasNum ? 'invalid' : '')}`} id="profRuleNum">
                    <i className={`fas ${pwHasNum ? 'fa-circle-check' : (attemptedSubmit && !pwHasNum ? 'fa-circle-xmark' : 'fa-circle-dot')}`}></i> At least one number (0-9)
                  </div>
                  <div className={`pw-rule-item ${pwHasSpecial ? 'valid' : (attemptedSubmit && !pwHasSpecial ? 'invalid' : '')}`} id="profRuleSpecial">
                    <i className={`fas ${pwHasSpecial ? 'fa-circle-check' : (attemptedSubmit && !pwHasSpecial ? 'fa-circle-xmark' : 'fa-circle-dot')}`}></i> Special symbol (!@#$%...)
                  </div>
                </div>
              </div>

              <div className="profile-field">
                <label htmlFor="pwConfirm">Confirm New Password</label>
                <div className="profile-pw-wrapper">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    id="pwConfirm"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                  />
                  <button
                    type="button"
                    className="profile-pw-toggle"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    title={showConfirmPw ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas ${showConfirmPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>

              {pwError && (
                <div id="pwError" style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>
                  {pwError}
                </div>
              )}

              <div className="profile-actions">
                <button type="button" className="btn-profile-secondary" onClick={closeChangePasswordModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-profile-save" id="pwSubmitBtn" disabled={pwLoading}>
                  {pwLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}{' '}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
