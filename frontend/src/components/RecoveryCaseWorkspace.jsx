import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, HandCoins, RefreshCw, ShieldAlert } from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/assessmentApi';
import {
  createCaseApplicationContext,
  getRecoveryCaseDetailModel,
  getRecoveryCaseListView,
  getRelatedCaseApplications,
  isUnavailableCaseValue
} from '../utils/recoveryCaseWorkspace';
import { getAssessmentEligibilityModel } from '../utils/subsidyPresentation';

const SCREENING_OUTCOME_LABELS = {
  eligible: 'Likely eligible',
  maybe: 'Potentially eligible',
  ineligible: 'Not likely eligible',
  unavailable: 'Information unavailable'
};

const SCREENING_SECTION_LABELS = {
  screeningReasons: 'Reasons',
  screeningMissingInformation: 'Missing information',
  screeningRestrictions: 'Restrictions'
};

function dateLabel(value) {
  if (!value) return '';
  const date = new Date(value.includes(' ') ? `${value.replace(' ', 'T')}Z` : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
}

function peso(value) {
  return `₱${Number(value).toLocaleString('en-PH', {
    maximumFractionDigits: 2
  })}`;
}

function displayCaseValue(value, fallback) {
  return isUnavailableCaseValue(value) ? fallback : value;
}

function CaseDetail({
  recoveryCase,
  applications,
  applicationsLoading,
  applicationsError,
  onPrepareApplication,
  onOpenApplication,
  onNavigateToWorkflow}) {
  const detail = getRecoveryCaseDetailModel(recoveryCase);
  const eligibility = getAssessmentEligibilityModel({
    eligibility_results: recoveryCase.eligibility_results,
    matched_subsidies: recoveryCase.recommended_subsidies
  });
  const losses = detail.losses;
  const relatedApplications = getRelatedCaseApplications(applications, recoveryCase.case_id);
  const location = displayCaseValue(detail.location, 'Location unavailable');
  const householdLabels = {
    applicant_name: "Applicant Full Name",
    contact_number: "Contact Number",
    household_size: "Household members",
    household_members_count: "Household members"
  };
  const hasHouseholdDetails = Object.keys(detail.household).length > 0;
  const hasAssessmentDetails = Boolean(
    recoveryCase.damage_summary
    || recoveryCase.raw_description
    || recoveryCase.severity_level
    || recoveryCase.estimated_cost_min != null
    || recoveryCase.estimated_cost_max != null
  );
  return (
    <article className="modern-card recovery-case-detail">
      <header className="modern-card-header">
        <div>
          <p className="eyebrow">{"Case details"}</p>
          <h2 className="card-heading-lg">{recoveryCase.disaster_type || "Disaster type not recorded"}</h2>
          <p className="card-subheading">{location || "Location not recorded"}</p>
          <p className="card-subheading">
            {recoveryCase.incident_date ? `${"Incident Date"}: ${dateLabel(recoveryCase.incident_date)}` : ''}
            {recoveryCase.created_at ? ` · ${"Created"}: ${dateLabel(recoveryCase.created_at)}` : ''}
          </p>
        </div>
        <span className="badge badge-agency">{recoveryCase.severity_level || "Severity not recorded"}</span>
      </header>

      <p role="note" className="recovery-case-disclaimer">{"Assessment outputs and amounts are estimates based on reported information. They are not verified losses, official eligibility decisions, or guarantees of assistance."}</p>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{"Household information saved with this case"}</h3>
        {hasHouseholdDetails ? (
          <dl className="recovery-case-facts">
            {Object.entries(detail.household).map(([field, value]) => (
              <div key={field}><dt>{householdLabels[field]}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        ) : <p className="card-subheading">{"No household or contact details were saved with this case."}</p>}
      </section>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{"Assessment summary"}</h3>
        {hasAssessmentDetails ? (
          <>
            {recoveryCase.damage_summary && <p>{recoveryCase.damage_summary}</p>}
            {recoveryCase.raw_description && (
              <p className="card-subheading" style={{ whiteSpace: 'pre-wrap' }}>
                <strong>{"Reported damage details"}: </strong>{recoveryCase.raw_description}
              </p>
            )}
            {recoveryCase.severity_level && (
              <p><strong>{"Severity Level"}: </strong>{recoveryCase.severity_level}</p>
            )}
            {(recoveryCase.estimated_cost_min != null || recoveryCase.estimated_cost_max != null) && (
              <p>
                <strong>{"Estimated recovery cost (not verified)"}: </strong>
                {recoveryCase.estimated_cost_min != null ? peso(recoveryCase.estimated_cost_min) : '—'}
                {' – '}
                {recoveryCase.estimated_cost_max != null ? peso(recoveryCase.estimated_cost_max) : '—'}
              </p>
            )}
          </>
        ) : <p className="card-subheading">{"No assessment summary or estimate is available for this case."}</p>}
        {detail.damageCategories.length > 0 && (
          <div className="chip-row">
            {detail.damageCategories.map((category, index) => (
              <span className="badge badge-agency" key={`${category}-${index}`}>{category}</span>
            ))}
          </div>
        )}
      </section>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{"Recorded loss categories"}</h3>
        {losses.length ? (
          <div className="recovery-case-loss-list">
            {losses.map((loss) => (
              <div className="flow-card recovery-case-loss" key={loss.loss_record_id}>
                <strong>{loss.item_category || loss.item_name || loss.loss_type || "Loss category not recorded"}</strong>
                {loss.condition && <span>{"Recorded condition"}: {loss.condition}</span>}
                {loss.estimated_loss_php != null && (
                  <span>{"Estimated loss (not verified)"}: {peso(loss.estimated_loss_php)}</span>
                )}
                {loss.description && <p>{loss.description}</p>}
              </div>
            ))}
          </div>
        ) : <p className="card-subheading">{"No separate loss records are available for this case."}</p>}
      </section>

      {(recoveryCase.urgency
        || recoveryCase.safety_precautions?.length
        || recoveryCase.suggested_actions?.length
        || eligibility.state === 'results') && (
        <section className="recovery-case-section">
          <h3 className="application-section-heading">{"Assessment notes"}</h3>
          {recoveryCase.urgency && <p><strong>{"Assessment urgency"}: </strong>{recoveryCase.urgency}</p>}
          {recoveryCase.safety_precautions?.length > 0 && (
            <>
              <strong>{"Safety precautions suggested by the assessment"}</strong>
              <ul>{recoveryCase.safety_precautions.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </>
          )}
          {recoveryCase.suggested_actions?.length > 0 && (
            <>
              <strong>{"Suggested next steps"}</strong>
              <ul>{recoveryCase.suggested_actions.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </>
          )}
          {eligibility.state === 'results' && (
            <>
              <strong>{"Possible program matches (not an official decision)"}</strong>
              <p role="note" className="subsidy-screening-disclaimer">
                {"This is preliminary screening, not an official eligibility determination. A program listed here does not guarantee approval. The screening may not account for every agency requirement. Verify current program details and requirements with the responsible agency."}
              </p>
              <div className="subsidy-grid">
                {eligibility.programs.map((program, index) => (
                  <article
                    key={program.id || program.program_id || `${program.title || 'program'}-${index}`}
                    className={`subsidy-card subsidy-screening-card subsidy-screening-card--${program.outcomeClass}`}
                  >
                    <div>
                      <span className={`subsidy-outcome subsidy-outcome--${program.outcomeClass}`}>
                        {SCREENING_OUTCOME_LABELS[program.outcomeKey] || 'Status unavailable'}
                      </span>
                      <h4>{program.title || "Program title unavailable"}</h4>
                      <div className="subsidy-screening-details">
                        {[
                          ['screeningReasons', program.reasons],
                          ['screeningMissingInformation', program.missingInformation],
                          ['screeningRestrictions', program.restrictions]
                        ].map(([label, items]) => (
                          <div key={label}>
                            <strong>{SCREENING_SECTION_LABELS[label] || label}</strong>
                            {items.length
                              ? <ul>{items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                              : <p>{"No details were returned for this section."}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="recovery-case-section">
        <div className="recovery-case-section-heading">
          <h3 className="application-section-heading">{"Applications linked to this case"}</h3>
          {applicationsLoading && <span role="status">{"Loading…"}</span>}
        </div>
        {applicationsError && <p role="alert" className="recovery-case-error">{applicationsError}</p>}
        {!applicationsLoading && !applicationsError && relatedApplications.length === 0 && (
          <p className="card-subheading">{"No saved applications are linked to this case."}</p>
        )}
        {relatedApplications.map((application) => (
          <div className="recovery-case-related-application" key={application.id}>
            <div>
              <strong>{application.reference_number}</strong>
              <p className="card-subheading">{application.applicant_name} · {application.status}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenApplication(application)}>
              <FileText size={14} /> {"Open application"}
            </button>
          </div>
        ))}
      </section>

      <div className="recovery-case-actions">
        <button type="button" className="btn btn-primary" onClick={() => onPrepareApplication(recoveryCase)}>
          {"Prepare an application for this case"} <ArrowRight size={15} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onNavigateToWorkflow('aid', recoveryCase.case_id)}>
          <HandCoins size={15} /> {"Open aid ledger for this case"}
        </button>
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

  const listView = useMemo(
    () => getRecoveryCaseListView({ cases, loading, error }),
    [cases, loading, error]
  );
  const selectedCase = cases.find((item) => item.case_id === selectedCaseId);

  if (!isAccountUser) {
    return (
      <div className="modern-card">
        <div className="modern-card-header">
          <div>
            <p className="eyebrow">{"Recovery case workspace"}</p>
            <h1 className="card-heading">{"Guest cases are not recoverable here"}</h1>
          </div>
          <ShieldAlert size={25} color="var(--primary)" />
        </div>
        <p className="card-subheading">{"Guest assessments are not linked to an account and cannot be retrieved from this workspace or another device."}</p>
        <p>{"Your current assessment may still be open in this browser. Sign in before creating a new assessment to save future cases to your account."}</p>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-primary" onClick={onOpenLogin}>{"Sign In"}</button>
          <button type="button" className="btn btn-secondary" onClick={onStartAssessment}>{"Start New Case"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="recovery-case-workspace">
      <div className="modern-card-header">
        <div>
          <p className="eyebrow">{"Recovery case workspace"}</p>
          <h1 className="card-heading-lg">{"Your Recovery Cases"}</h1>
          <p className="card-subheading">{"Review saved case details and continue to the related assistance workflows."}</p>
        </div>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStartAssessment}>
            {"Start New Case"} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="recovery-case-error">
          {error}
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>{"Try again"}</button>
        </div>
      )}

      {listView.state === 'loading' && <p role="status" className="modern-card">{"Loading your recovery cases…"}</p>}
      {listView.state === 'error' && (
        <div className="modern-card">
          <p>{"Your recovery cases could not be loaded."}</p>
          <button type="button" className="btn btn-primary" onClick={refresh}>{"Try again"}</button>
        </div>
      )}
      {listView.state === 'empty' && (
        <div className="modern-card recovery-case-empty">
          <h2 className="card-heading">{"No saved recovery cases yet"}</h2>
          <p className="card-subheading">{"Complete a damage assessment while signed in to save a case to your account."}</p>
          <button type="button" className="btn btn-primary" onClick={onStartAssessment}>{"Start New Case"}</button>
        </div>
      )}

      {listView.state === 'list' && (
        <div className="recovery-case-workspace-grid">
          <section className="modern-card recovery-case-list-panel" aria-label={"Your Recovery Cases"}>
            <h2 className="application-section-heading">{"Saved cases"} ({cases.length})</h2>
            <div className="recovery-case-list">
              {listView.cases.map((recoveryCase) => (
                <button
                  type="button"
                  key={recoveryCase.case_id}
                  className={`recovery-case-list-item${selectedCaseId === recoveryCase.case_id ? ' is-selected' : ''}`}
                  aria-pressed={selectedCaseId === recoveryCase.case_id}
                  onClick={() => setSelectedCaseId(recoveryCase.case_id)}
                >
                  <strong>{recoveryCase.disaster_type || "Disaster type not recorded"}</strong>
                  <span>{getRecoveryCaseDetailModel(recoveryCase).location || "Location not recorded"}</span>
                  {recoveryCase.incident_date && (
                    <span>{"Incident Date"}: {dateLabel(recoveryCase.incident_date)}</span>
                  )}
                  {recoveryCase.created_at && (
                    <span>{"Created"}: {dateLabel(recoveryCase.created_at)}</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {selectedCase ? (
            <CaseDetail
              key={selectedCase.case_id}
              recoveryCase={selectedCase}
              applications={applications}
              applicationsLoading={applicationsLoading}
              applicationsError={applicationsError}
              onPrepareApplication={onPrepareApplication}
              onOpenApplication={onOpenApplication}
              onNavigateToWorkflow={onNavigateToWorkflow}
            />
          ) : (
            <div className="modern-card recovery-case-empty">
              <h2 className="card-heading">{"Select a recovery case"}</h2>
              <p className="card-subheading">{"Choose a case from the list to inspect its saved assessment and loss records."}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
