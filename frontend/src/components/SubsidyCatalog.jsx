import React, { useEffect, useState } from 'react';
import { Layers, ArrowRight, Search, SlidersHorizontal, X, ExternalLink, CheckCircle2, ListChecks } from 'lucide-react';

export default function SubsidyCatalog({ onSelectSubsidyForApplication, t, lang = 'en' }) {
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
        const payload = await response.json();
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

  return (
    <div>
      <div className="modern-card">
        <h2 className="card-heading-lg">
          <Layers size={22} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {t('subsidiesTitle')}
        </h2>
        <p className="card-subheading-lg">{t('subsidiesSubtitle')}</p>
        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label"><Search size={15} /> {t('searchReliefPrograms')}</label>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('searchReliefPlaceholder')}
            className="form-input form-input-lg"
          />
        </div>
        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label">
            <SlidersHorizontal size={15} /> {t('filterAidType')}
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="form-select form-input-lg">
            <option value="all">{t('allAidTypes')}</option>
            <option value="general">{t('generalRelief')}</option>
            <option value="food">{t('foodEssentials')}</option>
            <option value="structural">{t('shelterStructural')}</option>
            <option value="agricultural">{t('agriculture')}</option>
            <option value="livelihood">{t('livelihood')}</option>
          </select>
        </div>

        {isLoading && (
          <p className="field-help">{t('loadingPrograms')}</p>
        )}
        {!isLoading && loadError && (
          <p className="field-help">{loadError}</p>
        )}
        {!isLoading && !loadError && subsidies.length === 0 && (
          <p className="field-help">
            {t('noProgramsLoaded')}
          </p>
        )}
        <div className="subsidy-grid" style={{ marginTop: 20 }}>
          {filtered.map((sub) => (
            <div key={sub.id} className="subsidy-card">
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{sub.title}</h3>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--slate-600)',
                    marginBottom: 12,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {sub.short_description}
                </p>
                <div className="subsidy-amount">
                  {Number(sub.amount_display) > 0 ? `₱${Number(sub.amount_display).toLocaleString()}` : t('amountVaries')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setSelectedModalSubsidy(sub)}>
                  {t('details')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => onSelectSubsidyForApplication({ subsidy: sub, returnTab: 'subsidies' })}
                >
                  {t('applySubsidyBtn')}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedModalSubsidy && (
        <div className="modal-overlay" onClick={() => setSelectedModalSubsidy(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <span className="subsidy-agency" style={{ display: 'inline-block', marginBottom: 6 }}>
                  {selectedModalSubsidy.agency}
                </span>
                <h3 style={{ margin: 0 }}>{selectedModalSubsidy.title}</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedModalSubsidy(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <div className="subsidy-amount" style={{ margin: 0 }}>
                {Number(selectedModalSubsidy.amount_display) > 0
                  ? `₱${Number(selectedModalSubsidy.amount_display).toLocaleString()}`
                  : t('amountVaries')}
              </div>
              {selectedModalSubsidy.last_verified_on && (
                <p className="subsidy-meta" style={{ margin: 0 }}>
                  Verified: {selectedModalSubsidy.last_verified_on}
                </p>
              )}
            </div>
            <p style={{ fontSize: 15, marginTop: 12 }}>{selectedModalSubsidy.details}</p>
            <p className="subsidy-channel">{selectedModalSubsidy.application_channel}</p>
            <div className="subsidy-detail-columns">
              <div>
                <h4><CheckCircle2 size={15} /> Prepare</h4>
                <ul>
                  {selectedModalSubsidy.requirements.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h4><ListChecks size={15} /> How to apply</h4>
                <ol>
                  {selectedModalSubsidy.application_steps.map((item) => <li key={item}>{item}</li>)}
                </ol>
              </div>
            </div>
            <a className="subsidy-source-link" href={selectedModalSubsidy.source_url} target="_blank" rel="noreferrer">
              Open official source <ExternalLink size={14} />
            </a>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedModalSubsidy(null)}>
                {t('close')}
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
                {t('applySubsidyBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}