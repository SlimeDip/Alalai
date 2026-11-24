import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Compass,
  FileText,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  PlusCircle,
  RefreshCw
} from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchAidLedger } from '../utils/aidApi';
import { fetchOwnedRecoveryCases } from '../utils/assessmentApi';
import {
  getRecoveryDashboardNextActions,
  getRecoveryDashboardView,
  summarizeRecoveryDashboard
} from '../utils/recoveryDashboard';
import { getCaseLocation } from '../utils/recoveryCaseWorkspace';

const ACTION_LABELS = {
  'start-case': 'Start a new recovery case',
  'prepare-application': 'Prepare an application',
  'review-application': 'Review saved application'
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

function DashboardMetric({ title, children, footer, icon: Icon }) {
  return (
    <article
      className="modern-card recovery-dashboard-metric"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <div className="recovery-dashboard-metric-heading">
        <h2>{title}</h2>
        <Icon size={20} color="var(--primary)" aria-hidden />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>

      {footer && (
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 14,
            borderTop: '1px solid var(--slate-200, #e2e8f0)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center'
          }}
        >
          {footer}
        </div>
      )}
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
  onOpenAidLedger
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
        const [cases, applications, aidResult] = await Promise.all([
          fetchOwnedRecoveryCases(),
          fetchAccountApplications(),
          fetchAidLedger()
        ]);
        const summary = summarizeRecoveryDashboard({
          cases,
          applications,
          aidSummary: aidResult.summary
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
  };

  return (
    <section className="recovery-dashboard">
      <div className="modern-card recovery-hero">
        <div className="recovery-hero-icon"><LayoutDashboard size={26} /></div>
        <div>
          <p className="eyebrow">{"Recovery workspace"}</p>
          <h1 className="card-heading-lg">{"Plan your recovery"}</h1>
          <p className="card-subheading-lg">{"Review account-backed recovery cases, applications, and aid records. Guest assessments are not recoverable across devices."}</p>
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
          <div className="recovery-dashboard-grid" style={{ alignItems: 'stretch' }}>
            <DashboardMetric
              title={"Recovery cases"}
              icon={FolderOpen}
              footer={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCases()}>
                  {"Open recovery cases"}
                </button>
              }
            >
              <p className="recovery-dashboard-total">{data.caseCount}</p>
              <div className="recovery-dashboard-recent-list" style={{ marginBottom: 16 }}>
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

            <DashboardMetric
              title={"Saved applications"}
              icon={FileText}
              footer={
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCases()}>
                    {"View linked cases"}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={onStartCase}>
                    <PlusCircle size={14} /> {"Start new case"}
                  </button>
                </>
              }
            >
              <p className="recovery-dashboard-total">{data.applicationCount}</p>
              <p className="card-subheading" style={{ marginBottom: 16 }}>
                {"Saved application records remain available from your account."}
              </p>
              {data.applicationCount === 0 && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'var(--slate-50, #f8fafc)',
                    border: '1px dashed var(--slate-300, #cbd5e1)',
                    fontSize: 13,
                    color: 'var(--slate-600, #475569)',
                    marginBottom: 16
                  }}
                >
                  {"No saved applications yet. Prepare an application from any recovery case to generate a printable A4 intake form."}
                </div>
              )}
            </DashboardMetric>

            <DashboardMetric
              title={"Assistance recorded as received"}
              icon={HandCoins}
              footer={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAidLedger()}>
                  {"Open aid ledger"}
                </button>
              }
            >
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
              <p role="note" className="recovery-dashboard-disclaimer" style={{ marginBottom: 16 }}>
                {"These are user-recorded entries, not independently verified government assistance, approvals, or official receipts."}
              </p>
            </DashboardMetric>

            <DashboardMetric
              title={"Next steps & quick actions"}
              icon={Compass}
              footer={
                <>
                  <button type="button" className="btn btn-primary btn-sm" onClick={onStartCase}>
                    <PlusCircle size={14} /> {"Start new case"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAidLedger()}>
                    {"Review aid ledger"}
                  </button>
                </>
              }
            >
              {nextActions.length > 0 ? (
                <div className="recovery-dashboard-action-list" style={{ marginTop: 8, marginBottom: 16 }}>
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
              ) : (
                <p className="card-subheading" style={{ marginBottom: 16 }}>
                  {"You are all caught up. Start a new assessment or review your existing aid records anytime."}
                </p>
              )}
            </DashboardMetric>
          </div>
        </>
      )}
    </section>
  );
}