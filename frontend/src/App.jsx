import React, { useState, useMemo } from 'react';
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

  const [selectedApplicationData, setSelectedApplicationData] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
    try {
      localStorage.setItem('alalai_user', JSON.stringify(userData));
    } catch {}
  };

  const handleLogout = () => {
    const guestUser = { isGuest: true, name: lang === 'tl' ? 'Bisita' : 'Guest' };
    setUser(guestUser);
    try {
      localStorage.removeItem('alalai_user');
    } catch {}
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

  return (
    <div className="app-outer-frame">
      <div className="app-main-canvas">
        <Header
          activeTab={activeTab}
          onNavigate={setActiveTab}
          user={user}
          onOpenLogin={() => setAuthModalOpen(true)}
          onLogout={handleLogout}
          onContinueAsGuest={handleContinueAsGuest}
          lang={lang}
          setLang={setLanguage}
          t={t}
        />

        <main className="main-content-area">
          {activeTab === 'landing' && (
            <LandingPage
              onStartAssessment={() => {
                setActiveTab('assessment');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              t={t}
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

        <footer className="site-footer no-print">
          <strong>{t('appName')}</strong>
          <span> — {t('footerDisclaimer')}</span>
        </footer>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onContinueAsGuest={handleContinueAsGuest}
        t={t}
      />
    </div>
  );
}
