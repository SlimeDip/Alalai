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
  csrfToken,
  t = (key) => key
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
    if (!window.confirm(`${t('deleteRecordConfirm')} ${item.reference_number}?`)) return;
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
      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--slate-500)' }}>
        {t('recordsEmpty')}
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {records.map((item) => (
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
                <span className="badge badge-agency">{item.damage_level || t('draft')}</span>
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
                onClick={() => handleDelete(item, accountBacked)}
                title={t('delete')}
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
            {t('recordsTitle')}
          </h2>
          <p className="card-subheading">{t('recordsSubtitle')}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> {loading ? t('loading') : t('refresh')}
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <input
          type="text"
          placeholder={t('recordsSearch')}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="form-input"
        />
      </div>

      {error && (
        <div role="alert" style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {loading && accountApplications.length === 0 && (
        <p role="status">{t('loading')}</p>
      )}

      {isAccountUser && (
        <section>
          <h3 className="application-section-heading">{t('accountApplications')}</h3>
          {renderRecords(filtered.account, true)}
        </section>
      )}

      <section style={{ marginTop: isAccountUser ? 24 : 0 }}>
        <h3 className="application-section-heading">
          {isAccountUser ? t('browserOnlyApplications') : t('guestApplications')}
        </h3>
        <p className="card-subheading" style={{ marginBottom: 12 }}>
          {isAccountUser ? t('browserOnlyNotice') : t('guestStorageNotice')}
        </p>
        {renderRecords(filtered.browser, false)}
      </section>
    </div>
  );
}
