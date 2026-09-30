import React, { useState, useEffect } from 'react';
import {
  Layers,
  ArrowRight,
  PhoneCall,
  Search,
  Building2,
  FileText,
  X
} from 'lucide-react';

export default function SubsidyCatalog({ onSelectSubsidyForApplication }) {
  const [subsidies, setSubsidies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgency, setSelectedAgency] = useState('ALL');
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
      if (data.success) {
        setSubsidies(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch subsidies:', err);
    } finally {
      setLoading(false);
    }
  };

  const agencies = ['ALL', 'DSWD', 'DA', 'Pag-IBIG', 'SSS', 'LGU'];

  const filtered = subsidies.filter((sub) => {
    let matchesAgency = selectedAgency === 'ALL';
    if (selectedAgency === 'DSWD') matchesAgency = sub.agency === 'DSWD';
    else if (selectedAgency === 'DA') matchesAgency = sub.agency.includes('Agriculture') || sub.agency.includes('DA');
    else if (selectedAgency === 'Pag-IBIG') matchesAgency = sub.agency.includes('Pag-IBIG');
    else if (selectedAgency === 'SSS') matchesAgency = sub.agency.includes('SSS') || sub.agency.includes('Social Security');
    else if (selectedAgency === 'LGU') matchesAgency = sub.agency.includes('LGU') || sub.agency.includes('Barangay');

    const matchesSearch =
      sub.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.short_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.agency.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAgency && matchesSearch;
  });

  return (
    <div>
      <div className="modern-card">
        <div className="modern-card-header">
          <div>
            <h2 className="card-heading">
              <Layers size={20} color="var(--primary)" />
              Direktoryo ng mga Subsidiya at Ayuda sa Kalamidad
            </h2>
            <p className="card-subheading">
              Talaan ng mga opisyal na programa ng gobyerno para sa agarang tulong pinansyal at pabahay.
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: '1 1 260px' }}>
            <input
              type="text"
              placeholder="Maghanap ng tulong (hal. bubong, palay, pautang, pagkain)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {agencies.map((agency) => (
              <button
                key={agency}
                type="button"
                className={`btn btn-sm ${selectedAgency === agency ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedAgency(agency)}
              >
                {agency === 'ALL' ? 'Lahat' : agency}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--slate-500)' }}>
            Ikinakarga ang mga subsidiya...
          </div>
        ) : (
          <div className="subsidy-grid">
            {filtered.map((sub) => (
              <div key={sub.id} className="subsidy-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="badge badge-agency">{sub.agency}</span>
                    <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      Kalamidad: {sub.disaster_categories.split(',')[0]}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                    {sub.title}
                  </h3>

                  <p style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
                    {sub.short_description}
                  </p>

                  <div className="subsidy-amount">
                    {sub.amount_display}
                  </div>

                  <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 10, marginTop: 10 }}>
                    <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      Pangunahing Kinakailangan:
                    </strong>
                    <ul style={{ paddingLeft: 18, fontSize: 12, color: 'var(--slate-600)' }}>
                      {sub.requirements?.slice(0, 3).map((req, rIdx) => (
                        <li key={rIdx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setSelectedModalSubsidy(sub)}
                  >
                    Detalye
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => onSelectSubsidyForApplication({ subsidy: sub })}
                  >
                    I-apply
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedModalSubsidy && (
        <div className="modal-overlay" onClick={() => setSelectedModalSubsidy(null)}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--slate-200)', paddingBottom: 12 }}>
              <div>
                <span className="badge badge-agency">{selectedModalSubsidy.agency}</span>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{selectedModalSubsidy.title}</h3>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
                onClick={() => setSelectedModalSubsidy(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="subsidy-amount">{selectedModalSubsidy.amount_display}</div>
              <p style={{ fontSize: 14, color: 'var(--slate-800)', marginTop: 8 }}>{selectedModalSubsidy.details}</p>

              <div style={{ marginTop: 14, backgroundColor: 'var(--slate-50)', padding: 12, borderRadius: 6, border: '1px solid var(--slate-200)' }}>
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Mga Hakbang sa Pag-apply:</strong>
                <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--slate-700)' }}>
                  {selectedModalSubsidy.application_steps?.map((step, idx) => (
                    <li key={idx} style={{ marginBottom: 3 }}>{step}</li>
                  ))}
                </ol>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--slate-500)' }}>
                <strong>Hotline:</strong> {selectedModalSubsidy.contact_info}
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedModalSubsidy(null)}
                >
                  Isara
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
                  Ihanda ang Intake Slip
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
