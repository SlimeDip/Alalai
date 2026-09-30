import React, { useState } from 'react';
import {
  ShieldAlert,
  Menu,
  X,
  FileSearch,
  Layers,
  FileText,
  Archive,
  User,
  LogOut,
  LogIn,
  Home,
  Building2
} from 'lucide-react';

export default function Header({
  activeTab,
  onNavigate,
  user,
  onOpenLogin,
  onLogout
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print">
      {/* Official Topbar */}
      <div className="gov-topbar">
        <div className="topbar-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} />
            <span>Republika ng Pilipinas • Calamity Response & Subsidy Portal</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>DSWD • NDRRMC • DA • LGU</span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <nav className="navbar">
        <div className="navbar-container">
          <div className="brand-wrapper" onClick={() => handleNavClick('landing')}>
            <div className="brand-icon">
              <ShieldAlert size={24} />
            </div>
            <div className="brand-text">
              <h1>Tulong Bayan</h1>
              <p>Disaster Damage Assessment & Subsidy Portal</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="desktop-nav">
            <button
              type="button"
              className={`nav-link ${activeTab === 'landing' ? 'active' : ''}`}
              onClick={() => handleNavClick('landing')}
            >
              <Home size={16} /> Tahanan (Home)
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'assessment' ? 'active' : ''}`}
              onClick={() => handleNavClick('assessment')}
            >
              <FileSearch size={16} /> 1. Pagsusuri
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'subsidies' ? 'active' : ''}`}
              onClick={() => handleNavClick('subsidies')}
            >
              <Layers size={16} /> 2. Ayuda
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'application' ? 'active' : ''}`}
              onClick={() => handleNavClick('application')}
            >
              <FileText size={16} /> 3. Intake Form
            </button>
            <button
              type="button"
              className={`nav-link ${activeTab === 'saved' ? 'active' : ''}`}
              onClick={() => handleNavClick('saved')}
            >
              <Archive size={16} /> 4. Mga Rekord
            </button>
          </div>

          {/* User Status & Mobile Toggle */}
          <div className="nav-actions">
            {user && !user.isGuest ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="user-status-badge">
                  <User size={14} color="var(--primary)" />
                  <span>{user.name.split(' ')[0]}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onLogout}
                  title="Mag-logout"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onOpenLogin}
              >
                <LogIn size={14} /> Mag-login
              </button>
            )}

            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Buksan ang menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile / Tablet Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" style={{ display: 'block' }} onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={20} color="var(--primary)" />
                <strong style={{ fontSize: 16 }}>Tulong Bayan Menu</strong>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-600)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* User status in drawer */}
            <div style={{ marginBottom: 16, padding: '10px 12px', backgroundColor: 'var(--slate-100)', borderRadius: 6 }}>
              {user && !user.isGuest ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--slate-500)', display: 'block' }}>Naka-login bilang:</span>
                    <strong style={{ fontSize: 14 }}>{user.name}</strong>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={onLogout}>
                    <LogOut size={13} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--slate-600)' }}>Mode: Bisita (Guest)</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMobileMenuOpen(false); onOpenLogin(); }}>
                    Mag-login
                  </button>
                </div>
              )}
            </div>

            <div className="mobile-nav-links">
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'landing' ? 'active' : ''}`}
                onClick={() => handleNavClick('landing')}
              >
                <Home size={18} /> Tahanan (Landing)
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'assessment' ? 'active' : ''}`}
                onClick={() => handleNavClick('assessment')}
              >
                <FileSearch size={18} /> 1. Pagsusuri ng Pinsala
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'subsidies' ? 'active' : ''}`}
                onClick={() => handleNavClick('subsidies')}
              >
                <Layers size={18} /> 2. Talaan ng Ayuda
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'application' ? 'active' : ''}`}
                onClick={() => handleNavClick('application')}
              >
                <FileText size={18} /> 3. Intake Form & Print
              </button>
              <button
                type="button"
                className={`mobile-nav-link ${activeTab === 'saved' ? 'active' : ''}`}
                onClick={() => handleNavClick('saved')}
              >
                <Archive size={18} /> 4. Mga Na-save na Rekord
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
