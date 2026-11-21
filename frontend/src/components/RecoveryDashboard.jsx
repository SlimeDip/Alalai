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

const STATUS_LABELS = {
  PREPARED: 'Prepared',
  SUBMITTED: 'Submitted',
  FOLLOW_UP_NEEDED: 'Follow-up needed',
  DECISION_RECEIVED: 'Decision received'
};

const ACTION_LABELS = {
  'start-case': 'Start a new recovery case',
  'prepare-application': 'Prepare an application',
  'review-application': 'Review saved application',
  'review-tracker': 'Review application tracker',
  'follow-up': 'Complete a follow-up',
  'open-vault': 'Open document vault'
};

function dateLabel(value) {
  if (!value) return '';
  const dateValue = String(value);
  const date = new Date(dateValue.includes(' ') ? `${dateValue.replace(' ', 'T')}Z` : `${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
}

function peso(value) {
  return `₱${Number(value).toLocaleString('en-PH', {
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
  onOpenVault}) {
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
          <p className="eyebrow">{"Recovery workspace"}</p>
          <h1 className="card-heading-lg">{"Plan your recovery"}</h1>
          <p className="card-subheading-lg">{"Review account-backed recovery cases, applications, recorded aid, and documents. Guest assessments are not recoverable across devices."}</p>
        </div>
        {isAccountUser ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRefreshVersion((version) => version + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={onOpenLogin}>
            {"Sign In"} <ArrowRight size={17} />
          </button>
        )}
      </div>

      {!isAccountUser && (
        <div className="modern-card guest-dashboard-notice">
          <p className="card-subheading">{"Sign in to see recovery records saved to your account. Guest assessment results are not available in this account dashboard."}</p>
          <button type="button" className="btn btn-secondary" onClick={onStartCase}>
            {"Start New Case"} <ArrowRight size={15} />
          </button>
        </div>
      )}

      {isAccountUser && view.state === 'loading' && (
        <div role="status" className="modern-card">{"Loading your recovery overview…"}</div>
      )}
      {isAccountUser && view.state === 'error' && (
        <div role="alert" className="modern-card recovery-dashboard-error">
          <p>{"The recovery overview could not be loaded."}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            {"Try again"}
          </button>
        </div>
      )}

      {isAccountUser && view.state === 'ready' && (
        <>
          {view.refreshError && (
            <div role="alert" className="modern-card recovery-dashboard-error">
              {"The latest updates could not be loaded. The information shown may be out of date."}
            </div>
          )}
          <div className="recovery-dashboard-grid">
            <DashboardMetric title={"Recovery cases"} icon={FolderOpen}>
              <p className="recovery-dashboard-total">{data.caseCount}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCases()}>
                {"Open recovery cases"}
              </button>
              <div className="recovery-dashboard-recent-list">
                {data.recentCases.map((recoveryCase) => (
                  <button
                    type="button"
                    className="recovery-dashboard-record"
                    key={recoveryCase.case_id}
                    onClick={() => onOpenCases(recoveryCase.case_id)}
                  >
                    <strong>{recoveryCase.disaster_type || "Disaster type not recorded"}</strong>
                    <span>{getCaseLocation(recoveryCase) || "Location not recorded"}</span>
                    {recoveryCase.incident_date && (
                      <span>{"Incident Date"}: {dateLabel(recoveryCase.incident_date)}</span>
                    )}
                    {recoveryCase.created_at && (
                      <span>{"Created"}: {dateLabel(recoveryCase.created_at)}</span>
                    )}
                  </button>
                ))}
                {data.caseCount === 0 && <p className="card-subheading">{"No saved recovery cases yet"}</p>}
              </div>
            </DashboardMetric>

            <DashboardMetric title={"Saved applications"} icon={FileText}>
              <p className="recovery-dashboard-total">{data.applicationCount}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTracker()}>
                {"Open application tracker"}
              </button>
              <div className="recovery-dashboard-statuses">
                {Object.entries(data.trackerStatusCounts).map(([status, count]) => (
                  <div key={status}>
                    <span>{STATUS_LABELS[status] || status}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
              {data.followUpApplications.length > 0 && (
                <div className="recovery-dashboard-followups">
                  <strong>{"Needs follow-up"}</strong>
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

            <DashboardMetric title={"Assistance recorded as received"} icon={HandCoins}>
              <p className="recovery-dashboard-assistance-label">{"Recorded cash assistance (self-reported)"}</p>
              <p className="recovery-dashboard-total">
                {data.cashTotal == null ? "Unavailable" : peso(data.cashTotal)}
              </p>
              <p className="recovery-dashboard-assistance-label">
                {"In-kind entries recorded"}: {data.inKindCount == null ? "Unavailable" : data.inKindCount}
              </p>
              {data.inKindEstimatedValue != null && (
                <p>{"Estimated in-kind value (self-reported)"}: {peso(data.inKindEstimatedValue)}</p>
              )}
              <p role="note" className="recovery-dashboard-disclaimer">{"These are user-recorded entries, not independently verified government assistance, approvals, or official receipts."}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAidLedger()}>
                {"Open aid ledger"}
              </button>
            </DashboardMetric>

            <DashboardMetric title={"Documents"} icon={FolderOpen}>
              <p className="recovery-dashboard-total">
                {data.documentCount == null ? "Unavailable" : data.documentCount}
              </p>
              <p className="card-subheading">
                {data.documentError
                  ? (data.documentError === 'no-cases'
                    ? 'No documents are needed until you save a recovery case.'
                    : 'Documents could not be counted from the private vault.')
                  : "The total is counted from the private vault lists for your saved cases."}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenVault(data.cases[0]?.case_id)}
              >
                {"Open document vault"}
              </button>
            </DashboardMetric>
          </div>

          {nextActions.length > 0 && (
            <section className="recovery-dashboard-next-actions" aria-labelledby="recovery-next-actions-heading">
              <h2 id="recovery-next-actions-heading" className="recovery-section-heading">
                {"Next actions from your records"}
              </h2>
              <div className="recovery-dashboard-action-list">
                {nextActions.map((action, index) => (
                  <div className="recovery-dashboard-action" key={`${action.type}-${action.caseId || action.application?.id || index}`}>
                    <div>
                      <strong>{ACTION_LABELS[action.type] || 'Continue recovery workflow'}</strong>
                      {action.recoveryCase && (
                        <p className="card-subheading">
                          {[action.recoveryCase.disaster_type, getCaseLocation(action.recoveryCase)].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => runNextAction(action)}>
                      {"Continue"} <ArrowRight size={14} />
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
