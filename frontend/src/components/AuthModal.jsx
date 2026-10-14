import React, { useState } from 'react';
import { User, Phone, MapPin, X, ArrowRight, UserCheck } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLogin, onContinueAsGuest, t = (k) => k }) {
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    province: '',
    cityMunicipality: '',
    barangay: '',
    idNumber: ''
  });

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert(t('fullName'));
      return;
    }
    onLogin({
      name: formData.name,
      mobile: formData.mobile,
      province: formData.province,
      cityMunicipality: formData.cityMunicipality,
      barangay: formData.barangay,
      idNumber: formData.idNumber,
      isGuest: false
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCheck size={22} color="var(--primary)" />
            <div>
              <h3>{t('authTitle')}</h3>
              <p style={{ fontSize: 14, color: 'var(--slate-500)' }}>{t('authSubtitle')}</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              <User size={15} /> {t('fullName')} *
            </label>
            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="form-input form-input-lg" />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Phone size={15} /> {t('phone')}
            </label>
            <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange} className="form-input" />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <input type="text" name="province" placeholder="Province" value={formData.province} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <input type="text" name="cityMunicipality" placeholder="City" value={formData.cityMunicipality} onChange={handleChange} className="form-input" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <MapPin size={15} /> Barangay
            </label>
            <input type="text" name="barangay" value={formData.barangay} onChange={handleChange} className="form-input" />
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
              {t('authSubmit')}
              <ArrowRight size={16} />
            </button>
            <button type="button" className="btn btn-secondary btn-lg" style={{ width: '100%' }} onClick={() => { onContinueAsGuest(); onClose(); }}>
              {t('continueAsGuest')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
