import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  FileText,
  FolderOpen,
  HandCoins,
  LayoutDashboard,
  RefreshCw,
  PlusCircle,
  Search,
  Printer,
  ClipboardCheck
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
  onOpenAidOptions,
  onOpenSaved,
  onOpenAidLedger}) {
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
          <h1 className="card-heading-lg" style={{ marginBottom: 0 }}>{"Recovery Dashboard"}</h1>
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
          <p className="card-subheading">{"Sign in to see your saved cases. Guest assessments can't be viewed here."}</p>
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
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenSaved()}>
                {"View saved applications"}
              </button>
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
      <section aria-labelledby="dash-quick-heading">
        <h2 id="dash-quick-heading" className="recovery-section-heading">{"Quick actions"}</h2>
        <div className="dash-quick-grid">
          <button type="button" className="dash-quick" onClick={onStartCase}>
            <PlusCircle size={22} aria-hidden /><strong>{"Start new case"}</strong><span>{"Assess damage"}</span>
          </button>
          <button type="button" className="dash-quick" onClick={onOpenAidOptions}>
            <Search size={22} aria-hidden /><strong>{"Find aid"}</strong><span>{"Browse programs"}</span>
          </button>
          <button type="button" className="dash-quick" onClick={isAccountUser ? onOpenSaved : onOpenLogin}>
            <Printer size={22} aria-hidden /><strong>{"Applications"}</strong><span>{"Print or review"}</span>
          </button>
          <button type="button" className="dash-quick" onClick={isAccountUser ? () => onOpenAidLedger() : onOpenLogin}>
            <HandCoins size={22} aria-hidden /><strong>{"Aid ledger"}</strong><span>{"Track what you received"}</span>
          </button>
        </div>
      </section>

      <section className="modern-card dash-checklist" aria-labelledby="dash-checklist-heading">
        <div className="dash-checklist-head">
          <ClipboardCheck size={20} color="var(--primary)" aria-hidden />
          <h2 id="dash-checklist-heading">{"Recovery checklist"}</h2>
        </div>
        <ol>
          <li>{"Photograph all damage before cleaning up."}</li>
          <li>{"Complete a damage assessment for your household."}</li>
          <li>{"Review matching aid programs and their requirements."}</li>
          <li>{"Print your application and bring it with a valid ID."}</li>
          <li>{"Record any assistance you receive in the aid ledger."}</li>
        </ol>
      </section>
    </section>
  );
}
