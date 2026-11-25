import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Trash2,
  Eye,
  MapPin,
  RefreshCw,
  Pencil,
  Check,
  X,
  HandCoins
} from 'lucide-react';
import {
  readSavedApplications,
  writeSavedApplications,
  fetchAccountApplications,
  deleteAccountApplication,
  renameAccountApplication,
  renameBrowserApplication,
  getApplicationTitle,
  getApplicationProgram,
  APPLICATION_NAME_MAX_LENGTH
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
  const [renamingKey, setRenamingKey] = useState('');
  const [draftName, setDraftName] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
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
    if (!window.confirm(`Delete "${getApplicationTitle(item)}"? This cannot be undone.`)) return;
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

  const rowKey = (item, accountBacked) => `${accountBacked ? 'account' : 'browser'}:${item.id}`;

  const startRename = (item, accountBacked) => {
    setError('');
    setDraftName(item.application_name || '');
    setRenamingKey(rowKey(item, accountBacked));
  };

  const cancelRename = () => {
    setRenamingKey('');
    setDraftName('');
  };

  const commitRename = async (event, item, accountBacked) => {
    event.preventDefault();
    setRenameSaving(true);
    setError('');
    try {
      if (accountBacked) {
        const updated = await renameAccountApplication(item.id, draftName, csrfToken);
        setAccountApplications((previous) => previous.map((application) => (
          application.id === item.id
            ? { ...application, application_name: updated.application_name }
            : application
        )));
      } else {
        setBrowserApplications(renameBrowserApplication(item.id, draftName));
      }
      cancelRename();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRenameSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const matches = (application) => (
      (application.application_name || '').toLowerCase().includes(query)
      || getApplicationProgram(application).toLowerCase().includes(query)
      || (application.applicant_name || '').toLowerCase().includes(query)
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
        {records.map((item) => {
          const key = rowKey(item, accountBacked);
          const renaming = renamingKey === key;
          const program = getApplicationProgram(item);
          const hasCustomName = Boolean(item.application_name);
          return (
            <div key={item.id} className="record-row">
              <div>
                {renaming ? (
                  <form
                    className="record-rename"
                    onSubmit={(event) => commitRename(event, item, accountBacked)}
                  >
                    <input
                      autoFocus
                      className="form-input"
                      aria-label="Application name"
                      maxLength={APPLICATION_NAME_MAX_LENGTH}
                      value={draftName}
                      placeholder={item.reference_number}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Escape') cancelRename(); }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      aria-label="Save name"
                      disabled={renameSaving}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label="Cancel renaming"
                      onClick={cancelRename}
                    >
                      <X size={14} />
                    </button>
                  </form>
                ) : (
                  <div className="record-title-row">
                    <strong className="record-title">{getApplicationTitle(item)}</strong>
                    <button
                      type="button"
                      className="record-rename-btn"
                      onClick={() => startRename(item, accountBacked)}
                      aria-label={`Rename ${getApplicationTitle(item)}`}
                      title="Rename"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {hasCustomName && (
                    <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      {item.reference_number}
                    </span>
                  )}
                  <span className="badge badge-agency">{item.damage_level || "Draft"}</span>
                  <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                    {item.incident_date}
                  </span>
                </div>
                <p className="record-program">
                  <HandCoins size={13} aria-hidden />
                  {program
                    ? <>For program: <strong>{program}</strong></>
                    : <span className="record-program-missing">No aid program chosen — open to choose one</span>}
                </p>
                <h4 style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
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
                  aria-label={`Delete ${getApplicationTitle(item)}`}
                >
                  <Trash2 size={14} color="var(--rose-700)" />
                </button>
              </div>
            </div>
          );
        })}
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
          placeholder={"Search by name, program, reference number, or municipality..."}
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