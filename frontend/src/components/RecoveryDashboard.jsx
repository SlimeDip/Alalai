import React from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';

const FLOW_STEPS = [
  { number: '1', key: 'flowDisaster' },
  { number: '2', key: 'flowAssessment' },
  { number: '3', key: 'flowSummary' },
  { number: '4', key: 'flowEligibility' },
  { number: '5', key: 'flowPrograms' },
  { number: '6', key: 'flowSelect' },
  { number: '7', key: 'flowPrepare' },
  { number: '8', key: 'flowRequirements' },
  { number: '9', key: 'flowReview' },
  { number: '10', key: 'flowCompile' },
  { number: '11', key: 'flowStatus' },
  { number: '12', key: 'flowRecord' },
  { number: '15', key: 'flowTracking' }
];

export default function RecoveryDashboard({ onStartCase, onOpenPrograms, onOpenRecords, t }) {
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
          <button type="button" className="btn btn-secondary" onClick={onStartCase}>
            {t('beginAssessment')} <ArrowRight size={15} />
          </button>
        </div>
        <div className="modern-card recovery-action-card">
          <ShieldCheck size={24} color="var(--emerald-700)" />
          <h2>{t('eligibilityCheck')}</h2>
          <p>{t('eligibilityCheckDesc')}</p>
          <button type="button" className="btn btn-secondary" onClick={onOpenPrograms}>
            {t('viewAssistancePrograms')} <ArrowRight size={15} />
          </button>
        </div>
        <div className="modern-card recovery-action-card">
          <FileText size={24} color="var(--slate-900)" />
          <h2>{t('continueTracking')}</h2>
          <p>{t('continueTrackingDesc')}</p>
          <button type="button" className="btn btn-secondary" onClick={onOpenRecords}>
            {t('openRecords')} <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <section className="modern-card process-card">
        <div className="process-card-heading">
          <div>
            <p className="eyebrow">{t('processEyebrow')}</p>
            <h2 className="card-heading-lg">{t('processTitle')}</h2>
          </div>
          <span className="badge badge-agency"><CheckCircle2 size={14} /> {t('processGuided')}</span>
        </div>
        <div className="process-flow-grid">
          {FLOW_STEPS.map((step) => (
            <div className="process-flow-step" key={step.number}>
              <span>{step.number}</span>
              <strong>{t(step.key)}</strong>
            </div>
          ))}
        </div>
        <p className="field-help">{t('processNote')}</p>
      </section>
    </div>
  );
}
