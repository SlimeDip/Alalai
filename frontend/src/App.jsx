import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import RecoveryDashboard from './components/RecoveryDashboard';
import AuthModal from './components/AuthModal';
import DamageAssessmentForm from './components/DamageAssessmentForm';
import SubsidyCatalog from './components/SubsidyCatalog';
import OfficialApplicationView from './components/OfficialApplicationView';
import SavedApplicationsList from './components/SavedApplicationsList';
import AidLedger from './components/AidLedger';
import RecoveryCaseWorkspace from './components/RecoveryCaseWorkspace';
import { createCaseApplicationContext } from './utils/recoveryCaseWorkspace';

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);

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
      const guestUser = { isGuest: true, name: 'Guest' };
      setUser(guestUser);
      try {
        localStorage.removeItem('alalai_user');
      } catch {}
    }
  };

  const handleContinueAsGuest = () => {
    const guestUser = { isGuest: true, name: 'Guest' };
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

  const handleFooterNavigate = (tab) => {
    setWorkflowCaseId('');
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
    onOpenAidLedger: (caseId) => handleNavigateToCaseWorkflow('aid', caseId)
  };

  const footerLinkStyle = {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'inherit',
    opacity: 0.78,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left'
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
        />

        <main className="main-content-area">
          {activeTab === 'landing' && (
            <LandingPage
              onStartAssessment={() => {
                setActiveTab('assessment');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenLogin={dashboardProps.onOpenLogin}
            />
          )}

          {activeTab === 'dashboard' && (
            <RecoveryDashboard key={user?.id || user?.user_id || 'guest'} {...dashboardProps} />
          )}

          <div style={{ display: activeTab === 'assessment' ? 'block' : 'none' }}>
            <DamageAssessmentForm
              user={user}
              csrfToken={csrfToken}
              onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
              onViewReliefOptions={() => setActiveTab('subsidies')}
            />
          </div>

          <div style={{ display: activeTab === 'subsidies' ? 'block' : 'none' }}>
            <SubsidyCatalog
              onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
            />
          </div>

          <div style={{ display: activeTab === 'application' ? 'block' : 'none' }}>
            <OfficialApplicationView
              key={applicationFormVersion}
              initialData={selectedApplicationData}
              user={user}
              csrfToken={csrfToken}
              onBack={() => setActiveTab(selectedApplicationData?.returnTab || 'subsidies')}
              backLabel={
                selectedApplicationData?.returnTab === 'assessment'
                  ? "Back to assessment"
                  : selectedApplicationData?.returnTab === 'cases'
                  ? "Back to recovery cases"
                  : selectedApplicationData?.returnTab === 'saved'
                  ? ("Back to saved applications" || 'Back to Saved Applications')
                  : "Back to aid options"
              }
              onSavedSuccess={() => {}}
            />
          </div>

          {activeTab === 'saved' && (
            <SavedApplicationsList
              onSelectApplication={handleSelectSavedApplication}
              user={user}
              csrfToken={csrfToken}
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
            />
          )}

          {activeTab === 'aid' && (
            <AidLedger
              user={user}
              csrfToken={csrfToken}
              initialCaseId={workflowCaseId}
              onOpenLogin={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
            />
          )}

        </main>

        <footer
          className="no-print"
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 48,
            padding: '36px 24px 24px',
            borderTop: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'transparent',
            textAlign: 'left',
            color: 'inherit'
          }}
        >
          <div
            style={{
              maxWidth: 1120,
              margin: '0 auto',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 32,
              paddingBottom: 24,
              borderBottom: '1px solid rgba(148, 163, 184, 0.25)'
            }}
          >
            <div style={{ flex: '1 1 260px', maxWidth: 340 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  lineHeight: '20px',
                  marginBottom: 12
                }}
              >
                {"Alalai"}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, opacity: 0.78 }}>
                {"A free, independent public-service disaster relief navigator helping families assess damages, explore aid options, and prepare clean printable intake forms."}
              </p>
            </div>

            <div style={{ flex: '0 1 auto', minWidth: 180 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  lineHeight: '20px',
                  marginBottom: 12
                }}
              >
                {"Quick Navigation"}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                <button type="button" style={footerLinkStyle} onClick={() => handleFooterNavigate('landing')}>
                  {"Home"}
                </button>
                <button type="button" style={footerLinkStyle} onClick={() => handleFooterNavigate('assessment')}>
                  {"Start Damage Assessment"}
                </button>
                <button type="button" style={footerLinkStyle} onClick={() => handleFooterNavigate('subsidies')}>
                  {"Browse Aid Programs"}
                </button>
                <button type="button" style={footerLinkStyle} onClick={() => handleFooterNavigate('dashboard')}>
                  {"Recovery Dashboard"}
                </button>
              </div>
            </div>

            <div style={{ flex: '1 1 260px', maxWidth: 340 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  lineHeight: '20px',
                  marginBottom: 12
                }}
              >
                {"Public-Service Notice"}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, opacity: 0.78 }}>
                {"Alalai is not affiliated with any government agency and does not directly disburse funds or approve relief applications. Always submit printed forms to your official local Barangay or relief desk."}
              </p>
            </div>
          </div>

          <div
            style={{
              maxWidth: 1120,
              margin: '16px auto 0',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              opacity: 0.65
            }}
          >
            <span>{"© 2026 Alalai. Free & independent calamity relief navigation tool."}</span>
            <span>{"Calibrated for 1-page A4 intake printing."}</span>
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
      />
    </div>
  );
}