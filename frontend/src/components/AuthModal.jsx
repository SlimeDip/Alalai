import React, { useEffect, useState } from 'react';
import { User, Phone, MapPin, X, ArrowRight, UserCheck, Mail, Lock, Users } from 'lucide-react';
import LocationFields from './LocationFields';
import {
  CIVIL_STATUS_OPTIONS,
  OCCUPATION_SUGGESTIONS,
  SEX_OPTIONS,
  withCurrentValue
} from '../utils/profileOptions';

function SelectField({ label, name, value, onChange, options, placeholder, autoComplete }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <select name={name} value={value} onChange={onChange} autoComplete={autoComplete}>
        <option value="">{placeholder}</option>
        {withCurrentValue(options, value).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

const emptyProfile = {
  firstName: '', middleName: '', lastName: '', mobile: '', email: '', password: '', province: '', cityMunicipality: '',
  barangay: '', purokStreet: '', householdSize: '', civilStatus: '', sex: '',
  birthDate: '', occupation: '', beneficiaryCategory: '', idNumber: '', spouseName: '', childrenCount: ''
};

const REMEMBERED_EMAIL_KEY = 'alalai_remembered_email';

function readRememberedEmail() {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function writeRememberedEmail(email) {
  try {
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch { /* storage unavailable */ }
}

export default function AuthModal({
  isOpen, onClose, onAuth, onProfileUpdate, onContinueAsGuest, user, csrfToken, initialMode = 'signin'
}) {
  const [mode, setMode] = useState(initialMode);
  const [formData, setFormData] = useState(emptyProfile);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(readRememberedEmail()));
  const isProfile = mode === 'profile';

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setError('');
    const rememberedEmail = readRememberedEmail();
    setRememberEmail(Boolean(rememberedEmail));
    setFormData({ ...emptyProfile, email: rememberedEmail, ...(user && !user.isGuest ? {
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
        // Only the email is remembered (never the password), and only if the user opts in.
        writeRememberedEmail(rememberEmail ? formData.email.trim() : '');
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

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on" name={mode}>
          <div className="auth-form-body">
          {mode !== 'signin' && (
            <div className="profile-section">
              <p className="form-section-label"><User size={15} /> Personal information</p>
              <div className="name-fields">
                <label className="auth-field"><span>First name *</span><input type="text" id="auth-first-name" name="firstName" required minLength="2" autoCapitalize="words" placeholder="First name" value={formData.firstName} onChange={update} autoComplete="given-name" /></label>
                <label className="auth-field"><span>Middle name</span><input type="text" id="auth-middle-name" name="middleName" autoCapitalize="words" placeholder="Optional" value={formData.middleName} onChange={update} autoComplete="additional-name" /></label>
                <label className="auth-field"><span>Last name *</span><input type="text" id="auth-last-name" name="lastName" required minLength="2" autoCapitalize="words" placeholder="Last name" value={formData.lastName} onChange={update} autoComplete="family-name" /></label>
              </div>
            </div>
          )}
          {!isProfile && (
            <>
              <div className="auth-field">
                <label htmlFor="auth-email"><Mail size={14} /> Email address *</label>
                <input
                  id="auth-email"
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={update}
                  autoComplete={mode === 'signup' ? 'email' : 'username'}
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="auth-password"><Lock size={14} /> Password *</label>
                <input
                  id="auth-password"
                  type="password"
                  name="password"
                  required
                  minLength="12"
                  value={formData.password}
                  onChange={update}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  autoCapitalize="none"
                />
                {mode === 'signup' && <small>Use at least 12 characters. Your browser can suggest and save a strong one.</small>}
              </div>
              {mode === 'signin' && (
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(event) => setRememberEmail(event.target.checked)}
                  />
                  <span>Remember my email on this device</span>
                </label>
              )}
            </>
          )}
          {isProfile && <div className="auth-field"><label htmlFor="auth-profile-email"><Mail size={14} /> Email address</label><input id="auth-profile-email" type="email" value={formData.email} disabled autoComplete="email" /></div>}
          <div className="auth-field">
            <label htmlFor="auth-mobile"><Phone size={14} /> Contact number{isProfile ? ' *' : ''}</label>
            <input id="auth-mobile" type="tel" name="mobile" required={isProfile} value={formData.mobile} onChange={update} autoComplete="tel" inputMode="tel" placeholder="0917-000-0000" />
          </div>

          {(isProfile || mode === 'signup') && (
            <>
              <div className="auth-section">
                <p className="form-section-label"><MapPin size={15} /> Address {!isProfile && '(Optional)'}</p>
                <LocationFields
                  values={{
                    province: formData.province,
                    cityMunicipality: formData.cityMunicipality,
                    barangay: formData.barangay,
                    purokStreet: formData.purokStreet,
                  }}
                  onChangeField={(field, value) =>
                    setFormData((prev) => ({ ...prev, [field]: value }))
                  }
                  includeStreet={true}
                  required={false}
                />
              </div>
              {(isProfile || mode === 'signup') && (
                <div className="auth-section">
                  <p className="form-section-label"><Users size={15} /> Household and eligibility details {!isProfile && '(Optional)'}</p>
                  <div className="form-grid">
                    <label className="auth-field"><span>Household size</span><input type="number" min="1" name="householdSize" placeholder="Add size" value={formData.householdSize} onChange={update} /></label>
                    <label className="auth-field"><span>Number of children</span><input type="number" min="0" name="childrenCount" placeholder="Add count" value={formData.childrenCount} onChange={update} /></label>
                  </div>
                  <div className="form-grid">
                    <SelectField label="Civil status" name="civilStatus" value={formData.civilStatus} onChange={update} options={CIVIL_STATUS_OPTIONS} placeholder="Select civil status" />
                    <SelectField label="Sex" name="sex" value={formData.sex} onChange={update} options={SEX_OPTIONS} placeholder="Select sex" autoComplete="sex" />
                  </div>
                  <div>
                    <label className="auth-field">
                      <span>Occupation / livelihood</span>
                      <input type="text" name="occupation" list="auth-occupation-options" autoComplete="off" placeholder="Choose or type your own" value={formData.occupation} onChange={update} />
                      <datalist id="auth-occupation-options">
                        {OCCUPATION_SUGGESTIONS.map((option) => <option key={option} value={option} />)}
                      </datalist>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label className="auth-field"><span>Valid ID number</span><input type="text" name="idNumber" placeholder="Add ID number" value={formData.idNumber} onChange={update} /></label>
                    <label className="auth-field"><span>Spouse name</span><input type="text" name="spouseName" placeholder="Optional" value={formData.spouseName} onChange={update} /></label>
                  </div>
                  <label className="auth-field"><span>Birth date</span><input type="date" name="birthDate" aria-label="Birth date" autoComplete="bday" value={formData.birthDate} onChange={update} /></label>
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