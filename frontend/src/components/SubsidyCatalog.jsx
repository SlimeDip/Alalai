import React, { useEffect, useState } from 'react';
import { Layers, ArrowRight, Search, SlidersHorizontal, X, ExternalLink, CheckCircle2, ListChecks } from 'lucide-react';
import { getCatalogProgramPresentation } from '../utils/subsidyPresentation';

export default function SubsidyCatalog({ onSelectSubsidyForApplication}) {
  const [subsidies, setSubsidies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalSubsidy, setSelectedModalSubsidy] = useState(null);

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

  return (
    <div>
      <div className="modern-card">
        <h2 className="card-heading-lg">
          <Layers size={22} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {"Choose an Available Aid Program"}
        </h2>
        <p className="card-subheading-lg">{"Choose a program below to pre-fill your printable application form."}</p>
        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label"><Search size={15} /> {"Search aid programs"}</label>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={"Program, agency, or disaster"}
            className="form-input form-input-lg"
          />
        </div>
        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label">
            <SlidersHorizontal size={15} /> {"Filter by aid type"}
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="form-select form-input-lg">
            <option value="all">{"All aid types"}</option>
            <option value="general">{"General aid"}</option>
            <option value="food">{"Food and essentials"}</option>
            <option value="structural">{"Shelter and structural"}</option>
            <option value="agricultural">{"Agriculture"}</option>
            <option value="livelihood">{"Livelihood"}</option>
          </select>
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
        <div className="subsidy-grid" style={{ marginTop: 20 }}>
            {filtered.map((sub) => {
              const program = getCatalogProgramPresentation(sub);
              return (
              <div key={sub.id} className="subsidy-card">
                <div>
                  <span className="subsidy-agency">{sub.agency}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: '5px 0 6px' }}>{sub.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 10 }}>{program.purpose}</p>
                  <div className="subsidy-amount">
                    {Number(sub.amount_display) > 0 ? `₱${Number(sub.amount_display).toLocaleString()}` : "Amount varies"}
                  </div>
                  {program.lastReviewedOn && (
                    <p className="subsidy-meta">{"Last catalog review"}: {program.lastReviewedOn}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setSelectedModalSubsidy(sub)}>
                    {"Details"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onSelectSubsidyForApplication({ subsidy: sub, returnTab: 'subsidies' })}
                  >
                    {"Choose This Program"}
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
      </div>

      {selectedModalSubsidy && (
        <div className="modal-overlay" onClick={() => setSelectedModalSubsidy(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>{selectedModalSubsidy.title}</h3>
              <button type="button" className="icon-btn" onClick={() => setSelectedModalSubsidy(null)}>
                <X size={20} />
              </button>
            </div>
            {selectedModalSubsidy.agency && (
              <p className="subsidy-agency">{selectedModalSubsidy.agency}</p>
            )}
            <div className="subsidy-amount">
              {Number(selectedModalSubsidy.amount_display) > 0
                ? `₱${Number(selectedModalSubsidy.amount_display).toLocaleString()}`
                : "Amount varies"}
            </div>
            <h4>{"Program purpose"}</h4>
            <p style={{ fontSize: 15, marginTop: 10 }}>
              {selectedProgram.purpose || "No details provided in the catalog."}
            </p>
            {selectedModalSubsidy.details && selectedModalSubsidy.details !== selectedProgram.purpose && (
              <>
                <h4>{"Program details"}</h4>
                <p style={{ fontSize: 15, marginTop: 10 }}>{selectedModalSubsidy.details}</p>
              </>
            )}
            {selectedModalSubsidy.application_channel && (
              <p className="subsidy-channel">{selectedModalSubsidy.application_channel}</p>
            )}
            <div className="subsidy-detail-columns">
              <div>
                <h4><CheckCircle2 size={15} /> {"Requirements listed"}</h4>
                <ul>
                  {selectedProgram.requirements.length
                    ? selectedProgram.requirements.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                    : <li>{"No details provided in the catalog."}</li>}
                </ul>
              </div>
              <div>
                <h4><ListChecks size={15} /> {"Application steps listed"}</h4>
                <ol>
                  {selectedProgram.applicationSteps.length
                    ? selectedProgram.applicationSteps.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)
                    : <li>{"No details provided in the catalog."}</li>}
                </ol>
              </div>
            </div>
            {selectedProgram.sourceUrl ? (
              <a className="subsidy-source-link" href={selectedProgram.sourceUrl} target="_blank" rel="noreferrer">
                {"Open program source or agency website"} <ExternalLink size={14} />
              </a>
            ) : (
              <p className="field-help">{"No source link is provided for this catalog entry. Contact the listed agency to confirm details."}</p>
            )}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
