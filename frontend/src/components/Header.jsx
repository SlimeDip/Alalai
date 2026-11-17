import React, { useState, useEffect } from 'react';
import { Menu, X, LogOut, LogIn, User, Moon, Sun, Minus, Plus } from 'lucide-react';

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
  
  // --- ADDED: Theme and Font Size State ---
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const savedFontSize = localStorage.getItem('fontSize');

    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    
    const initialSize = savedFontSize ? Number(savedFontSize) : 16;
    setFontSize(initialSize);
    document.documentElement.style.setProperty('--base-font-size', `${initialSize}px`);
    document.documentElement.style.fontSize = `${initialSize}px`;
  }, []);

  // Theme Toggle Function
  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const newTheme = !prev;
      if (newTheme) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newTheme;
    });
  };

  // Font Size Change Function (with Console Log and Direct HTML Scaling)
  const changeFontSize = (step) => {
    setFontSize((prev) => {
      const newSize = Math.max(14, Math.min(24, prev + step));
      
      console.log(`Pinindot ang font button! Bagong size: ${newSize}px`);
      document.documentElement.style.setProperty('--base-font-size', `${newSize}px`);
      document.documentElement.style.fontSize = `${newSize}px`;
      
      localStorage.setItem('fontSize', newSize);
      return newSize;
    });
  };
  // --- END ADDED LOGIC ---

  const handleNavClick = (tab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  const navItems = [
    { id: 'landing', label: t('home') },
    { id: 'assessment', label: t('assessment') },
    { id: 'subsidies', label: t('subsidies') },
    { id: 'saved', label: t('records') }
  ];

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

        <div className="navbar-cta">
          {/* --- ADDED: Accessibility Controls (Desktop) --- */}
          <div className="flex items-center gap-2 mr-2 hidden md:flex" style={{ gap: '8px', marginRight: '12px' }}>
            <div className="lang-toggle" style={{ margin: 0 }}>
              <button 
                onClick={() => changeFontSize(-2)} 
                className="lang-btn" 
                title="Decrease Font Size"
                type="button"
              >
                <Minus size={14} /> A
              </button>
              <button 
                onClick={() => changeFontSize(2)} 
                className="lang-btn" 
                title="Increase Font Size"
                type="button"
              >
                A <Plus size={14} />
              </button>
            </div>
            <button 
              onClick={toggleTheme} 
              className="btn-pill-dark"
              style={{ padding: '6px 12px' }}
              title="Toggle Dark Mode"
              type="button"
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>

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
              {/* --- ADDED: Accessibility Controls (Mobile) --- */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', justifyContent: 'space-between' }}>
                <div className="lang-toggle" style={{ margin: 0, flex: 1 }}>
                  <button onClick={() => changeFontSize(-2)} className="lang-btn" type="button" style={{ width: '50%' }}>
                    <Minus size={14} /> A
                  </button>
                  <button onClick={() => changeFontSize(2)} className="lang-btn" type="button" style={{ width: '50%' }}>
                    A <Plus size={14} />
                  </button>
                </div>
                <button onClick={toggleTheme} className="btn-pill-dark" type="button">
                  {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </div>

              <div className="lang-toggle" style={{ marginBottom: 12 }}>
                <button type="button" className={lang === 'en' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('en')}>
                  EN
                </button>
                <button type="button" className={lang === 'tl' ? 'lang-btn active' : 'lang-btn'} onClick={() => setLang('tl')}>
                  TL
                </button>
              </div>
              {user && !user.isGuest ? (
                <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
                  {t('logout')}
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '8px' }} onClick={() => { onContinueAsGuest(); setMobileMenuOpen(false); }}>
                    {t('continueAsGuest')}
                  </button>
                  <button type="button" className="btn-pill-dark" style={{ width: '100%' }} onClick={() => { setMobileMenuOpen(false); onOpenLogin(); }}>
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