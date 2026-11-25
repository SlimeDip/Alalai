import React, { useEffect, useState } from 'react';
import { Layers, ArrowRight, Search, SlidersHorizontal, X, ExternalLink, CheckCircle2, ListChecks } from 'lucide-react';
import { getCatalogProgramPresentation, getVisiblePrograms } from '../utils/subsidyPresentation';

const INITIAL_PROGRAM_LIMIT = 6;

function agencyShort(agency = '') {
  const match = agency.match(/\(([^)]+)\)/);
  return match ? match[1] : agency;
}

export default function SubsidyCatalog({ onSelectSubsidyForApplication}) {
  const [subsidies, setSubsidies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalSubsidy, setSelectedModalSubsidy] = useState(null);
  const [showAllPrograms, setShowAllPrograms] = useState(false);

  useEffect(() => {
    const loadSubsidies = async () => {
      try {
        const response = await fetch('/api/subsidies');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !Array.isArray(payload.subsidies)) {
          throw new Error(payload.error || 'Unable to load subsidy programs.');
        }
        setSubsidies(payload.subsidies);
      } catch (error) {
        setLoadError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadSubsidies();
  }, []);

  const filtered = subsidies.filter((sub) => {
    const types = Array.isArray(sub.damage_types)
      ? sub.damage_types
      : String(sub.damage_types || '').split(',');
    const normalizedTypes = types.map((type) => type.trim().toLowerCase());
    const categoryAliases = {
      structural: ['structural', 'roof', 'wall', 'house', 'housing'],
      agricultural: ['agricultural', 'crop', 'livestock', 'fisher'],
      livelihood: ['livelihood', 'business'],
      food: ['food'],
      general: ['general', 'community', 'infrastructure', 'medical']
    };
    const categoryMatches = categoryFilter === 'all'
      || normalizedTypes.some((type) => (categoryAliases[categoryFilter] || [categoryFilter])
        .some((alias) => type.includes(alias)));
    const query = searchTerm.trim().toLowerCase();
    const searchable = [
      sub.title,
      sub.agency,
      sub.short_description,
      sub.details,
      ...(sub.damage_types || []),
      ...(sub.disaster_categories || [])
    ].join(' ').toLowerCase();
    return categoryMatches && (!query || searchable.includes(query));
  });
  const selectedProgram = selectedModalSubsidy
    ? getCatalogProgramPresentation(selectedModalSubsidy)
    : null;
  const programList = getVisiblePrograms(filtered, showAllPrograms, INITIAL_PROGRAM_LIMIT);

  return (
    <div>
      <div className="modern-card">
        <h2 className="card-heading-lg" style={{ marginBottom: 16 }}>
          <Layers size={22} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {"Choose an Available Aid Program"}
        </h2>
        <div className="catalog-toolbar">
          <label className="catalog-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={"Search program, agency, or disaster"}
              aria-label={"Search aid programs"}
            />
          </label>
          <label className="catalog-filter">
            <SlidersHorizontal size={16} aria-hidden />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label={"Filter by aid type"}>
              <option value="all">{"All aid types"}</option>
              <option value="general">{"General aid"}</option>
              <option value="food">{"Food and essentials"}</option>
              <option value="structural">{"Shelter and structural"}</option>
              <option value="agricultural">{"Agriculture"}</option>
              <option value="livelihood">{"Livelihood"}</option>
            </select>
          </label>
        </div>

        {isLoading && (
          <p className="field-help">{"Loading aid program catalog..."}</p>
        )}
        {!isLoading && loadError && (
          <p className="field-help">{loadError}</p>
        )}
        {!isLoading && !loadError && subsidies.length === 0 && (
          <p className="field-help">
            {"No aid programs are currently available in the catalog."}
          </p>
        )}
        <div className="subsidy-grid" id="subsidy-catalog-program-list" style={{ marginTop: 20 }}>
            {programList.visiblePrograms.map((sub) => {
              const program = getCatalogProgramPresentation(sub);
              return (
              <div key={sub.id} className="subsidy-card catalog-card">
                <div className="catalog-card-top">
                  <span className="catalog-agency" title={sub.agency}>{agencyShort(sub.agency)}</span>
                  <span className="catalog-amount">
                    {Number(sub.amount_display) > 0 ? `₱${Number(sub.amount_display).toLocaleString()}` : "Amount varies"}
                  </span>
                </div>
                <h3 className="catalog-title">{sub.title}</h3>
                <p className="catalog-purpose">{program.purpose}</p>
                {program.lastReviewedOn && (
                  <p className="catalog-meta">{"Reviewed"} {program.lastReviewedOn}</p>
                )}
                <div className="catalog-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedModalSubsidy(sub)}>
                    {"Details"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onSelectSubsidyForApplication({ subsidy: sub, returnTab: 'subsidies' })}
                  >
                    {"Choose"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
              );
            })}
            {!isLoading && !loadError && filtered.length === 0 && subsidies.length > 0 && (
              <p className="field-help">{"No catalog programs match the current search or filter."}</p>
            )}
        </div>
        {programList.hasToggle && (
          <button
            type="button"
            className="btn btn-secondary btn-sm subsidy-list-toggle"
            aria-expanded={showAllPrograms}
            aria-controls="subsidy-catalog-program-list"
            onClick={() => setShowAllPrograms((current) => !current)}
          >
            {showAllPrograms ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {selectedModalSubsidy && (
        <div className="modal-overlay" onClick={() => setSelectedModalSubsidy(null)}>
          <div className="modal-card catalog-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={selectedModalSubsidy.title}>
            <div className="catalog-modal-head">
              <div>
                {selectedModalSubsidy.agency && <span className="catalog-agency">{selectedModalSubsidy.agency}</span>}
                <h3>{selectedModalSubsidy.title}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedModalSubsidy(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="catalog-modal-body">
              <div className="catalog-modal-amount">
                <span>{"Planning amount"}</span>
                <strong>
                  {Number(selectedModalSubsidy.amount_display) > 0
                    ? `₱${Number(selectedModalSubsidy.amount_display).toLocaleString()}`
                    : "Amount varies"}
                </strong>
              </div>

              <section>
                <h4>{"Program purpose"}</h4>
                <p>{selectedProgram.purpose || "No details provided in the catalog."}</p>
              </section>
              {selectedModalSubsidy.details && selectedModalSubsidy.details !== selectedProgram.purpose && (
                <section>
                  <h4>{"Program details"}</h4>
                  <p>{selectedModalSubsidy.details}</p>
                </section>
              )}
              {selectedModalSubsidy.application_channel && (
                <p className="subsidy-channel">{selectedModalSubsidy.application_channel}</p>
              )}

              <div className="catalog-modal-lists">
                <section>
                  <h4><CheckCircle2 size={15} /> {"Requirements"}</h4>
                  <ul>
                    {selectedProgram.requirements.length
                      ? selectedProgram.requirements.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                      : <li>{"No details provided in the catalog."}</li>}
                  </ul>
                </section>
                <section>
                  <h4><ListChecks size={15} /> {"How to apply"}</h4>
                  <ol>
                    {selectedProgram.applicationSteps.length
                      ? selectedProgram.applicationSteps.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                      : <li>{"No details provided in the catalog."}</li>}
                  </ol>
                </section>
              </div>

              {selectedProgram.sourceUrl ? (
                <a className="subsidy-source-link" href={selectedProgram.sourceUrl} target="_blank" rel="noreferrer">
                  {"Open program source or agency website"} <ExternalLink size={14} />
                </a>
              ) : (
                <p className="field-help">{"No source link is provided for this catalog entry. Contact the listed agency to confirm details."}</p>
              )}
            </div>

            <div className="catalog-modal-foot">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedModalSubsidy(null)}>
                {"Close"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const chosen = selectedModalSubsidy;
                  setSelectedModalSubsidy(null);
                  onSelectSubsidyForApplication({ subsidy: chosen, returnTab: 'subsidies' });
                }}
              >
                {"Choose This Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}