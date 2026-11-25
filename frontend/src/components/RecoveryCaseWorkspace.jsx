import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  FileText,
  FolderOpen,
  MapPin,
  CalendarDays,
  HandCoins,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/assessmentApi';
import {
  getRecoveryCaseDetailModel,
  getRecoveryCaseListView,
  getRelatedCaseApplications,
  isUnavailableCaseValue,
  normalizeRecoverySeverity
} from '../utils/recoveryCaseWorkspace';
import {
  getAssessmentEligibilityModel,
  getCatalogProgramPresentation,
  getVisiblePrograms,
  toggleExpandedRecommendation
} from '../utils/subsidyPresentation';

const INITIAL_PROGRAM_LIMIT = 3;

const SCREENING_OUTCOME_LABELS = {
  potentialMatch: 'Potential match',
  needsMoreInformation: 'Needs more information',
  outcomeUnavailable: 'Information unavailable'
};

const SEVERITY_BADGE = {
  severe: 'badge-severe',
  moderate: 'badge-moderate',
  low: 'badge-low',
  unknown: 'badge-agency'
};

const HOUSEHOLD_LABELS = {
  applicant_name: 'Applicant Full Name',
  contact_number: 'Contact Number',
  household_size: 'Household members',
  household_members_count: 'Household members'
};

