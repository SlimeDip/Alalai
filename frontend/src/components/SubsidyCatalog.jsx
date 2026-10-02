import React, { useState, useEffect } from 'react';
import { Layers, ArrowRight, Search, X } from 'lucide-react';

export default function SubsidyCatalog({ onSelectSubsidyForApplication, t, lang = 'en' }) {
  const [subsidies, setSubsidies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalSubsidy, setSelectedModalSubsidy] = useState(null);

  useEffect(() => {
    fetchSubsidies();
  }, []);

  const fetchSubsidies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/subsidies');
      const data = await res.json();
      if (data.success) setSubsidies(data.data);
    } catch (err) {
      console.error('Failed to fetch subsidies:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = subsidies.filter((sub) => {
    const q = searchTerm.toLowerCase();
    return (
      sub.title.toLowerCase().includes(q) ||
      sub.short_description.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="modern-card">
        <h2 className="card-heading-lg">
          <Layers size={22} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {t('subsidiesTitle')}
        </h2>
        <p className="card-subheading-lg">{t('subsidiesSubtitle')}</p>
        <p className="landing-disclaimer" style={{ marginTop: 8 }}>{t('notAffiliated')}</p>

        <div className="form-group" style={{ marginTop: 20, maxWidth: 480 }}>
          <label className="form-label">
            <Search size={15} /> {lang === 'tl' ? 'Maghanap' : 'Search'}
          </label>
          <input
            type="text"
            placeholder={lang === 'tl' ? 'Hal. bubong, bigas, pabahay…' : 'e.g. roof, food, shelter…'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input form-input-lg"
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--slate-500)' }}>…</div>
        ) : (
          <div className="subsidy-grid" style={{ marginTop: 20 }}>
            {filtered.map((sub) => (
              <div key={sub.id} className="subsidy-card">
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{sub.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 10 }}>{sub.short_description}</p>
                  <div className="subsidy-amount">{sub.amount_display}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setSelectedModalSubsidy(sub)}>
                    {lang === 'tl' ? 'Detalye' : 'Details'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onSelectSubsidyForApplication({ subsidy: sub })}
                  >
                    {t('applySubsidyBtn')}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
            <div className="subsidy-amount">{selectedModalSubsidy.amount_display}</div>
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
                  onSelectSubsidyForApplication({ subsidy: chosen });
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
