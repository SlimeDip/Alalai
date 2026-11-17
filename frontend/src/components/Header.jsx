import React, { useState } from 'react';
import { Menu, X, LogOut, LogIn, User, ChevronDown } from 'lucide-react';

export default function Header({
  activeTab,
  onNavigate,
  user,
  onOpenLogin,
  onOpenProfile,
  onLogout,
  onContinueAsGuest,
  lang,
  setLang,
  t
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const handleNavClick = (tab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  };

  const primaryNavItems = [
    { id: 'landing', label: t('home') },
    { id: 'dashboard', label: t('dashboard') },
    { id: 'assessment', label: t('assessment') },
    { id: 'subsidies', label: t('subsidies') }
  ];

  const secondaryNavItems = [
    { id: 'cases', label: t('recoveryCasesNav') },
    { id: 'saved', label: t('records') },
    { id: 'tracker', label: t('trackerNav') },
    { id: 'aid', label: t('aidLedgerNav') },
    { id: 'vault', label: t('documentVaultNav') }
  ];

  const navItems = [...primaryNavItems, ...secondaryNavItems];
  const secondaryTabActive = secondaryNavItems.some((item) => activeTab === item.id);

  return (
    <header className="no-print">
      <nav className="modern-navbar">
        <div
          className="brand-block"
          onClick={() => handleNavClick('landing')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNavClick('landing');
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="brand-logo">
            {t('appName')}
          </div>
        </div>

        <div className="navbar-links">
          {primaryNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navbar-link ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="navbar-more">
            <button
              type="button"
              className={`navbar-link navbar-more-toggle ${secondaryTabActive ? 'active' : ''}`}
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
            >
              {t('more')}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {moreMenuOpen && (
              <div className="navbar-more-menu" role="menu">
                {secondaryNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`navbar-more-item ${activeTab === item.id ? 'active' : ''}`}
                    onClick={() => handleNavClick(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="navbar-cta">
          <div className="lang-toggle" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'en' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLang('en')}
            >
              {t('languageEn')}
            </button>
            <button
              type="button"
              className={lang === 'tl' ? 'lang-btn active' : 'lang-btn'}
              onClick={() => setLang('tl')}
            >
              {t('languageTl')}
            </button>
          </div>

          {user && !user.isGuest ? (
            <div className="nav-user-cluster">
              <button type="button" className="btn-pill-dark" onClick={onOpenProfile}>
                <User size={14} />
                <span>{(user?.name || '').split(' ')[0] || t('guest')}</span>
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onLogout} title={t('logout')}>
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="nav-user-cluster">
              <button type="button" className="btn btn-secondary" onClick={onContinueAsGuest}>
                {t('continueAsGuest')}
              </button>
              <button type="button" className="btn-pill-dark" onClick={onOpenLogin}>
                <LogIn size={14} />
                {t('login')}
              </button>
            </div>
          )}

          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="mobile-drawer-overlay" style={{ display: 'block' }} onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-top">
              <div className="brand-logo">{t('appName')}</div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="icon-btn">
                <X size={20} />
              </button>
            </div>
            <div className="mobile-nav-list">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`navbar-link ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mobile-drawer-footer">
              <div className="lang-toggle" style={{ marginBottom: 12 }}>
                <button type="button" className={lang === 'en' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('en')}>
                  EN
                </button>
                <button type="button" className={lang === 'tl' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('tl')}>
                  TL
                </button>
              </div>
              {user && !user.isGuest ? (
                <button type="button" className="btn btn-secondary" onClick={onLogout}>
                  {t('logout')}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => { onContinueAsGuest(); setMobileMenuOpen(false); }}>
                    {t('continueAsGuest')}
                  </button>
                  <button type="button" className="btn-pill-dark" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMobileMenuOpen(false); onOpenLogin(); }}>
                    {t('login')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
