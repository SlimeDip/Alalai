import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Trash2,
  Eye,
  MapPin,
  RefreshCw
} from 'lucide-react';
import {
  readSavedApplications,
  writeSavedApplications,
  fetchAccountApplications,
  deleteAccountApplication
} from '../utils/applicationStorage';

export default function SavedApplicationsList({
  onSelectApplication,
  user,
  csrfToken
}) {
  const [accountApplications, setAccountApplications] = useState([]);
  const [browserApplications, setBrowserApplications] = useState(() => readSavedApplications());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  const refresh = useCallback(async () => {
    setBrowserApplications(readSavedApplications());
    if (!isAccountUser) {
      setAccountApplications([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      setAccountApplications(await fetchAccountApplications());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isAccountUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (item, accountBacked) => {
    if (!window.confirm(`${"Delete record"} ${item.reference_number}?`)) return;
    setError('');
    try {
      if (accountBacked) {
        await deleteAccountApplication(item.id, csrfToken);
        setAccountApplications((previous) => previous.filter((application) => application.id !== item.id));
      } else {
        const next = readSavedApplications().filter((application) => application.id !== item.id);
        writeSavedApplications(next);
        setBrowserApplications(next);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const filtered = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const matches = (application) => (
      (application.applicant_name || '').toLowerCase().includes(query)
      || (application.reference_number || '').toLowerCase().includes(query)
      || (application.city_municipality || '').toLowerCase().includes(query)
      || (application.province || '').toLowerCase().includes(query)
      || (application.disaster_type || '').toLowerCase().includes(query)
    );
    return {
      account: accountApplications.filter(matches),
      browser: browserApplications.filter(matches)
    };
  }, [accountApplications, browserApplications, searchTerm]);

  const renderRecords = (records, accountBacked) => (
    records.length === 0 ? (
      <div className="empty-state">
        {"No saved applications yet. Save a prepared application to see it here."}
      </div>
    ) : (
      <div className="record-list">
        {records.map((item) => (
          <div key={item.id} className="record-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15, color: 'var(--primary)' }}>
                  {item.reference_number}
                </strong>
                <span className="badge badge-agency">{item.damage_level || "Draft"}</span>
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
            <div className="record-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onSelectApplication(item)}
              >
                <Eye size={14} /> {"Open / Print"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDelete(item, accountBacked)}
                title={"Delete"}
              >
                <Trash2 size={14} color="var(--rose-700)" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h2 className="card-heading">
            <Archive size={20} color="var(--primary)" />
            {"Saved Applications"}
          </h2>
          <p className="card-subheading">{"Account records sync through your signed-in account. Older browser-only records remain separate on this device."}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder={"Search by name, reference number, or municipality..."}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="form-input"
        />
      </div>

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {loading && accountApplications.length === 0 && (
        <p role="status">{"Loading…"}</p>
      )}

      {isAccountUser && (
        <section>
          <h3 className="application-section-heading">{"Account-backed applications"}</h3>
          {renderRecords(filtered.account, true)}
        </section>
      )}

      <section style={{ marginTop: isAccountUser ? 24 : 0 }}>
        <h3 className="application-section-heading">
          {isAccountUser ? "Browser-only records on this device" : "Guest applications"}
        </h3>
        <p className="card-subheading" style={{ marginBottom: 12 }}>
          {isAccountUser ? "These legacy records are not assigned to an account. Opening and saving one while signed in creates an account-backed copy." : "Guest records are stored only in this browser and are not available on other devices."}
        </p>
        {renderRecords(filtered.browser, false)}
      </section>
    </div>
  );
}