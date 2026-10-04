import React from 'react';
import { ArrowRight, ClipboardCheck, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';

export default function RecoveryDashboard({ onStartCase, t }) {
  return (
    <div className="recovery-dashboard">
      <div className="modern-card recovery-hero">
        <div className="recovery-hero-icon"><LayoutDashboard size={26} /></div>
        <div>
          <p className="eyebrow">{t('recoveryDashboardEyebrow')}</p>
          <h1 className="card-heading-lg">{t('recoveryDashboardTitle')}</h1>
          <p className="card-subheading-lg">{t('recoveryDashboardSubtitle')}</p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={onStartCase}>
          {t('startNewCase')} <ArrowRight size={17} />
        </button>
      </div>

      <div className="recovery-summary-grid">
        <div className="modern-card recovery-action-card">
          <ClipboardCheck size={24} color="var(--primary)" />
          <h2>{t('initialRecoveryPlan')}</h2>
          <p>{t('initialRecoveryPlanDesc')}</p>
        </div>
        <div className="modern-card recovery-action-card">
          <ShieldCheck size={24} color="var(--emerald-700)" />
          <h2>{t('eligibilityCheck')}</h2>
          <p>{t('eligibilityCheckDesc')}</p>
        </div>
        <div className="modern-card recovery-action-card">
          <FileText size={24} color="var(--slate-900)" />
          <h2>{t('continueTracking')}</h2>
          <p>{t('continueTrackingDesc')}</p>
        </div>
      </div>
    </div>
  );
}
