import React, { useState } from 'react';
import { User, Phone, MapPin, ShieldCheck, X, ArrowRight, UserCheck } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLogin, onContinueAsGuest }) {
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
      alert('Pakilagay po ang inyong buong pangalan.');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ backgroundColor: 'var(--primary-light)', padding: 8, borderRadius: 6, color: 'var(--primary)' }}>
              <UserCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Pag-login o Rehistro ng Residente</h3>
              <p style={{ fontSize: 13, color: 'var(--slate-500)' }}>I-save ang iyong profile para sa awtomatikong intake slips</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">
              <User size={15} /> Buong Pangalan (Full Name) *
            </label>
            <input
              type="text"
              name="name"
              required
              placeholder="Hal. Maria Clara De Los Santos"
              value={formData.name}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Phone size={15} /> Numero ng Telepono / Mobile
            </label>
            <input
              type="tel"
              name="mobile"
              placeholder="0917-123-4567"
              value={formData.mobile}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Lalawigan (Province)</label>
              <input
                type="text"
                name="province"
                placeholder="Hal. Albay"
                value={formData.province}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Lungsod / Bayan</label>
              <input
                type="text"
                name="cityMunicipality"
                placeholder="Hal. Legazpi City"
                value={formData.cityMunicipality}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              <MapPin size={15} /> Barangay
            </label>
            <input
              type="text"
              name="barangay"
              placeholder="Hal. Barangay 14"
              value={formData.barangay}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              Magpatuloy at I-save ang Profile
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                onContinueAsGuest();
                onClose();
              }}
            >
              Magpatuloy bilang Bisita (Continue as Guest)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
