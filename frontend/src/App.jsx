import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import DamageAssessmentForm from './components/DamageAssessmentForm';
import SubsidyCatalog from './components/SubsidyCatalog';
import OfficialApplicationView from './components/OfficialApplicationView';
import SavedApplicationsList from './components/SavedApplicationsList';

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingTab, setPendingTab] = useState(null);
  const [selectedApplicationData, setSelectedApplicationData] = useState(null);

  useEffect(() => {
    try {
      localStorage.removeItem('tulong_bayan_user');
    } catch {}
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        setUser(result?.success ? result.data : null);
        setCsrfToken(result?.success ? result.csrfToken : '');
      })
      .catch(() => {
        setUser(null);
        setCsrfToken('');
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = async (mode, credentials) => {
    const response = await fetch(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Hindi makumpleto ang pag-login.');
    }
    setUser(result.data);
    setCsrfToken(result.csrfToken);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      if (!response.ok) throw new Error('Hindi makumpleto ang pag-logout.');
    } catch (error) {
      console.error('Failed to log out:', error);
      return;
    }
    setUser(null);
    setCsrfToken('');
    setSelectedApplicationData(null);
    setActiveTab('landing');
  };

  const handleContinueAsGuest = () => {
    setUser(null);
    setCsrfToken('');
    setPendingTab(null);
  };

  const handleNavigate = (tab) => {
    if (['assessment', 'application', 'saved'].includes(tab) && !user) {
      setPendingTab(tab);
      setAuthModalOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  // Navigating between flows
  const handleSelectSubsidyForApplication = ({ subsidy, assessment, applicant }) => {
    setSelectedApplicationData({
      subsidy,
      assessment: assessment ? { ...assessment, id: assessment.id } : null,
      applicant
    });
    handleNavigate('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSavedApplication = (savedItem) => {
    setSelectedApplicationData({
      applicant: {
        applicantName: savedItem.applicant_name,
        contactNumber: savedItem.contact_number,
        province: savedItem.province,
        cityMunicipality: savedItem.city_municipality,
        barangay: savedItem.barangay,
        disasterType: savedItem.disaster_type,
        incidentDate: savedItem.incident_date,
        damageDescription: savedItem.damage_summary
      },
      assessment: {
        id: savedItem.case_id,
        severity_level: savedItem.damage_level,
        damage_summary: savedItem.damage_summary,
        estimated_cost_max: savedItem.estimated_damage_php
      },
      subsidy: {
        title: savedItem.applied_subsidies?.[0] || 'Government Calamity Subsidy',
        max_amount_php: savedItem.requested_amount_php
      }
    });
    setActiveTab('application');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-container">
      {/* Responsive Header */}
      <Header
        activeTab={activeTab}
        onNavigate={handleNavigate}
        user={user}
        onOpenLogin={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-wrapper">
        {activeTab === 'landing' && (
          <LandingPage
            user={user}
            onStartAssessment={() => {
              handleNavigate('assessment');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenLogin={() => setAuthModalOpen(true)}
            onExploreSubsidies={() => {
              setActiveTab('subsidies');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {activeTab === 'assessment' && (
          user ? (
            <DamageAssessmentForm
              user={user}
              csrfToken={csrfToken}
              onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
            />
          ) : <p role="status">Mag-login upang magsagawa at mag-save ng damage assessment.</p>
        )}

        {activeTab === 'subsidies' && (
          <SubsidyCatalog
            onSelectSubsidyForApplication={handleSelectSubsidyForApplication}
          />
        )}

        {activeTab === 'application' && (
          user ? (
            <OfficialApplicationView
              initialData={selectedApplicationData}
              user={user}
              csrfToken={csrfToken}
              onSavedSuccess={() => {}}
            />
          ) : <p role="status">Mag-login upang mag-save ng application.</p>
        )}

        {activeTab === 'saved' && (
          user ? (
            <SavedApplicationsList
              onSelectApplication={handleSelectSavedApplication}
              csrfToken={csrfToken}
            />
          ) : <p role="status">Mag-login upang tingnan ang iyong mga rekord.</p>
        )}
      </main>

      {/* Auth / Resident Registration Modal */}
      <AuthModal
        isOpen={authModalOpen && !authLoading}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onContinueAsGuest={handleContinueAsGuest}
      />

      {/* Official Gov.ph Footer */}
      <footer
        className="no-print"
        style={{
          backgroundColor: 'var(--slate-900)',
          color: 'var(--slate-500)',
          padding: '32px 16px',
          borderTop: '1px solid var(--slate-800)',
          fontSize: 13
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <strong style={{ color: 'var(--white)', fontSize: 15 }}>
              Tulong Bayan • Calamity Damage Assessment & Relief Portal
            </strong>
            <p style={{ marginTop: 6, maxWidth: 520, color: 'var(--slate-400)', lineHeight: 1.6 }}>
              Binuo para sa mabilis, simple, at modernong pagtatasa ng pinsala sa kalamidad at pag-asiste sa mamamayang Pilipino na makatanggap ng kaukulang ayuda mula sa mga ahensya ng pamahalaan.
            </p>
          </div>
          <div>
            <span style={{ display: 'block', color: 'var(--white)', fontWeight: 600, marginBottom: 4 }}>
              Mga Pangunahing Hotline:
            </span>
            <p style={{ color: 'var(--slate-400)' }}>
              Pambansang Emergency: <strong>911</strong><br />
              NDRRMC Operations Center: <strong>(02) 8911-1406</strong><br />
              DSWD Disaster Assistance: <strong>(02) 8931-8101</strong>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
