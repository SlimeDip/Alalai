import React, { useState } from 'react';
import {
  Archive,
  Printer,
  Trash2,
  Eye,
  MapPin,
  RefreshCw
} from 'lucide-react';
import { readSavedApplications, writeSavedApplications } from '../utils/mockData';

export default function SavedApplicationsList({ onSelectApplication, t = (key) => key, lang = 'en' }) {
  const [applications, setApplications] = useState(() => readSavedApplications());
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = async (id, refNum) => {
    if (!window.confirm(`${t('deleteRecordConfirm')} ${refNum}?`)) {
      return;
    }
    setApplications((prev) => {
      const next = prev.filter((a) => a.id !== id);
      writeSavedApplications(next);
      return next;
    });
  };

  const filtered = applications.filter((app) => {
    const q = searchTerm.toLowerCase();
    return (
      (app.applicant_name || '').toLowerCase().includes(q) ||
      (app.reference_number || '').toLowerCase().includes(q) ||
      (app.city_municipality || '').toLowerCase().includes(q) ||
      (app.province || '').toLowerCase().includes(q) ||
      (app.disaster_type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h2 className="card-heading">
            <Archive size={20} color="var(--primary)" />
            {t('recordsTitle')}
          </h2>
          <p className="card-subheading">
            {t('recordsSubtitle')}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setApplications(readSavedApplications())}
        >
          <RefreshCw size={14} /> {t('refresh')}
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder={t('recordsSearch')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="form-input"
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--slate-500)' }}>
          {t('recordsEmpty')}
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
                      {item.damage_level || t('draft')}
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
                    <Eye size={14} /> {t('openPrint')}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDelete(item.id, item.reference_number)}
                    title={t('delete')}
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