function dateLabel(value) {
  if (!value) return '';
  const text = String(value);
  const date = new Date(text.includes(' ') ? `${text.replace(' ', 'T')}Z` : `${text}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? text
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function peso(value) {
  return `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function displayCaseValue(value, fallback) {
  return isUnavailableCaseValue(value) ? fallback : value;
}

function Section({ id, title, count, description, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `case-section-${id}`;
  return (
    <section className="recovery-case-section">
      <h3 className="recovery-case-section-title">
        <button
          type="button"
          className="recovery-case-section-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="recovery-case-section-title-text">{title}</span>
          {count != null && <span className="recovery-case-section-count">{count}</span>}
          <ChevronDown size={18} aria-hidden className={open ? 'is-expanded' : ''} />
        </button>
      </h3>
      <div id={panelId} className="recovery-case-section-panel" hidden={!open}>
        {description && <p className="recovery-case-section-description">{description}</p>}
        {children}
      </div>
    </section>
  );
}

function ProgramRow({ program, expanded, onToggle }) {
  const catalog = getCatalogProgramPresentation(program);
  const detailsId = `case-program-${program.id || program.program_id || program.title}`.replace(/\s+/g, '-');
  const sections = [
    ['Why it appeared in screening', program.reasons],
    ['Information to review or provide', program.missingInformation],
    ['Conditions and limitations', program.restrictions]
  ];

  return (
    <div className={`recovery-case-recommendation${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="recovery-case-program-toggle"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="recovery-case-program-summary">
          <span className="recovery-case-program-name-group">
            <span className="recovery-case-program-name">{program.title || 'Program title unavailable'}</span>
            {(program.agency || catalog.agency) && (
              <span className="recovery-case-program-agency">{program.agency || catalog.agency}</span>
            )}
          </span>
          <span className={`subsidy-outcome subsidy-outcome--${program.outcomeClass}`}>
            {SCREENING_OUTCOME_LABELS[program.outcomeKey] || 'Status unavailable'}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden className={expanded ? 'is-expanded' : ''} />
      </button>

      <div id={detailsId} className="recovery-case-program-details" hidden={!expanded}>
        <div className="recovery-case-screening-details">
          {sections.map(([label, items]) => (
            <div key={label}>
              <h4>{label}</h4>
              {items.length
                ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                : <p>No details were returned for this section.</p>}
            </div>
          ))}
        </div>
        {(catalog.requirements.length > 0 || catalog.applicationSteps.length > 0) && (
          <div className="recovery-case-program-catalog">
            {catalog.requirements.length > 0 && (
              <div>
                <h4>Requirements listed</h4>
                <ul>{catalog.requirements.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
              </div>
            )}
            {catalog.applicationSteps.length > 0 && (
              <div>
                <h4>Application steps listed</h4>
                <ol>{catalog.applicationSteps.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>
              </div>
            )}
          </div>
        )}
        {catalog.sourceUrl && (
          <a className="subsidy-source-link" style={{ marginTop: 0 }} href={catalog.sourceUrl} target="_blank" rel="noreferrer">
            Open program source or agency website <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

function Recommendations({ programs }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const list = getVisiblePrograms(programs, showAll, INITIAL_PROGRAM_LIMIT);

  return (
    <>
      <p role="note" className="subsidy-screening-disclaimer">
        {'This is preliminary screening, not an official eligibility determination. A program listed here does not guarantee approval. The screening may not account for every agency requirement. Verify current program details and requirements with the responsible agency.'}
      </p>
      <div className="recovery-case-recommendations" id="case-program-list">
        {list.visiblePrograms.map((program, index) => {
          const key = program.id || program.program_id || `${program.title || 'program'}-${index}`;
          return (
            <ProgramRow
              key={key}
              program={program}
              expanded={expandedIds.has(key)}
              onToggle={() => setExpandedIds((current) => toggleExpandedRecommendation(current, key))}
            />
          );
        })}
      </div>
      {list.hasToggle && (
        <button
          type="button"
          className="btn btn-secondary btn-sm recovery-case-recommendation-list-toggle"
          aria-expanded={showAll}
          aria-controls="case-program-list"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? 'Show fewer programs' : `Show all ${list.total} programs`}
        </button>
      )}
    </>
  );
}

function CaseDetail({
  recoveryCase,
  applications,
  applicationsLoading,
  applicationsError,
  onBack,
  onPrepareApplication,
  onOpenApplication,
  onNavigateToWorkflow
}) {
  const detail = getRecoveryCaseDetailModel(recoveryCase);
  const eligibility = getAssessmentEligibilityModel({
    eligibility_results: recoveryCase.eligibility_results,
    matched_subsidies: recoveryCase.recommended_subsidies
  });
  const losses = detail.losses;
  const relatedApplications = getRelatedCaseApplications(applications, recoveryCase.case_id);
  const location = displayCaseValue(detail.location, 'Location unavailable');
  const severity = normalizeRecoverySeverity(recoveryCase.severity_level);
  const hasHouseholdDetails = Object.keys(detail.household).length > 0;
  const hasAssessmentDetails = Boolean(
    recoveryCase.damage_summary
    || recoveryCase.raw_description
    || recoveryCase.severity_level
    || recoveryCase.estimated_cost_min != null
    || recoveryCase.estimated_cost_max != null
  );
  const hasNotes = Boolean(
    recoveryCase.urgency
    || recoveryCase.safety_precautions?.length
    || recoveryCase.suggested_actions?.length
  );
  const canPrepare = Boolean(recoveryCase.case_id);

  const [tab, setTab] = useState('overview');
  const hasCost = recoveryCase.estimated_cost_min != null || recoveryCase.estimated_cost_max != null;
  const programCount = eligibility.state === 'results' ? eligibility.programs.length : 0;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'losses', label: 'Losses', count: losses.length },
    ...(programCount > 0 ? [{ id: 'programs', label: 'Programs', count: programCount }] : []),
    { id: 'applications', label: 'Applications', count: applicationsLoading ? null : relatedApplications.length }
  ];

  return (
    <article className="modern-card recovery-case-detail">
      <button type="button" className="btn btn-secondary btn-sm recovery-case-back" onClick={onBack}>
        <ArrowLeft size={14} /> Back to cases
      </button>

      <header className="recovery-case-head">
        <div>
          <h2 className="card-heading-lg">{recoveryCase.disaster_type || 'Disaster type not recorded'}</h2>
          <p className="recovery-case-detail-meta"><MapPin size={14} aria-hidden /> {location}</p>
          <p className="recovery-case-detail-meta"><CalendarDays size={14} aria-hidden /> {[
            recoveryCase.incident_date ? `Incident: ${dateLabel(recoveryCase.incident_date)}` : '',
            recoveryCase.created_at ? `Created: ${dateLabel(recoveryCase.created_at)}` : ''
          ].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`badge ${SEVERITY_BADGE[severity]}`}>
          {recoveryCase.severity_level || 'Severity not recorded'}
        </span>
      </header>

      <div className="recovery-case-stats">
        <div>
          <span>Estimated cost</span>
          <strong>
            {hasCost
              ? `${recoveryCase.estimated_cost_min != null ? peso(recoveryCase.estimated_cost_min) : '—'} – ${recoveryCase.estimated_cost_max != null ? peso(recoveryCase.estimated_cost_max) : '—'}`
              : 'Not available'}
          </strong>
        </div>
        <div><span>Loss records</span><strong>{losses.length}</strong></div>
        <div><span>Applications</span><strong>{applicationsLoading ? '…' : relatedApplications.length}</strong></div>
      </div>
      <p role="note" className="recovery-case-disclaimer">
        Amounts are unverified estimates, not official decisions.
      </p>

      <div className="recovery-case-action-layout">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canPrepare}
          onClick={() => onPrepareApplication(recoveryCase)}
        >
          Prepare application <ArrowRight size={15} />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canPrepare}
          onClick={() => onNavigateToWorkflow('aid', recoveryCase.case_id)}
        >
          <HandCoins size={15} /> Aid ledger
        </button>
      </div>

      <div className="recovery-case-tabs" role="tablist" aria-label="Case sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`recovery-case-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}{t.count != null && <span>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="recovery-case-tabpanel" role="tabpanel">
        {tab === 'overview' && (
          <>
            <div className="recovery-case-block">
              <h3>Assessment</h3>
              {hasAssessmentDetails ? (
                <>
                  {recoveryCase.damage_summary && <p>{recoveryCase.damage_summary}</p>}
                  {recoveryCase.raw_description && (
                    <p className="card-subheading" style={{ whiteSpace: 'pre-wrap' }}>
                      <strong>Reported: </strong>{recoveryCase.raw_description}
                    </p>
                  )}
                </>
              ) : <p className="card-subheading">No assessment summary is available.</p>}
              {detail.damageCategories.length > 0 && (
                <div className="chip-row">
                  {detail.damageCategories.map((category, index) => (
                    <span className="badge badge-agency" key={`${category}-${index}`}>{category}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="recovery-case-block">
              <h3>Household</h3>
              {hasHouseholdDetails ? (
                <dl className="recovery-case-facts">
                  {Object.entries(detail.household).map(([field, value]) => (
                    <div key={field}><dt>{HOUSEHOLD_LABELS[field] || field}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              ) : <p className="card-subheading">No household details were saved.</p>}
            </div>

            {hasNotes && (
              <div className="recovery-case-block">
                <h3>Notes{recoveryCase.urgency ? ` · ${recoveryCase.urgency} urgency` : ''}</h3>
                {recoveryCase.safety_precautions?.length > 0 && (
                  <>
                    <h4>Safety precautions</h4>
                    <ul>{recoveryCase.safety_precautions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </>
                )}
                {recoveryCase.suggested_actions?.length > 0 && (
                  <>
                    <h4>Suggested next steps</h4>
                    <ul>{recoveryCase.suggested_actions.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'losses' && (
          losses.length ? (
            <ul className="recovery-case-loss-list">
              {losses.map((loss, index) => (
                <li className="recovery-case-loss" key={loss.loss_record_id || index}>
                  <div>
                    <strong>{loss.item_category || loss.item_name || loss.loss_type || 'Loss category not recorded'}</strong>
                    {loss.condition && <span>{loss.condition}</span>}
                    {loss.description && <p>{loss.description}</p>}
                  </div>
                  {loss.estimated_loss_php != null && <b>{peso(loss.estimated_loss_php)}</b>}
                </li>
              ))}
            </ul>
          ) : <p className="card-subheading">No loss records for this case.</p>
        )}

        {tab === 'programs' && programCount > 0 && <Recommendations programs={eligibility.programs} />}

        {tab === 'applications' && (
          <>
            {applicationsLoading && <p role="status" className="card-subheading">Loading…</p>}
            {applicationsError && <p role="alert" className="alert alert-error">{applicationsError}</p>}
            {!applicationsLoading && !applicationsError && relatedApplications.length === 0 && (
              <p className="card-subheading">No applications linked to this case yet.</p>
            )}
            {relatedApplications.map((application) => (
              <div className="recovery-case-related-application" key={application.id}>
                <div>
                  <strong>{application.reference_number}</strong>
                  <p className="card-subheading">{[application.applicant_name, application.status].filter(Boolean).join(' · ')}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenApplication(application)}>
                  <FileText size={14} /> Open
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </article>
  );
}

export default function RecoveryCaseWorkspace({
  user,
  initialCaseId = '',
  onOpenLogin,
  onStartAssessment,
  onPrepareApplication,
  onOpenApplication,
  onNavigateToWorkflow
}) {
  const [cases, setCases] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [error, setError] = useState('');
  const [applicationsError, setApplicationsError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  const refresh = useCallback(async () => {
    if (!isAccountUser) return;
    setLoading(true);
    setApplicationsLoading(true);
    setError('');
    setApplicationsError('');

    const caseRequest = fetchOwnedRecoveryCases()
      .then((ownedCases) => {
        setCases(ownedCases);
        setSelectedCaseId((current) => (
          ownedCases.some((item) => item.case_id === current)
            ? current
            : ownedCases.some((item) => item.case_id === initialCaseId)
              ? initialCaseId
              : ''
        ));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
    const applicationRequest = fetchAccountApplications()
      .then(setApplications)
      .catch((requestError) => setApplicationsError(requestError.message))
      .finally(() => setApplicationsLoading(false));

    await Promise.all([caseRequest, applicationRequest]);
  }, [initialCaseId, isAccountUser]);

  useEffect(() => {
    if (!isAccountUser) {
      setCases([]);
      setApplications([]);
      setSelectedCaseId('');
      setError('');
      setApplicationsError('');
      return;
    }
    refresh();
  }, [isAccountUser, refresh]);

  // Only show the full-page loader on first load; keep the list on screen while refreshing.
  const listView = useMemo(
    () => getRecoveryCaseListView({ cases, loading: loading && cases.length === 0, error }),
    [cases, loading, error]
  );
  const selectedCase = cases.find((item) => item.case_id === selectedCaseId);

  const selectCase = (caseId) => {
    setSelectedCaseId(caseId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isAccountUser) {
    return (
      <div className="modern-card recovery-case-guest">
        <div className="modern-card-header">
          <div>
            <h1 className="card-heading">Sign in to view your cases</h1>
          </div>
          <ShieldAlert size={25} color="var(--primary)" aria-hidden />
        </div>
        <p className="card-subheading">Guest assessments aren't saved to an account.</p>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-primary" onClick={onOpenLogin}>Sign In</button>
          <button type="button" className="btn btn-secondary" onClick={onStartAssessment}>Start New Case</button>
        </div>
      </div>
    );
  }

  return (
    <div className="recovery-case-workspace">
      <div className="modern-card-header recovery-case-workspace-header">
        <div>
          <h1 className="card-heading-lg" style={{ marginBottom: 0 }}>Recovery Cases</h1>
        </div>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStartAssessment}>
            Start New Case <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="recovery-case-error">
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Try again</button>
        </div>
      )}

      {listView.state === 'loading' && <p role="status" className="modern-card">Loading your recovery cases…</p>}
      {listView.state === 'error' && (
        <div className="modern-card recovery-case-empty">
          <p>Your recovery cases could not be loaded.</p>
          <button type="button" className="btn btn-primary" onClick={refresh}>Try again</button>
        </div>
      )}
      {listView.state === 'empty' && (
        <div className="modern-card recovery-case-empty">
          <h2 className="card-heading">No saved recovery cases yet</h2>
          <button type="button" className="btn btn-primary" onClick={onStartAssessment}>Start New Case</button>
        </div>
      )}

      {listView.state === 'list' && (
        <div className={`recovery-case-workspace-grid${selectedCase ? ' has-selection' : ''}`}>
          <section className="modern-card recovery-case-list-panel" aria-label="Your Recovery Cases">
            <div className="recovery-case-list-heading">
              <h2>Saved cases</h2>
              <span>{cases.length}</span>
            </div>
            <div className="recovery-case-list">
              {listView.cases.map((recoveryCase) => {
                const selected = selectedCaseId === recoveryCase.case_id;
                return (
                  <button
                    type="button"
                    key={recoveryCase.case_id}
                    className={`recovery-case-list-item${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => selectCase(recoveryCase.case_id)}
                  >
                    <span className="recovery-case-list-top">
                      <strong>{recoveryCase.disaster_type || 'Disaster type not recorded'}</strong>
                      {recoveryCase.severity_level && (
                        <span className={`badge ${SEVERITY_BADGE[normalizeRecoverySeverity(recoveryCase.severity_level)]}`}>{recoveryCase.severity_level}</span>
                      )}
                    </span>
                    <span className="recovery-case-list-meta"><MapPin size={13} aria-hidden /> {getRecoveryCaseDetailModel(recoveryCase).location || 'Location not recorded'}</span>
                    {(recoveryCase.incident_date || recoveryCase.created_at) && (
                      <span className="recovery-case-list-meta"><CalendarDays size={13} aria-hidden /> {dateLabel(recoveryCase.incident_date || recoveryCase.created_at)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {selectedCase ? (
            <CaseDetail
              key={selectedCase.case_id}
              recoveryCase={selectedCase}
              applications={applications}
              applicationsLoading={applicationsLoading}
              applicationsError={applicationsError}
              onBack={() => setSelectedCaseId('')}
              onPrepareApplication={onPrepareApplication}
              onOpenApplication={onOpenApplication}
              onNavigateToWorkflow={onNavigateToWorkflow}
            />
          ) : (
            <div className="modern-card recovery-case-empty recovery-case-placeholder">
              <FolderOpen size={32} color="var(--slate-500)" aria-hidden />
              <h2 className="card-heading" style={{ marginBottom: 0 }}>Select a case to view details</h2>

            </div>
          )}
        </div>
      )}
    </div>
  );
}