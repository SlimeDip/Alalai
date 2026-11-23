import React, { useState, useMemo, useEffect } from 'react';
import { ShieldCheck, PhoneCall } from 'lucide-react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import DamageAssessmentForm from './components/DamageAssessmentForm';
import SubsidyCatalog from './components/SubsidyCatalog';
import OfficialApplicationView from './components/OfficialApplicationView';
import SavedApplicationsList from './components/SavedApplicationsList';
import { translations } from './utils/translations';

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('alalai_lang') === 'tl' ? 'tl' : 'en';
    } catch {
      return 'en';
    }
  });

  const t = useMemo(() => {
    const dict = translations[lang] || translations.en;
    return (key) => dict[key] ?? translations.en[key] ?? key;
  }, [lang]);

  const setLanguage = (next) => {
    setLang(next);
    try {
      localStorage.setItem('alalai_lang', next);
    } catch {}
  };

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('alalai_user');
      return saved ? JSON.parse(saved) : { isGuest: true, name: 'Guest' };
    } catch {
      return { isGuest: true, name: 'Guest' };
    }
  });
  const [csrfToken, setCsrfToken] = useState('');
  const [authModalMode, setAuthModalMode] = useState('signin');

  const [selectedApplicationData, setSelectedApplicationData] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((result) => {
        if (result?.success) {
          setUser(result.data);
          setCsrfToken(result.csrfToken || '');
          localStorage.setItem('alalai_user', JSON.stringify(result.data));
        }
      })
      .catch(() => {});
  }, []);

  const handleAuth = async (mode, credentials) => {
    const response = await fetch(`/api/auth/${mode === 'signup' ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(credentials)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to authenticate.');
    setUser(result.data);
    setCsrfToken(result.csrfToken || '');
    try {
      localStorage.setItem('alalai_user', JSON.stringify(result.data));
    } catch {}
  };

  const handleProfileUpdate = async (profile) => {
    const response = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify(profile)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update profile.');
    setUser(result.data);
    localStorage.setItem('alalai_user', JSON.stringify(result.data));
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
    } finally {
      setCsrfToken('');
      const guestUser = { isGuest: true, name: lang === 'tl' ? 'Bisita' : 'Guest' };
      setUser(guestUser);
      try {
        localStorage.removeItem('alalai_user');
      } catch {}
    }
  };

  const handleContinueAsGuest = () => {
    const guestUser = { isGuest: true, name: lang === 'tl' ? 'Bisita' : 'Guest' };
    setUser(guestUser);
    setAuthModalOpen(false);
  };

  const handleSelectSubsidyForApplication = ({ subsidy, assessment, applicant, returnTab = 'subsidies' }) => {
    setSelectedApplicationData({
      subsidy,
      assessment,
      applicant,
      returnTab
    });
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSavedApplication = (savedItem) => {
    setSelectedApplicationData({
      fullRecord: savedItem,
      returnTab: 'saved'
    });
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateAndScroll = (tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-outer-frame">
      <div className="app-main-canvas">
        <Header
          activeTab={activeTab}
          onNavigate={setActiveTab}
          user={user}
          onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
          onOpenProfile={() => { setAuthModalMode('profile'); setAuthModalOpen(true); }}
          onLogout={handleLogout}
          onContinueAsGuest={handleContinueAsGuest}
          lang={lang}
          setLang={setLanguage}
          t={t}
        />

        <main className="main-content-area">
          {activeTab === 'landing' && (
            <LandingPage
              onStartAssessment={() => navigateAndScroll('assessment')}
              t={t}
              lang={lang}
            />
          )}

          <div style={{ display: activeTab === 'assessment' ? 'block' : 'none' }}>
            <DamageAssessmentForm
              user={user}
              t={t}
              lang={lang}
              onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
              onViewReliefOptions={() => setActiveTab('subsidies')}
            />
          </div>

          <div style={{ display: activeTab === 'subsidies' ? 'block' : 'none' }}>
            <SubsidyCatalog
              t={t}
              lang={lang}
              onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
            />
          </div>

          <div style={{ display: activeTab === 'application' ? 'block' : 'none' }}>
            <OfficialApplicationView
              initialData={selectedApplicationData}
              user={user}
              t={t}
              lang={lang}
              onBack={() => setActiveTab(selectedApplicationData?.returnTab || 'subsidies')}
              backLabel={
                selectedApplicationData?.returnTab === 'assessment'
                  ? t('backToAssessment')
                  : selectedApplicationData?.returnTab === 'saved'
                  ? (t('backToSaved') || 'Back to Saved Applications')
                  : t('backToSubsidies')
              }
              onSavedSuccess={() => {}}
            />
          </div>

          {activeTab === 'saved' && (
            <SavedApplicationsList onSelectApplication={handleSelectSavedApplication} t={t} lang={lang} />
          )}
        </main>

        <footer
          className="site-footer no-print"
          style={{
            textAlign: 'left',
            padding: '32px 24px 20px',
            marginTop: 40,
            borderTop: '2px solid rgba(148, 163, 184, 0.25)'
          }}
        >
          <div
            style={{
              maxWidth: 1120,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 28,
              paddingBottom: 22,
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ShieldCheck size={21} color="var(--primary)" />
                <strong style={{ fontSize: 17, letterSpacing: '-0.01em' }}>{t('appName')}</strong>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--slate-600)', lineHeight: 1.6, margin: 0 }}>
                {lang === 'tl'
                  ? 'Isang digital na gabay para sa mabilis na pagtatasa ng pinsala at paghahanap ng opisyal na tulong para sa mga pamilyang Pilipino na naapektuhan ng sakuna.'
                  : 'A citizen-centered disaster recovery portal helping Filipino families assess calamity damage and connect with verified relief programs.'}
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                {lang === 'tl' ? 'Nabigasyon' : 'Portal Navigation'}
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateAndScroll('landing')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--slate-600)', cursor: 'pointer', fontSize: 13.5 }}
                  >
                    {lang === 'tl' ? 'Home / Dashboard' : 'Home & Recovery Dashboard'}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateAndScroll('assessment')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 }}
                  >
                    {t('startNewCase')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateAndScroll('subsidies')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--slate-600)', cursor: 'pointer', fontSize: 13.5 }}
                  >
                    {t('subsidiesTitle')}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateAndScroll('saved')}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--slate-600)', cursor: 'pointer', fontSize: 13.5 }}
                  >
                    {lang === 'tl' ? 'Mga Naka-save na Aplikasyon' : 'Saved Applications'}
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                {lang === 'tl' ? 'Emergency Hotlines' : 'Emergency Contacts'}
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: 'var(--slate-600)' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PhoneCall size={14} color="var(--primary)" /> <strong>National Emergency:</strong> 911
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PhoneCall size={14} color="var(--primary)" /> <strong>Philippine Red Cross:</strong> 143
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PhoneCall size={14} color="var(--primary)" /> <strong>NDRRMC:</strong> (02) 8911-5061
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PhoneCall size={14} color="var(--primary)" /> <strong>DSWD Hotline:</strong> (02) 8931-8101
                </li>
              </ul>
            </div>
          </div>

          <div
            style={{
              maxWidth: 1120,
              margin: '0 auto',
              paddingTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              fontSize: 12.5,
              color: 'var(--slate-600)'
            }}
          >
            <span>© 2026 {t('appName')} — WebSys Group 12. All rights reserved.</span>
            <span>{t('footerDisclaimer')}</span>
          </div>
        </footer>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuth={handleAuth}
        onProfileUpdate={handleProfileUpdate}
        onContinueAsGuest={handleContinueAsGuest}
        user={user}
        csrfToken={csrfToken}
        initialMode={authModalMode}
        t={t}
      />
    </div>
  );
}