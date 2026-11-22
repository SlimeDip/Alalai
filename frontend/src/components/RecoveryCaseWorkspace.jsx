import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, ChevronDown, FileText, HandCoins, RefreshCw, ShieldAlert, FolderOpen } from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  createCaseApplicationContext,
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

function displayCaseValue(value, fallback) {
  return isUnavailableCaseValue(value) ? fallback : value;
}

function caseDateLabel(value, lang, fallback) {
  const displayValue = displayCaseValue(value, fallback);
  return displayValue === fallback ? fallback : dateLabel(displayValue, lang);
}

function severityPresentation(value, t) {
  const severity = normalizeRecoverySeverity(value);
  const labels = {
    severe: 'Severe',
    moderate: 'Moderate',
    low: 'Low',
    unknown: t('severityUnavailable')
  };
  return {
    label: labels[severity],
    className: `badge recovery-case-severity recovery-case-severity--${severity}`
  };
}

function CaseSection({
  sectionId,
  title,
  headingText,
  description,
  expanded,
  onToggle,
  headerMeta,
  className = '',
  children,
  t
}) {
  const panelId = `recovery-case-section-${sectionId}`;
  return (
    <section className={`recovery-case-section ${className}`}>
      <h3 className="recovery-case-section-title">
        <button
          type="button"
          id={`${panelId}-toggle`}
          className="recovery-case-section-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${t(expanded ? 'collapseCaseSection' : 'expandCaseSection')}: ${headingText}`}
          onClick={onToggle}
        >
          <span className="recovery-case-section-title-text">{title}</span>
          {headerMeta}
          <ChevronDown className={expanded ? 'is-expanded' : ''} size={18} aria-hidden="true" />
        </button>
      </h3>
      <div
        className="recovery-case-section-panel"
        id={panelId}
        aria-labelledby={`${panelId}-toggle`}
        hidden={!expanded}
      >
        {description && <p className="recovery-case-section-description">{description}</p>}
        {children}
      </div>
    </section>
  );
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
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [expandedRecommendations, setExpandedRecommendations] = useState(() => new Set());
  const [collapsedSections, setCollapsedSections] = useState(() => new Set(['losses', 'notes']));
  const detail = getRecoveryCaseDetailModel(recoveryCase);
  const eligibility = getAssessmentEligibilityModel({
    eligibility_results: recoveryCase.eligibility_results,
    matched_subsidies: recoveryCase.recommended_subsidies
  });
  const recommendationList = getVisiblePrograms(
    eligibility.programs,
    showAllRecommendations
  );
  const losses = detail.losses;
  const relatedApplications = getRelatedCaseApplications(applications, recoveryCase.case_id);
  const location = displayCaseValue(detail.location, t('locationUnavailable'));
  const sectionExpanded = (sectionId) => !collapsedSections.has(sectionId);
  const toggleSection = (sectionId) => setCollapsedSections((current) => {
    const next = new Set(current);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    return next;
  });
  const householdLabels = {
    applicant_name: t('fullName'),
    contact_number: t('phone'),
    household_size: t('householdSize'),
    household_members_count: t('householdSize')
  };
  const householdFacts = [
    ['applicant_name', detail.household.applicant_name],
    ['contact_number', detail.household.contact_number],
    ...(detail.household.household_size != null
      ? [['household_size', detail.household.household_size]]
      : detail.household.household_members_count != null
        ? [['household_members_count', detail.household.household_members_count]]
        : [])
  ];
  const hasAssessmentDetails = Boolean(
    recoveryCase.damage_summary
    || recoveryCase.raw_description
    || recoveryCase.severity_level
    || recoveryCase.estimated_cost_min != null
    || recoveryCase.estimated_cost_max != null
  );
  const unavailableInformation = t('caseInformationUnavailable');
  const incidentDate = displayCaseValue(recoveryCase.incident_date, unavailableInformation);
  const caseCreatedDate = displayCaseValue(recoveryCase.created_at, unavailableInformation);
  const disasterType = displayCaseValue(recoveryCase.disaster_type, t('disasterTypeUnavailable'));
  const severity = severityPresentation(recoveryCase.severity_level, t);

  return (
    <article className="modern-card recovery-case-detail">
      <header className="modern-card-header">
        <div>
          <p className="eyebrow">{t('recoveryCaseWorkspace')}</p>
          <h2 className="card-heading-lg">{t('recoveryCaseDetails')}</h2>
        </div>
        <span className={severity.className}>{severity.label}</span>
      </header>

      <p role="note" className="recovery-case-disclaimer">{t('caseEstimateDisclaimer')}</p>

      <CaseSection
        sectionId="incident"
        title={t('disasterIncidentInformation')}
        headingText={t('disasterIncidentInformation')}
        description={t('caseIncidentSectionDescription')}
        expanded={sectionExpanded('incident')}
        onToggle={() => toggleSection('incident')}
        t={t}
      >
        <dl className="recovery-case-facts recovery-case-incident-facts">
          <div><dt>{t('disasterType')}</dt><dd>{disasterType}</dd></div>
          <div><dt>{t('caseLocation')}</dt><dd>{location}</dd></div>
          <div>
            <dt>{t('disasterDate')}</dt>
            <dd>{incidentDate === unavailableInformation ? incidentDate : dateLabel(incidentDate, lang)}</dd>
          </div>
          <div>
            <dt>{t('caseCreated')}</dt>
            <dd>{caseCreatedDate === unavailableInformation ? caseCreatedDate : dateLabel(caseCreatedDate, lang)}</dd>
          </div>
        </dl>
      </CaseSection>

      <CaseSection
        sectionId="household"
        title={t('householdInformationTitle')}
        headingText={t('householdInformationTitle')}
        description={t('caseHouseholdSectionDescription')}
        expanded={sectionExpanded('household')}
        onToggle={() => toggleSection('household')}
        t={t}
      >
        <dl className="recovery-case-facts recovery-case-household-facts">
          {householdFacts.map(([field, value]) => (
            <div key={field}>
              <dt>{householdLabels[field]}</dt>
              <dd>{displayCaseValue(value, unavailableInformation)}</dd>
            </div>
          ))}
        </dl>
      </CaseSection>

      <CaseSection
        sectionId="assessment"
        title={t('assessmentSummary')}
        headingText={t('assessmentSummary')}
        description={t('caseAssessmentSectionDescription')}
        expanded={sectionExpanded('assessment')}
        onToggle={() => toggleSection('assessment')}
        t={t}
      >
        {hasAssessmentDetails ? (
          <>
            {recoveryCase.damage_summary && <p>{recoveryCase.damage_summary}</p>}
            {recoveryCase.raw_description && (
              <p className="card-subheading" style={{ whiteSpace: 'pre-wrap' }}>
                <strong>{t('reportedDamageDetails')}: </strong>{recoveryCase.raw_description}
              </p>
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
        <p className="recovery-case-assessment-severity">
          <strong>{t('severityLabel')}: </strong>
          <span className={severity.className}>{severity.label}</span>
        </p>
        {detail.damageCategories.length > 0 && (
          <div className="chip-row">
            {detail.damageCategories.map((category, index) => (
              <span className="badge badge-agency" key={`${category}-${index}`}>{category}</span>
            ))}
          </div>
        )}
      </CaseSection>

      <CaseSection
        sectionId="losses"
        title={t('recordedLosses')}
        headingText={t('recordedLosses')}
        description={t('caseLossesSectionDescription')}
        expanded={sectionExpanded('losses')}
        onToggle={() => toggleSection('losses')}
        t={t}
      >
        {losses.length ? (
          <div className="recovery-case-loss-list">
            {losses.map((loss) => {
              const lossSeverity = severityPresentation(loss.condition, t);
              return (
                <div className="flow-card recovery-case-loss" key={loss.loss_record_id}>
                  <strong>{loss.item_category || loss.item_name || loss.loss_type || t('lossCategoryUnavailable')}</strong>
                  <span className="recovery-case-loss-condition">
                    {t('recordedCondition')}: <span className={lossSeverity.className}>{lossSeverity.label}</span>
                  </span>
                  {loss.estimated_loss_php != null && (
                    <span>{t('recordedEstimate')}: {peso(loss.estimated_loss_php, lang)}</span>
                  )}
                  {loss.description && <p>{loss.description}</p>}
                </div>
              );
            })}
          </div>
        ) : <p className="card-subheading">{t('caseLossesUnavailable')}</p>}
      </CaseSection>

      {(recoveryCase.urgency
        || recoveryCase.safety_precautions?.length
        || recoveryCase.suggested_actions?.length) && (
        <CaseSection
          sectionId="notes"
          title={t('assessmentNotes')}
          headingText={t('assessmentNotes')}
          description={t('caseAssessmentNotesDescription')}
          expanded={sectionExpanded('notes')}
          onToggle={() => toggleSection('notes')}
          t={t}
        >
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
        </CaseSection>
      )}

      {eligibility.state === 'results' && (
        <CaseSection
          sectionId="recommendations"
          title={t('recommendedAssistancePrograms')}
          headingText={t('recommendedAssistancePrograms')}
          headerMeta={<span className="recovery-case-section-count">{recommendationList.total}</span>}
          description={t('caseRecommendationsSectionDescription')}
          expanded={sectionExpanded('recommendations')}
          onToggle={() => toggleSection('recommendations')}
          className="recovery-case-recommendation-section"
          t={t}
        >
          <p role="note" className="subsidy-screening-disclaimer">{t('screeningDisclaimer')}</p>
          <div className="recovery-case-recommendations" id="recovery-case-recommendation-list">
            {recommendationList.visiblePrograms.map((program, index) => {
              const recommendationId = program.id || program.program_id || `${program.title || 'program'}-${index}`;
              const isExpanded = expandedRecommendations.has(recommendationId);
              const detailsId = `recovery-case-program-details-${index}`;
              const catalog = getCatalogProgramPresentation(program);
              const outcomeKey = `${program.outcomeKey.charAt(0).toUpperCase()}${program.outcomeKey.slice(1)}`;

              return (
                <article
                  key={`${recommendationId}-${index}`}
                  className={`recovery-case-recommendation${isExpanded ? ' is-expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="recovery-case-program-toggle"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    aria-label={`${t(isExpanded ? 'collapseProgramDetails' : 'expandProgramDetails')}: ${program.title || t('programTitleUnavailable')}`}
                    onClick={() => setExpandedRecommendations((current) => (
                      toggleExpandedRecommendation(current, recommendationId)
                    ))}
                  >
                    <span className="recovery-case-program-summary">
                      <span className="recovery-case-program-name-group">
                        <strong className="recovery-case-program-name">
                          {program.title || t('programTitleUnavailable')}
                        </strong>
                        <span className="recovery-case-program-agency">
                          {catalog.agency || t('programAgencyUnavailable')}
                        </span>
                      </span>
                      <span className={`subsidy-outcome subsidy-outcome--${program.outcomeClass}`}>
                        {t(`screeningOutcome${outcomeKey}`)}
                      </span>
                    </span>
                    <ChevronDown className={isExpanded ? 'is-expanded' : ''} size={18} aria-hidden="true" />
                  </button>
                  <div className="recovery-case-program-details" id={detailsId} hidden={!isExpanded}>
                    <div className="recovery-case-program-catalog">
                      <div>
                        <h4>{t('programPurpose')}</h4>
                        <p>{catalog.purpose || t('programDetailsUnavailable')}</p>
                        {catalog.description && catalog.description !== catalog.purpose && (
                          <>
                            <h4>{t('programDescription')}</h4>
                            <p>{catalog.description}</p>
                          </>
                        )}
                      </div>
                      <div>
                        <h4>{t('programRequirements')}</h4>
                        {catalog.requirements.length
                          ? <ul>{catalog.requirements.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                          : <p>{t('programDetailsUnavailable')}</p>}
                      </div>
                      <div>
                        <h4>{t('programApplicationSteps')}</h4>
                        {catalog.applicationSteps.length
                          ? <ol>{catalog.applicationSteps.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ol>
                          : <p>{t('programDetailsUnavailable')}</p>}
                      </div>
                    </div>
                    <div className="subsidy-screening-details recovery-case-screening-details">
                      {[
                        {
                          key: 'screeningReasons',
                          items: program.reasons,
                          hasReturned: program.reasonsReturned,
                          emptyMessage: 'screeningReasonsNotReturned'
                        },
                        {
                          key: 'screeningMissingInformation',
                          items: program.missingInformation,
                          hasReturned: program.missingInformationReturned,
                          emptyMessage: program.missingInformationReturned
                            ? 'screeningNoMissingInformation'
                            : 'screeningMissingInformationNotReturned'
                        },
                        {
                          key: 'screeningRestrictions',
                          items: program.restrictions,
                          hasReturned: program.restrictionsReturned,
                          emptyMessage: program.restrictionsReturned
                            ? 'screeningNoRestrictions'
                            : 'screeningRestrictionsNotReturned'
                        }
                      ].map(({ key, items, hasReturned, emptyMessage }) => (
                        <div key={key}>
                          <strong>{t(key)}</strong>
                          {items.length
                            ? <ul>{items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul>
                            : <p>{t(hasReturned && key === 'screeningReasons' ? 'screeningNoReasons' : emptyMessage)}</p>}
                        </div>
                      ))}
                    </div>
                    {catalog.sourceUrl ? (
                      <a className="subsidy-source-link" href={catalog.sourceUrl} target="_blank" rel="noreferrer">
                        {t('openProgramSource')}
                      </a>
                    ) : (
                      <p className="field-help">{t('programSourceUnavailable')}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {recommendationList.hasToggle && (
            <button
              type="button"
              className="btn btn-secondary btn-sm recovery-case-recommendation-list-toggle"
              aria-expanded={showAllRecommendations}
              aria-controls="recovery-case-recommendation-list"
              onClick={() => setShowAllRecommendations((current) => !current)}
            >
              {t(showAllRecommendations ? 'showFewerRecommendations' : 'showMoreRecommendations')}
            </button>
          )}
        </CaseSection>
      )}

      <CaseSection
        sectionId="applications"
        title={t('relatedApplications')}
        headingText={t('relatedApplications')}
        description={t('caseApplicationsSectionDescription')}
        expanded={sectionExpanded('applications')}
        onToggle={() => toggleSection('applications')}
        headerMeta={applicationsLoading && <span role="status" className="recovery-case-section-status">{t('loading')}</span>}
        t={t}
      >
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
      </CaseSection>

      <section className="recovery-case-section recovery-case-action-section">
        <h3 className="recovery-case-action-heading">{t('caseActions')}</h3>
        <p className="recovery-case-section-description">{t('caseActionsSectionDescription')}</p>
        <div className="recovery-case-action-layout">
          <button type="button" className="btn btn-primary recovery-case-action-primary" onClick={() => onPrepareApplication(recoveryCase)}>
            {t('prepareApplicationFromCase')} <ArrowRight size={15} />
          </button>
          <div className="recovery-case-secondary-actions">
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
        </div>
      </section>
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
          <section className="modern-card recovery-case-list-panel" aria-label={t('recoveryCasesTitle')}>
            <header className="recovery-case-list-heading">
              <h2>{t('yourRecoveryCases')}</h2>
              <span>{cases.length}</span>
            </header>
            <div className="recovery-case-list">
              {listView.cases.map((recoveryCase) => {
                const caseSeverity = severityPresentation(recoveryCase.severity_level, t);
                return (
                  <button
                    type="button"
                    key={recoveryCase.case_id}
                    className={`recovery-case-list-item${selectedCaseId === recoveryCase.case_id ? ' is-selected' : ''}`}
                    aria-pressed={selectedCaseId === recoveryCase.case_id}
                    onClick={() => setSelectedCaseId(recoveryCase.case_id)}
                  >
                    <strong>{displayCaseValue(recoveryCase.disaster_type, t('disasterTypeUnavailable'))}</strong>
                    {recoveryCase.severity_level != null && String(recoveryCase.severity_level).trim() !== '' && (
                      <span className={caseSeverity.className}>{caseSeverity.label}</span>
                    )}
                    <span>{getRecoveryCaseDetailModel(recoveryCase).location || t('locationUnavailable')}</span>
                    {recoveryCase.incident_date && (
                      <span>{t('disasterDate')}: {caseDateLabel(recoveryCase.incident_date, lang, t('caseInformationUnavailable'))}</span>
                    )}
                    {recoveryCase.created_at && (
                      <span>{t('caseCreated')}: {caseDateLabel(recoveryCase.created_at, lang, t('caseInformationUnavailable'))}</span>
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
