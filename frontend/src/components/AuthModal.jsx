import React, { useEffect, useState } from 'react';
import { User, Phone, MapPin, X, ArrowRight, UserCheck, Mail, Lock, Users } from 'lucide-react';

const emptyProfile = {
  firstName: '', middleName: '', lastName: '', mobile: '', email: '', password: '', province: '', cityMunicipality: '',
  barangay: '', purokStreet: '', householdSize: '', civilStatus: '', sex: '',
  birthDate: '', occupation: '', beneficiaryCategory: '', idNumber: '', spouseName: '', childrenCount: ''
};

export default function AuthModal({
  isOpen, onClose, onAuth, onProfileUpdate, onContinueAsGuest, user, csrfToken, initialMode = 'signin', t = (k) => k
}) {
  const [mode, setMode] = useState(initialMode);
  const [formData, setFormData] = useState(emptyProfile);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isProfile = mode === 'profile';

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setError('');
    setFormData({ ...emptyProfile, ...(user && !user.isGuest ? {
      firstName: user.firstName || '', middleName: user.middleName || '', lastName: user.lastName || '',
      mobile: user.mobile || '', email: user.email || '',
      province: user.province || '', cityMunicipality: user.cityMunicipality || '',
      barangay: user.barangay || '', purokStreet: user.purokStreet || '',
      householdSize: user.householdSize ?? '', civilStatus: user.civilStatus || '',
      sex: user.sex || '', birthDate: user.birthDate || '', occupation: user.occupation || '',
      beneficiaryCategory: user.beneficiaryCategory || '', idNumber: user.idNumber || '',
      spouseName: user.spouseName || '', childrenCount: user.childrenCount ?? ''
    } : {}) });
  }, [isOpen, initialMode, user]);

  if (!isOpen) return null;

  const update = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isProfile) {
        await onProfileUpdate(formData);
      } else {
        await onAuth(mode, {
          firstName: formData.firstName,
          middleName: formData.middleName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
          mobile: formData.mobile,
          province: formData.province,
          cityMunicipality: formData.cityMunicipality,
          barangay: formData.barangay,
          purokStreet: formData.purokStreet,
          householdSize: formData.householdSize,
          civilStatus: formData.civilStatus,
          sex: formData.sex,
          birthDate: formData.birthDate,
          occupation: formData.occupation,
          beneficiaryCategory: formData.beneficiaryCategory,
          idNumber: formData.idNumber,
          spouseName: formData.spouseName,
          childrenCount: formData.childrenCount
        });
      }
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Unable to save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card auth-sheet ${isProfile ? 'profile-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="auth-sheet-header">
          <div>
            <span className="auth-sheet-eyebrow">{isProfile ? 'ACCOUNT' : 'ALALAI'}</span>
            <h3>{isProfile ? 'Edit Profile' : mode === 'signup' ? 'Create Account' : 'Welcome back'}</h3>
          </div>
          <button type="button" className="auth-close-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {!isProfile && (
          <div className="auth-mode-toggle" role="tablist">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-body">
          {mode !== 'signin' && (
            <div className="profile-section">
              <p className="form-section-label"><User size={15} /> Personal information</p>
              <div className="name-fields">
                <label className="auth-field"><span>First name *</span><input type="text" name="firstName" required minLength="2" placeholder="First name" value={formData.firstName} onChange={update} autoComplete="given-name" /></label>
                <label className="auth-field"><span>Middle name</span><input type="text" name="middleName" placeholder="Optional" value={formData.middleName} onChange={update} autoComplete="additional-name" /></label>
                <label className="auth-field"><span>Last name *</span><input type="text" name="lastName" required minLength="2" placeholder="Last name" value={formData.lastName} onChange={update} autoComplete="family-name" /></label>
              </div>
            </div>
          )}
          {!isProfile && (
            <>
              <div className="auth-field">
                <label><Mail size={14} /> Email address *</label>
                <input type="email" name="email" required value={formData.email} onChange={update} autoComplete="email" />
              </div>
              <div className="auth-field">
                <label><Lock size={14} /> Password *</label>
                <input type="password" name="password" required minLength="12" value={formData.password} onChange={update} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                {mode === 'signup' && <small>Use at least 12 characters.</small>}
              </div>
            </>
          )}
          {isProfile && <div className="auth-field"><label><Mail size={14} /> Email address</label><input type="email" value={formData.email} disabled /></div>}
          <div className="auth-field">
            <label><Phone size={14} /> Contact number{isProfile ? ' *' : ''}</label>
            <input type="tel" name="mobile" required={isProfile} value={formData.mobile} onChange={update} />
          </div>

          {(isProfile || mode === 'signup') && (
            <>
              <div className="auth-section">
                <p className="form-section-label"><MapPin size={15} /> Address {!isProfile && '(Optional)'}</p>
                <div className="form-grid">
                  <label className="auth-field"><span>Province</span><input type="text" name="province" placeholder="Add province" value={formData.province} onChange={update} /></label>
                  <label className="auth-field"><span>City / Municipality</span><input type="text" name="cityMunicipality" placeholder="Add city" value={formData.cityMunicipality} onChange={update} /></label>
                </div>
                <div className="form-grid">
                  <label className="auth-field"><span>Barangay</span><input type="text" name="barangay" placeholder="Add barangay" value={formData.barangay} onChange={update} /></label>
                  <label className="auth-field"><span>Purok / Street</span><input type="text" name="purokStreet" placeholder="Add street" value={formData.purokStreet} onChange={update} /></label>
                </div>
              </div>
              {(isProfile || mode === 'signup') && (
                <div className="auth-section">
                  <p className="form-section-label"><Users size={15} /> Household and eligibility details {!isProfile && '(Optional)'}</p>
                  <div className="form-grid">
                    <label className="auth-field"><span>Household size</span><input type="number" min="1" name="householdSize" placeholder="Add size" value={formData.householdSize} onChange={update} /></label>
                    <label className="auth-field"><span>Number of children</span><input type="number" min="0" name="childrenCount" placeholder="Add count" value={formData.childrenCount} onChange={update} /></label>
                  </div>
                  <div className="form-grid">
                    <label className="auth-field"><span>Civil status</span><input type="text" name="civilStatus" placeholder="Add status" value={formData.civilStatus} onChange={update} /></label>
                    <label className="auth-field"><span>Sex</span><input type="text" name="sex" placeholder="Add sex" value={formData.sex} onChange={update} /></label>
                  </div>
                  <div className="form-grid">
                    <label className="auth-field"><span>Occupation / livelihood</span><input type="text" name="occupation" placeholder="Add occupation" value={formData.occupation} onChange={update} /></label>
                    <label className="auth-field"><span>Beneficiary category</span><input type="text" name="beneficiaryCategory" placeholder="Add category" value={formData.beneficiaryCategory} onChange={update} /></label>
                  </div>
                  <div className="form-grid">
                    <label className="auth-field"><span>Valid ID number</span><input type="text" name="idNumber" placeholder="Add ID number" value={formData.idNumber} onChange={update} /></label>
                    <label className="auth-field"><span>Spouse name</span><input type="text" name="spouseName" placeholder="Optional" value={formData.spouseName} onChange={update} /></label>
                  </div>
                  <label className="auth-field"><span>Birth date</span><input type="date" name="birthDate" aria-label="Birth date" value={formData.birthDate} onChange={update} /></label>
                </div>
              )}
            </>
          )}
          </div>
          <div className="auth-form-actions">
            <button type="submit" disabled={saving} className="auth-primary-action">
              {saving ? 'Saving...' : isProfile ? 'Save changes' : mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16} />
            </button>
            {!isProfile && <button type="button" className="auth-secondary-action" onClick={() => { onContinueAsGuest(); onClose(); }}>Continue as Guest</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
