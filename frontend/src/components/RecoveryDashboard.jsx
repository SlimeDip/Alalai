import React from 'react';
import { ArrowRight, LayoutDashboard } from 'lucide-react';

export default function RecoveryDashboard({ onStartCase, t }) {
  return (
    <div className="recovery-dashboard" style={{ marginTop: 0 }}>
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
    </div>
  );
}