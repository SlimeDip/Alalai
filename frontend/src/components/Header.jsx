import React, { useState, useEffect } from 'react';
import { Menu, X, LogOut, LogIn, User, Moon, Sun, ChevronDown } from 'lucide-react';

export default function Header({
  activeTab,
  onNavigate,
  user,
  onOpenLogin,
  onOpenProfile,
  onLogout,
  onContinueAsGuest}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    setIsDarkMode(useDark);
    document.documentElement.classList.toggle('dark', useDark);
  }, []);

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

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const handleNavClick = (tab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  };

  const primaryNavItems = [
    { id: 'landing', label: "Home" },
    { id: 'dashboard', label: "Recovery Dashboard" },
    { id: 'assessment', label: "Damage Assessment" },
    { id: 'subsidies', label: "Aid Options" }
  ];

  const secondaryNavItems = [
    { id: 'cases', label: "Recovery Cases" },
    { id: 'saved', label: "Saved Applications" },
    { id: 'aid', label: "Aid Ledger" }
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
            {"Alalai"}
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
              {"More"}
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
          <div className="header-tools">
            <button
              onClick={toggleTheme}
              className="btn-pill-dark theme-toggle"
              title="Toggle Dark Mode"
              aria-label="Toggle dark mode"
              type="button"
            >
              {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>

          {user && !user.isGuest ? (
            <div className="nav-user-cluster">
              <button type="button" className="btn-pill-dark" onClick={onOpenProfile}>
                <User size={14} />
                <span>{(user?.name || '').split(' ')[0] || "Guest"}</span>
              </button>
              <button type="button" className="btn btn-secondary btn-sm nav-logout-btn" onClick={onLogout} title={"Sign Out"} aria-label="Sign out">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="nav-user-cluster">
              <button type="button" className="btn btn-secondary nav-guest-btn" onClick={onContinueAsGuest}>
                {"Continue as Guest"}
              </button>
              <button type="button" className="btn-pill-dark" onClick={onOpenLogin}>
                <LogIn size={14} />
                {"Sign In"}
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
              <div className="brand-logo">{"Alalai"}</div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="icon-btn" aria-label="Close menu">
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
              <div className="header-tools" style={{ marginBottom: 12, justifyContent: 'flex-end' }}>
                <button onClick={toggleTheme} className="btn-pill-dark theme-toggle" type="button" aria-label="Toggle dark mode">
                  {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </div>

              {user && !user.isGuest ? (
                <>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: 8 }} onClick={() => { setMobileMenuOpen(false); onOpenProfile(); }}>
                    <User size={14} /> {(user?.name || '').split(' ')[0] || "Profile"}
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
                    <LogOut size={14} /> {"Sign Out"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '8px' }} onClick={() => { onContinueAsGuest(); setMobileMenuOpen(false); }}>
                    {"Continue as Guest"}
                  </button>
                  <button type="button" className="btn-pill-dark" style={{ width: '100%' }} onClick={() => { setMobileMenuOpen(false); onOpenLogin(); }}>
                    {"Sign In"}
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