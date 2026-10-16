import React, { useEffect, useState } from 'react';
import { Layers, ArrowRight, Search, SlidersHorizontal, X } from 'lucide-react';

export default function SubsidyCatalog({ onSelectSubsidyForApplication, t, lang = 'en' }) {
  const [subsidies, setSubsidies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalSubsidy, setSelectedModalSubsidy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/subsidies')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load relief programs.');
        if (!cancelled) setSubsidies(payload.data || []);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
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
          <label className="form-label"><Search size={15} /> {lang === 'tl' ? 'Maghanap ng ayuda' : 'Search relief programs'}</label>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'tl' ? 'Pangalan, ahensya, o sakuna' : 'Program, agency, or disaster'}
            className="form-input form-input-lg"
          />
        </div>
        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label">
            <SlidersHorizontal size={15} /> {lang === 'tl' ? 'Uri ng ayuda' : 'Filter by aid type'}
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="form-select form-input-lg">
            <option value="all">{lang === 'tl' ? 'Lahat ng ayuda' : 'All aid types'}</option>
            <option value="general">{lang === 'tl' ? 'Pangkalahatang tulong' : 'General relief'}</option>
            <option value="food">{lang === 'tl' ? 'Pagkain at pangunahing pangangailangan' : 'Food and essentials'}</option>
            <option value="structural">{lang === 'tl' ? 'Pabahay at istruktura' : 'Shelter and structural'}</option>
            <option value="agricultural">{lang === 'tl' ? 'Agrikultura' : 'Agriculture'}</option>
            <option value="livelihood">{lang === 'tl' ? 'Kabuhayan' : 'Livelihood'}</option>
          </select>
        </div>

        {loading && <p className="field-help">Loading verified relief programs…</p>}
        {!loading && loadError && <p className="field-help">{loadError}</p>}
        {!loading && !loadError && subsidies.length === 0 && (
          <p className="field-help">
            No verified relief programs have been loaded yet. Administrators can add programs using
            <code>backend/data/subsidies.template.json</code> after checking each program on its official website.
          </p>
        )}
        <div className="subsidy-grid" style={{ marginTop: 20 }}>
            {filtered.map((sub) => (
              <div key={sub.id} className="subsidy-card">
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{sub.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 10 }}>{sub.short_description}</p>
                  <div className="subsidy-amount">
                    {Number(sub.amount_display) > 0 ? `₱${Number(sub.amount_display).toLocaleString()}` : 'Amount varies'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setSelectedModalSubsidy(sub)}>
                    {lang === 'tl' ? 'Detalye' : 'Details'}
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
            <div className="modal-header-row">
              <h3>{selectedModalSubsidy.title}</h3>
              <button type="button" className="icon-btn" onClick={() => setSelectedModalSubsidy(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="subsidy-amount">
              {Number(selectedModalSubsidy.amount_display) > 0
                ? `₱${Number(selectedModalSubsidy.amount_display).toLocaleString()}`
                : 'Amount varies'}
            </div>
            <p style={{ fontSize: 15, marginTop: 10 }}>{selectedModalSubsidy.details}</p>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedModalSubsidy(null)}>
                {lang === 'tl' ? 'Isara' : 'Close'}
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
