import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import RecoveryDashboard from './components/RecoveryDashboard';
import AuthModal from './components/AuthModal';
import DamageAssessmentForm from './components/DamageAssessmentForm';
import SubsidyCatalog from './components/SubsidyCatalog';
import OfficialApplicationView from './components/OfficialApplicationView';
import SavedApplicationsList from './components/SavedApplicationsList';
import ApplicationTracker from './components/ApplicationTracker';
import AidLedger from './components/AidLedger';
import DocumentVault from './components/DocumentVault';
import RecoveryCaseWorkspace from './components/RecoveryCaseWorkspace';
import { translations } from './utils/translations';
import { createCaseApplicationContext } from './utils/recoveryCaseWorkspace';

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
  const [applicationFormVersion, setApplicationFormVersion] = useState(0);
  const [workflowCaseId, setWorkflowCaseId] = useState('');

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json().catch(() => null);
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
    const result = await response.json().catch(() => ({}));
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
    const result = await response.json().catch(() => ({}));
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
      caseId: assessment?.case_id ?? null,
      caseLabel: assessment
        ? [
          assessment.disaster_type,
          [assessment.barangay, assessment.city_municipality, assessment.province]
            .filter(Boolean)
            .join(', '),
          assessment.incident_date
        ].filter(Boolean).join(' — ')
        : '',
      returnTab
    });
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSavedApplication = (savedItem) => {
    setSelectedApplicationData({
      fullRecord: savedItem,
      returnTab: 'saved'
    });
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCaseRelatedApplication = (savedItem) => {
    setSelectedApplicationData({
      fullRecord: savedItem,
      returnTab: 'cases'
    });
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrepareApplicationFromCase = (recoveryCase) => {
    setSelectedApplicationData(createCaseApplicationContext(recoveryCase));
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDashboardPrepareApplication = (recoveryCase) => {
    setSelectedApplicationData({
      ...createCaseApplicationContext(recoveryCase),
      returnTab: 'dashboard'
    });
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDashboardOpenApplication = (savedItem) => {
    setSelectedApplicationData({
      fullRecord: savedItem,
      returnTab: 'dashboard'
    });
    setApplicationFormVersion((version) => version + 1);
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToCaseWorkflow = (tab, caseId) => {
    setWorkflowCaseId(caseId || '');
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const dashboardProps = {
    user,
    onStartCase: () => setActiveTab('assessment'),
    onOpenLogin: () => { setAuthModalMode('signin'); setAuthModalOpen(true); },
    onOpenCases: (caseId) => handleNavigateToCaseWorkflow('cases', caseId),
    onPrepareApplication: handleDashboardPrepareApplication,
    onOpenApplication: handleDashboardOpenApplication,
    onOpenTracker: (caseId) => handleNavigateToCaseWorkflow('tracker', caseId),
    onOpenAidLedger: (caseId) => handleNavigateToCaseWorkflow('aid', caseId),
    onOpenVault: (caseId) => handleNavigateToCaseWorkflow('vault', caseId),
    t,
    lang
  };

  return (
    <div className="app-outer-frame">
      <div className="app-main-canvas">
        <Header
          activeTab={activeTab}
          onNavigate={(tab) => {
            setWorkflowCaseId('');
            setActiveTab(tab);
          }}
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
              onStartAssessment={() => {
                setActiveTab('assessment');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenLogin={dashboardProps.onOpenLogin}
              t={t}
            />
          )}

          {activeTab === 'dashboard' && (
            <RecoveryDashboard key={user?.id || user?.user_id || 'guest'} {...dashboardProps} />
          )}

          <div style={{ display: activeTab === 'assessment' ? 'block' : 'none' }}>
            <DamageAssessmentForm
              user={user}
              csrfToken={csrfToken}
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
              key={applicationFormVersion}
              initialData={selectedApplicationData}
              user={user}
              csrfToken={csrfToken}
              t={t}
              lang={lang}
              onBack={() => setActiveTab(selectedApplicationData?.returnTab || 'subsidies')}
              backLabel={
                selectedApplicationData?.returnTab === 'assessment'
                  ? t('backToAssessment')
                  : selectedApplicationData?.returnTab === 'cases'
                  ? t('backToCases')
                  : selectedApplicationData?.returnTab === 'saved'
                  ? (t('backToSaved') || 'Back to Saved Applications')
                  : t('backToSubsidies')
              }
              onSavedSuccess={() => {}}
            />
          </div>

          {activeTab === 'saved' && (
            <SavedApplicationsList
              onSelectApplication={handleSelectSavedApplication}
              user={user}
              csrfToken={csrfToken}
              t={t}
              lang={lang}
            />
          )}

          {activeTab === 'cases' && (
            <RecoveryCaseWorkspace
              key={user?.id || user?.user_id || 'guest'}
              user={user}
              initialCaseId={workflowCaseId}
              onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
              onStartAssessment={() => setActiveTab('assessment')}
              onPrepareApplication={handlePrepareApplicationFromCase}
              onOpenApplication={handleSelectCaseRelatedApplication}
              onNavigateToWorkflow={handleNavigateToCaseWorkflow}
              t={t}
              lang={lang}
            />
          )}

          {activeTab === 'tracker' && (
            <ApplicationTracker
              user={user}
              csrfToken={csrfToken}
              initialCaseId={workflowCaseId}
              onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
              t={t}
            />
          )}

          {activeTab === 'aid' && (
            <AidLedger
              user={user}
              csrfToken={csrfToken}
              initialCaseId={workflowCaseId}
              onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
              t={t}
            />
          )}

          {activeTab === 'vault' && (
            <DocumentVault
              user={user}
              csrfToken={csrfToken}
              initialCaseId={workflowCaseId}
              onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
              t={t}
            />
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
