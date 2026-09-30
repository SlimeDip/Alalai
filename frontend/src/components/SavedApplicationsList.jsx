import React, { useState, useEffect } from 'react';
import {
  Archive,
  Printer,
  Trash2,
  Eye,
  Calendar,
  MapPin,
  RefreshCw,
  Search,
  FileCheck
} from 'lucide-react';

export default function SavedApplicationsList({ onSelectApplication }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/applications');
      const data = await res.json();
      if (data.success) {
        setApplications(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, refNum) => {
    if (!window.confirm(`Sigurado ka bang nais mong burahin ang rekord ${refNum}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setApplications((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert('Nabigo ang pagbura: ' + data.error);
      }
    } catch (err) {
      alert('Error sa pagbura: ' + err.message);
    }
  };

  const filtered = applications.filter((app) => {
    const q = searchTerm.toLowerCase();
    return (
      app.applicant_name.toLowerCase().includes(q) ||
      app.reference_number.toLowerCase().includes(q) ||
      app.city_municipality.toLowerCase().includes(q) ||
      app.province.toLowerCase().includes(q) ||
      app.disaster_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h2 className="card-heading">
            <Archive size={20} color="var(--primary)" />
            Mga Naitalang Aplikasyon sa Database
          </h2>
          <p className="card-subheading">
            Talaan ng mga na-save na intake forms sa lokal na SQLite database.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={fetchApplications}
        >
          <RefreshCw size={14} /> I-refresh
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder="Maghanap ayon sa Pangalan, Reference Blg, o Munisipyo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="form-input"
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--slate-500)' }}>
          Ikinakarga ang mga naitalang rekord...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--slate-500)' }}>
          Walang natagpuang aplikasyon. Maaari kang mag-save ng bago mula sa tab na Intake Form.
        </div>
      ) : (
        <div>
          {/* Responsive Card List for Mobile and Tablet */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: 'var(--slate-50)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15, color: 'var(--primary)' }}>
                      {item.reference_number}
                    </strong>
                    <span className="badge badge-agency">
                      {item.damage_level}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      {item.incident_date}
                    </span>
                  </div>

                  <h4 style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                    {item.applicant_name}
                  </h4>

                  <p style={{ fontSize: 13, color: 'var(--slate-600)', marginTop: 2 }}>
                    <MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />
                    {item.barangay}, {item.city_municipality}, {item.province} • ({item.disaster_type})
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onSelectApplication(item)}
                  >
                    <Eye size={14} /> Buksan / I-print
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDelete(item.id, item.reference_number)}
                    title="Burahin"
                  >
                    <Trash2 size={14} color="var(--rose-700)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
