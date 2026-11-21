import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  FileText,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  RefreshCw
} from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchCaseDocuments } from '../utils/documentApi';
import { fetchAidLedger } from '../utils/aidApi';
import { fetchTrackedApplications, fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  getRecoveryDashboardNextActions,
  getRecoveryDashboardView,
  summarizeRecoveryDashboard
} from '../utils/recoveryDashboard';
import { getCaseLocation } from '../utils/recoveryCaseWorkspace';

function dateLabel(value, lang) {
  if (!value) return '';
  const dateValue = String(value);
  const date = new Date(dateValue.includes(' ') ? `${dateValue.replace(' ', 'T')}Z` : `${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
}

function peso(value, lang) {
  return `₱${Number(value).toLocaleString(lang === 'tl' ? 'fil-PH' : 'en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function DashboardMetric({ title, children, icon: Icon }) {
  return (
    <article className="modern-card recovery-dashboard-metric">
      <div className="recovery-dashboard-metric-heading">
        <h2>{title}</h2>
        <Icon size={20} color="var(--primary)" aria-hidden />
      </div>
      {children}
    </article>
  );
}

export default function RecoveryDashboard({
  user,
  onStartCase,
  onOpenLogin,
  onOpenCases,
  onPrepareApplication,
  onOpenApplication,
  onOpenTracker,
  onOpenAidLedger,
  onOpenVault,
  t,
  lang = 'en'
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const isAccountUser = Boolean(user && !user.isGuest);

  useEffect(() => {
    if (!isAccountUser) {
      setData(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setError('');

    const loadDashboard = async () => {
      try {
        const [cases, applications, trackedApplications, aidResult] = await Promise.all([
          fetchOwnedRecoveryCases(),
          fetchAccountApplications(),
          fetchTrackedApplications(),
          fetchAidLedger()
        ]);
        let documentCount = null;
        let documentError = cases.length === 0 ? 'no-cases' : '';
        if (cases.length) {
          try {
            const caseDocuments = await Promise.all(
              cases.map((recoveryCase) => fetchCaseDocuments(recoveryCase.case_id))
            );
            documentCount = caseDocuments.reduce((total, documents) => total + documents.length, 0);
          } catch {
            documentError = true;
          }
        }

        const summary = summarizeRecoveryDashboard({
          cases,
          applications,
          trackedApplications,
          aidSummary: aidResult.summary,
          documentCount,
          documentError
        });
        if (active) setData(summary);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => { active = false; };
  }, [isAccountUser, refreshVersion]);

  const view = getRecoveryDashboardView({ loading, error, data });
  const nextActions = useMemo(
    () => (data ? getRecoveryDashboardNextActions(data) : []),
    [data]
  );

  const runNextAction = (action) => {
    if (action.type === 'start-case') onStartCase();
    if (action.type === 'prepare-application') onPrepareApplication(action.recoveryCase);
    if (action.type === 'review-application') onOpenApplication(action.application);
    if (action.type === 'review-tracker' || action.type === 'follow-up') {
      onOpenTracker(action.caseId);
    }
    if (action.type === 'open-vault') onOpenVault(action.caseId);
  };

  return (
    <section className="recovery-dashboard">
      <div className="modern-card recovery-hero">
        <div className="recovery-hero-icon"><LayoutDashboard size={26} /></div>
        <div>
          <p className="eyebrow">{t('recoveryDashboardEyebrow')}</p>
          <h1 className="card-heading-lg">{t('recoveryDashboardTitle')}</h1>
          <p className="card-subheading-lg">{t('recoveryDashboardSubtitle')}</p>
        </div>
        {isAccountUser ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRefreshVersion((version) => version + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} /> {loading ? t('loading') : t('refresh')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={onOpenLogin}>
            {t('login')} <ArrowRight size={17} />
          </button>
        )}
      </div>

      {!isAccountUser && (
        <div className="modern-card guest-dashboard-notice">
          <p className="card-subheading">{t('guestDashboardNotice')}</p>
          <button type="button" className="btn btn-secondary" onClick={onStartCase}>
            {t('startNewCase')} <ArrowRight size={15} />
          </button>
        </div>
      )}

      {isAccountUser && view.state === 'loading' && (
        <div role="status" className="modern-card">{t('dashboardLoading')}</div>
      )}
      {isAccountUser && view.state === 'error' && (
        <div role="alert" className="modern-card recovery-dashboard-error">
          <p>{t('dashboardLoadError')}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            {t('retry')}
          </button>
        </div>
      )}

      {isAccountUser && view.state === 'ready' && (
        <>
          {view.refreshError && (
            <div role="alert" className="modern-card recovery-dashboard-error">
              {t('dashboardRefreshError')}
            </div>
          )}
          <div className="recovery-dashboard-grid">
            <DashboardMetric title={t('dashboardCases')} icon={FolderOpen}>
              <p className="recovery-dashboard-total">{data.caseCount}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCases()}>
                {t('openRecoveryCases')}
              </button>
              <div className="recovery-dashboard-recent-list">
                {data.recentCases.map((recoveryCase) => (
                  <button
                    type="button"
                    className="recovery-dashboard-record"
                    key={recoveryCase.case_id}
                    onClick={() => onOpenCases(recoveryCase.case_id)}
                  >
                    <strong>{recoveryCase.disaster_type || t('disasterTypeUnavailable')}</strong>
                    <span>{getCaseLocation(recoveryCase) || t('locationUnavailable')}</span>
                    {recoveryCase.incident_date && (
                      <span>{t('disasterDate')}: {dateLabel(recoveryCase.incident_date, lang)}</span>
                    )}
                    {recoveryCase.created_at && (
                      <span>{t('caseCreated')}: {dateLabel(recoveryCase.created_at, lang)}</span>
                    )}
                  </button>
                ))}
                {data.caseCount === 0 && <p className="card-subheading">{t('noRecoveryCases')}</p>}
              </div>
            </DashboardMetric>

            <DashboardMetric title={t('dashboardApplications')} icon={FileText}>
              <p className="recovery-dashboard-total">{data.applicationCount}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTracker()}>
                {t('openApplicationTracker')}
              </button>
              <div className="recovery-dashboard-statuses">
                {Object.entries(data.trackerStatusCounts).map(([status, count]) => (
                  <div key={status}>
                    <span>{t(`status${status}`)}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
              {data.followUpApplications.length > 0 && (
                <div className="recovery-dashboard-followups">
                  <strong>{t('dashboardFollowUpNeeded')}</strong>
                  {data.followUpApplications.slice(0, 3).map((application) => (
                    <button
                      type="button"
                      key={application.tracked_application_id}
                      onClick={() => onOpenTracker(application.case_id)}
                    >
                      {application.program_name}
                      {application.disaster_type ? ` · ${application.disaster_type}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </DashboardMetric>

            <DashboardMetric title={t('dashboardAssistance')} icon={HandCoins}>
              <p className="recovery-dashboard-assistance-label">{t('dashboardRecordedCash')}</p>
              <p className="recovery-dashboard-total">
                {data.cashTotal == null ? t('dashboardMetricUnavailable') : peso(data.cashTotal, lang)}
              </p>
              <p className="recovery-dashboard-assistance-label">
                {t('dashboardInKindEntries')}: {data.inKindCount == null ? t('dashboardMetricUnavailable') : data.inKindCount}
              </p>
              {data.inKindEstimatedValue != null && (
                <p>{t('dashboardInKindEstimatedValue')}: {peso(data.inKindEstimatedValue, lang)}</p>
              )}
              <p role="note" className="recovery-dashboard-disclaimer">{t('dashboardAidDisclaimer')}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAidLedger()}>
                {t('openAidLedger')}
              </button>
            </DashboardMetric>

            <DashboardMetric title={t('dashboardDocuments')} icon={FolderOpen}>
              <p className="recovery-dashboard-total">
                {data.documentCount == null ? t('dashboardMetricUnavailable') : data.documentCount}
              </p>
              <p className="card-subheading">
                {data.documentError
                  ? t(data.documentError === 'no-cases'
                    ? 'dashboardDocumentsNoCases'
                    : 'dashboardDocumentsUnavailable')
                  : t('dashboardDocumentsDescription')}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenVault(data.cases[0]?.case_id)}
              >
                {t('openDocumentVault')}
              </button>
            </DashboardMetric>
          </div>

          {nextActions.length > 0 && (
            <section className="modern-card recovery-dashboard-next-actions">
              <h2 className="application-section-heading">{t('dashboardNextActions')}</h2>
              <div className="recovery-dashboard-action-list">
                {nextActions.map((action, index) => (
                  <div className="recovery-dashboard-action" key={`${action.type}-${action.caseId || action.application?.id || index}`}>
                    <div>
                      <strong>{t(`dashboardAction${action.type.replace(/(^|-)([a-z])/g, (_, separator, character) => character.toUpperCase())}`)}</strong>
                      {action.recoveryCase && (
                        <p className="card-subheading">
                          {[action.recoveryCase.disaster_type, getCaseLocation(action.recoveryCase)].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => runNextAction(action)}>
                      {t('continue')} <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
