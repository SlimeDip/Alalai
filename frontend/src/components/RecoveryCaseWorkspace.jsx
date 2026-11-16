import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, FileText, HandCoins, RefreshCw, ShieldAlert, FolderOpen } from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  createCaseApplicationContext,
  getRecoveryCaseDetailModel,
  getRecoveryCaseListView,
  getRelatedCaseApplications
} from '../utils/recoveryCaseWorkspace';
import { getAssessmentEligibilityModel } from '../utils/subsidyPresentation';

function dateLabel(value, lang) {
  if (!value) return '';
  const date = new Date(value.includes(' ') ? `${value.replace(' ', 'T')}Z` : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
}

function peso(value, lang) {
  return `₱${Number(value).toLocaleString(lang === 'tl' ? 'fil-PH' : 'en-PH', {
    maximumFractionDigits: 2
  })}`;
}

function CaseDetail({
  recoveryCase,
  applications,
  applicationsLoading,
  applicationsError,
  onPrepareApplication,
  onOpenApplication,
  onNavigateToWorkflow,
  t,
  lang
}) {
  const detail = getRecoveryCaseDetailModel(recoveryCase);
  const eligibility = getAssessmentEligibilityModel({
    eligibility_results: recoveryCase.eligibility_results,
    matched_subsidies: recoveryCase.recommended_subsidies
  });
  const losses = detail.losses;
  const relatedApplications = getRelatedCaseApplications(applications, recoveryCase.case_id);
  const location = detail.location;
  const householdLabels = {
    applicant_name: t('fullName'),
    contact_number: t('phone'),
    household_size: t('householdSize'),
    household_members_count: t('householdSize')
  };
  const hasHouseholdDetails = Object.keys(detail.household).length > 0;
  const hasAssessmentDetails = Boolean(
    recoveryCase.damage_summary
    || recoveryCase.severity_level
    || recoveryCase.estimated_cost_min != null
    || recoveryCase.estimated_cost_max != null
  );

  return (
    <article className="modern-card recovery-case-detail">
      <header className="modern-card-header">
        <div>
          <p className="eyebrow">{t('recoveryCaseDetails')}</p>
          <h2 className="card-heading-lg">{recoveryCase.disaster_type || t('disasterTypeUnavailable')}</h2>
          <p className="card-subheading">{location || t('locationUnavailable')}</p>
          <p className="card-subheading">
            {recoveryCase.incident_date ? `${t('disasterDate')}: ${dateLabel(recoveryCase.incident_date, lang)}` : ''}
            {recoveryCase.created_at ? ` · ${t('caseCreated')}: ${dateLabel(recoveryCase.created_at, lang)}` : ''}
          </p>
        </div>
        <span className="badge badge-agency">{recoveryCase.severity_level || t('severityUnavailable')}</span>
      </header>

      <p role="note" className="recovery-case-disclaimer">{t('caseEstimateDisclaimer')}</p>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{t('householdInformation')}</h3>
        {hasHouseholdDetails ? (
          <dl className="recovery-case-facts">
            {Object.entries(detail.household).map(([field, value]) => (
              <div key={field}><dt>{householdLabels[field]}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        ) : <p className="card-subheading">{t('caseHouseholdUnavailable')}</p>}
      </section>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{t('assessmentSummary')}</h3>
        {hasAssessmentDetails ? (
          <>
            {recoveryCase.damage_summary && <p>{recoveryCase.damage_summary}</p>}
            {recoveryCase.raw_description && (
              <p className="card-subheading" style={{ whiteSpace: 'pre-wrap' }}>
                <strong>{t('reportedDamageDetails')}: </strong>{recoveryCase.raw_description}
              </p>
            )}
            {recoveryCase.severity_level && (
              <p><strong>{t('severityLabel')}: </strong>{recoveryCase.severity_level}</p>
            )}
            {(recoveryCase.estimated_cost_min != null || recoveryCase.estimated_cost_max != null) && (
              <p>
                <strong>{t('assessmentEstimate')}: </strong>
                {recoveryCase.estimated_cost_min != null ? peso(recoveryCase.estimated_cost_min, lang) : '—'}
                {' – '}
                {recoveryCase.estimated_cost_max != null ? peso(recoveryCase.estimated_cost_max, lang) : '—'}
              </p>
            )}
          </>
        ) : <p className="card-subheading">{t('caseAssessmentUnavailable')}</p>}
        {detail.damageCategories.length > 0 && (
          <div className="chip-row">
            {detail.damageCategories.map((category, index) => (
              <span className="badge badge-agency" key={`${category}-${index}`}>{category}</span>
            ))}
          </div>
        )}
      </section>

      <section className="recovery-case-section">
        <h3 className="application-section-heading">{t('recordedLosses')}</h3>
        {losses.length ? (
          <div className="recovery-case-loss-list">
            {losses.map((loss) => (
              <div className="flow-card recovery-case-loss" key={loss.loss_record_id}>
                <strong>{loss.item_category || loss.item_name || loss.loss_type || t('lossCategoryUnavailable')}</strong>
                {loss.condition && <span>{t('recordedCondition')}: {loss.condition}</span>}
                {loss.estimated_loss_php != null && (
                  <span>{t('recordedEstimate')}: {peso(loss.estimated_loss_php, lang)}</span>
                )}
                {loss.description && <p>{loss.description}</p>}
              </div>
            ))}
          </div>
        ) : <p className="card-subheading">{t('caseLossesUnavailable')}</p>}
      </section>

      {(recoveryCase.urgency
        || recoveryCase.safety_precautions?.length
        || recoveryCase.suggested_actions?.length
        || eligibility.state === 'results') && (
        <section className="recovery-case-section">
          <h3 className="application-section-heading">{t('assessmentNotes')}</h3>
          {recoveryCase.urgency && <p><strong>{t('assessmentUrgency')}: </strong>{recoveryCase.urgency}</p>}
          {recoveryCase.safety_precautions?.length > 0 && (
            <>
              <strong>{t('safetyPrecautions')}</strong>
              <ul>{recoveryCase.safety_precautions.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </>
          )}
          {recoveryCase.suggested_actions?.length > 0 && (
            <>
              <strong>{t('suggestedActions')}</strong>
              <ul>{recoveryCase.suggested_actions.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </>
          )}
          {eligibility.state === 'results' && (
            <>
              <strong>{t('assessmentEligibility')}</strong>
              <p role="note" className="subsidy-screening-disclaimer">
                {t('screeningDisclaimer')}
              </p>
              <div className="subsidy-grid">
                {eligibility.programs.map((program, index) => (
                  <article
                    key={program.id || program.program_id || `${program.title || 'program'}-${index}`}
                    className={`subsidy-card subsidy-screening-card subsidy-screening-card--${program.outcomeClass}`}
                  >
                    <div>
                      <span className={`subsidy-outcome subsidy-outcome--${program.outcomeClass}`}>
                        {t(`screeningOutcome${program.outcomeKey.charAt(0).toUpperCase()}${program.outcomeKey.slice(1)}`)}
                      </span>
                      <h4>{program.title || t('programTitleUnavailable')}</h4>
                      <div className="subsidy-screening-details">
                        {[
                          ['screeningReasons', program.reasons],
                          ['screeningMissingInformation', program.missingInformation],
                          ['screeningRestrictions', program.restrictions]
                        ].map(([label, items]) => (
                          <div key={label}>
                            <strong>{t(label)}</strong>
                            {items.length
                              ? <ul>{items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                              : <p>{t('screeningDetailsNotReturned')}</p>}
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
          <h3 className="application-section-heading">{t('relatedApplications')}</h3>
          {applicationsLoading && <span role="status">{t('loading')}</span>}
        </div>
        {applicationsError && <p role="alert" className="recovery-case-error">{applicationsError}</p>}
        {!applicationsLoading && !applicationsError && relatedApplications.length === 0 && (
          <p className="card-subheading">{t('noRelatedApplications')}</p>
        )}
        {relatedApplications.map((application) => (
          <div className="recovery-case-related-application" key={application.id}>
            <div>
              <strong>{application.reference_number}</strong>
              <p className="card-subheading">{application.applicant_name} · {application.status}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenApplication(application)}>
              <FileText size={14} /> {t('openApplication')}
            </button>
          </div>
        ))}
      </section>

      <div className="recovery-case-actions">
        <button type="button" className="btn btn-primary" onClick={() => onPrepareApplication(recoveryCase)}>
          {t('prepareApplicationFromCase')} <ArrowRight size={15} />
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onNavigateToWorkflow('tracker', recoveryCase.case_id)}>
          <BriefcaseBusiness size={15} /> {t('openCaseTracker')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onNavigateToWorkflow('aid', recoveryCase.case_id)}>
          <HandCoins size={15} /> {t('openCaseAidLedger')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onNavigateToWorkflow('vault', recoveryCase.case_id)}>
          <FolderOpen size={15} /> {t('openCaseDocuments')}
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
  onNavigateToWorkflow,
  t,
  lang = 'en'
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
            <p className="eyebrow">{t('recoveryCaseWorkspace')}</p>
            <h1 className="card-heading">{t('guestCasesTitle')}</h1>
          </div>
          <ShieldAlert size={25} color="var(--primary)" />
        </div>
        <p className="card-subheading">{t('guestCasesNotice')}</p>
        <p>{t('guestCasesNextStep')}</p>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-primary" onClick={onOpenLogin}>{t('login')}</button>
          <button type="button" className="btn btn-secondary" onClick={onStartAssessment}>{t('startNewCase')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="recovery-case-workspace">
      <div className="modern-card-header">
        <div>
          <p className="eyebrow">{t('recoveryCaseWorkspace')}</p>
          <h1 className="card-heading-lg">{t('recoveryCasesTitle')}</h1>
          <p className="card-subheading">{t('recoveryCasesSubtitle')}</p>
        </div>
        <div className="recovery-case-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} /> {loading ? t('loading') : t('refresh')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStartAssessment}>
            {t('startNewCase')} <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="recovery-case-error">
          {error}
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>{t('retry')}</button>
        </div>
      )}

      {listView.state === 'loading' && <p role="status" className="modern-card">{t('loadingRecoveryCases')}</p>}
      {listView.state === 'error' && (
        <div className="modern-card">
          <p>{t('recoveryCasesLoadError')}</p>
          <button type="button" className="btn btn-primary" onClick={refresh}>{t('retry')}</button>
        </div>
      )}
      {listView.state === 'empty' && (
        <div className="modern-card recovery-case-empty">
          <h2 className="card-heading">{t('noRecoveryCases')}</h2>
          <p className="card-subheading">{t('noRecoveryCasesHelp')}</p>
          <button type="button" className="btn btn-primary" onClick={onStartAssessment}>{t('startNewCase')}</button>
        </div>
      )}

      {listView.state === 'list' && (
        <div className="recovery-case-workspace-grid">
          <section className="modern-card" aria-label={t('recoveryCasesTitle')}>
            <h2 className="application-section-heading">{t('yourRecoveryCases')} ({cases.length})</h2>
            <div className="recovery-case-list">
              {listView.cases.map((recoveryCase) => (
                <button
                  type="button"
                  key={recoveryCase.case_id}
                  className={`recovery-case-list-item${selectedCaseId === recoveryCase.case_id ? ' is-selected' : ''}`}
                  aria-pressed={selectedCaseId === recoveryCase.case_id}
                  onClick={() => setSelectedCaseId(recoveryCase.case_id)}
                >
                  <strong>{recoveryCase.disaster_type || t('disasterTypeUnavailable')}</strong>
                  <span>{getRecoveryCaseDetailModel(recoveryCase).location || t('locationUnavailable')}</span>
                  {recoveryCase.incident_date && (
                    <span>{t('disasterDate')}: {dateLabel(recoveryCase.incident_date, lang)}</span>
                  )}
                  {recoveryCase.created_at && (
                    <span>{t('caseCreated')}: {dateLabel(recoveryCase.created_at, lang)}</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {selectedCase ? (
            <CaseDetail
              recoveryCase={selectedCase}
              applications={applications}
              applicationsLoading={applicationsLoading}
              applicationsError={applicationsError}
              onPrepareApplication={onPrepareApplication}
              onOpenApplication={onOpenApplication}
              onNavigateToWorkflow={onNavigateToWorkflow}
              t={t}
              lang={lang}
            />
          ) : (
            <div className="modern-card recovery-case-empty">
              <h2 className="card-heading">{t('selectRecoveryCaseTitle')}</h2>
              <p className="card-subheading">{t('selectRecoveryCaseHelp')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
