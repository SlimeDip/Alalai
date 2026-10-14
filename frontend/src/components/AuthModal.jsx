import React, { useState } from 'react';
import { User, Mail, Lock, X, ArrowRight, UserCheck } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLogin, onContinueAsGuest }) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(mode, {
        ...(mode === 'register' ? { fullName: fullName.trim() } : {}),
        email: email.trim(),
        password
      });
      setPassword('');
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'Hindi makumpleto ang pag-login.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ backgroundColor: 'var(--primary-light)', padding: 8, borderRadius: 6, color: 'var(--primary)' }}>
              <UserCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                {mode === 'register' ? 'Gumawa ng Resident Account' : 'Mag-login bilang Residente'}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--slate-500)' }}>
                Server-verified na account para sa ligtas na pag-save ng mga rekord
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Isara"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-full-name">
                <User size={15} /> Buong Pangalan *
              </label>
              <input
                id="auth-full-name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="form-input"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">
              <Mail size={15} /> Email *
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">
              <Lock size={15} /> Password *
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'register' ? 12 : 1}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="form-input"
            />
            {mode === 'register' && (
              <small style={{ color: 'var(--slate-500)' }}>Gumamit ng hindi bababa sa 12 character.</small>
            )}
          </div>

          {error && (
            <p role="alert" style={{ color: 'var(--rose-700)', marginBottom: 12 }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Sandali...' : mode === 'register' ? 'Gumawa ng Account' : 'Mag-login'}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                setMode((current) => current === 'login' ? 'register' : 'login');
                setError('');
              }}
              disabled={busy}
            >
              {mode === 'register' ? 'May account na? Mag-login' : 'Wala pang account? Mag-rehistro'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                onContinueAsGuest();
                onClose();
              }}
              disabled={busy}
            >
              Magpatuloy bilang Bisita
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
