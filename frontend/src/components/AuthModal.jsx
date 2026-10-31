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
          mobile: formData.mobile
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
      <div className={`modal-card ${isProfile ? 'profile-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCheck size={22} color="var(--primary)" />
            <div>
              <h3>{isProfile ? 'Edit your profile' : mode === 'signup' ? 'Create your account' : 'Sign in'}</h3>
              <p style={{ fontSize: 14, color: 'var(--slate-500)' }}>
                {isProfile ? 'Keep these details ready for future applications.' : 'Your saved details will autofill your forms.'}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {!isProfile && (
          <div className="auth-mode-toggle" role="tablist">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign up</button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode !== 'signin' && (
            <div className="profile-section">
              <p className="form-section-label"><User size={15} /> Name</p>
              <div className="name-fields">
                <input type="text" name="firstName" required minLength="2" placeholder="First name" value={formData.firstName} onChange={update} className="form-input" autoComplete="given-name" />
                <input type="text" name="middleName" placeholder="Middle name (optional)" value={formData.middleName} onChange={update} className="form-input" autoComplete="additional-name" />
                <input type="text" name="lastName" required minLength="2" placeholder="Last name" value={formData.lastName} onChange={update} className="form-input" autoComplete="family-name" />
              </div>
            </div>
          )}
          {!isProfile && (
            <>
              <div className="form-group">
                <label className="form-label"><Mail size={15} /> Email *</label>
                <input type="email" name="email" required value={formData.email} onChange={update} className="form-input" autoComplete="email" />
              </div>
              <div className="form-group">
                <label className="form-label"><Lock size={15} /> Password *</label>
                <input type="password" name="password" required minLength="12" value={formData.password} onChange={update} className="form-input" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                {mode === 'signup' && <small>Use at least 12 characters.</small>}
              </div>
            </>
          )}
          {isProfile && <div className="form-group"><label className="form-label"><Mail size={15} /> Email</label><input type="email" value={formData.email} className="form-input" disabled /></div>}
          <div className="form-group">
            <label className="form-label"><Phone size={15} /> Contact number *</label>
            <input type="tel" name="mobile" required value={formData.mobile} onChange={update} className="form-input" />
          </div>

          {(isProfile || mode === 'signup') && (
            <>
              <p className="form-section-label"><MapPin size={15} /> Address</p>
              <div className="form-grid">
                <input type="text" name="province" placeholder="Province" value={formData.province} onChange={update} className="form-input" />
                <input type="text" name="cityMunicipality" placeholder="City / Municipality" value={formData.cityMunicipality} onChange={update} className="form-input" />
              </div>
              <div className="form-grid">
                <input type="text" name="barangay" placeholder="Barangay" value={formData.barangay} onChange={update} className="form-input" />
                <input type="text" name="purokStreet" placeholder="Purok / Street" value={formData.purokStreet} onChange={update} className="form-input" />
              </div>
              {isProfile && (
                <>
                  <p className="form-section-label"><Users size={15} /> Household and eligibility details</p>
                  <div className="form-grid">
                    <input type="number" min="1" name="householdSize" placeholder="Household size" value={formData.householdSize} onChange={update} className="form-input" />
                    <input type="number" min="0" name="childrenCount" placeholder="Number of children" value={formData.childrenCount} onChange={update} className="form-input" />
                  </div>
                  <div className="form-grid">
                    <input type="text" name="civilStatus" placeholder="Civil status" value={formData.civilStatus} onChange={update} className="form-input" />
                    <input type="text" name="sex" placeholder="Sex" value={formData.sex} onChange={update} className="form-input" />
                  </div>
                  <div className="form-grid">
                    <input type="text" name="occupation" placeholder="Occupation / livelihood" value={formData.occupation} onChange={update} className="form-input" />
                    <input type="text" name="beneficiaryCategory" placeholder="Beneficiary category" value={formData.beneficiaryCategory} onChange={update} className="form-input" />
                  </div>
                  <div className="form-grid">
                    <input type="text" name="idNumber" placeholder="Valid ID number" value={formData.idNumber} onChange={update} className="form-input" />
                    <input type="text" name="spouseName" placeholder="Spouse name (optional)" value={formData.spouseName} onChange={update} className="form-input" />
                  </div>
                  <div className="form-grid">
                    <input type="date" name="birthDate" aria-label="Birth date" value={formData.birthDate} onChange={update} className="form-input" />
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="submit" disabled={saving} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
              {saving ? 'Saving...' : isProfile ? 'Save profile' : mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16} />
            </button>
            {!isProfile && <button type="button" className="btn btn-secondary btn-lg" style={{ width: '100%' }} onClick={() => { onContinueAsGuest(); onClose(); }}>Continue as Guest</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
