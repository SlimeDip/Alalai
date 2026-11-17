import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, RefreshCw, Trash2, Pencil, X } from 'lucide-react';
import { fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  createAidRecord,
  deleteAidRecord,
  fetchAidLedger,
  updateAidRecord
} from '../utils/aidApi';

const emptyForm = {
  case_id: '',
  tracked_application_id: '',
  aid_type: 'CASH',
  assistance_description: '',
  amount_php: '',
  quantity: '',
  estimated_value_php: '',
  source: '',
  received_on: new Date().toISOString().slice(0, 10),
  notes: ''
};

function caseLabel(item) {
  return `${item.disaster_type} — ${item.barangay}, ${item.city_municipality}`;
}

function php(value) {
  return `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function AidLedger({ user, csrfToken, initialCaseId = '', onOpenLogin, t }) {
  const [cases, setCases] = useState([]);
  const [trackedApplications, setTrackedApplications] = useState([]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    cash_total_php: 0,
    in_kind_entries: 0,
    in_kind_estimated_value_php: null,
    valued_in_kind_entries: 0
  });
  const [caseFilter, setCaseFilter] = useState(initialCaseId || '');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('NEWEST');
  const [form, setForm] = useState(() => ({ ...emptyForm, case_id: initialCaseId || '' }));
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  const refresh = useCallback(async () => {
    if (!isAccountUser) {
      setCases([]);
      setTrackedApplications([]);
      setRecords([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [recoveryCases, trackedResult, ledgerResult] = await Promise.all([
        fetchOwnedRecoveryCases(),
        fetch('/api/tracker', { credentials: 'include' }).then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load tracked applications.');
          return result.data;
        }),
        fetchAidLedger(caseFilter)
      ]);
      setCases(recoveryCases);
      setTrackedApplications(trackedResult);
      setRecords(ledgerResult.data);
      setSummary(ledgerResult.summary);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [caseFilter, isAccountUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!initialCaseId) return;
    setCaseFilter(initialCaseId);
    setForm((previous) => ({ ...previous, case_id: initialCaseId, tracked_application_id: '' }));
  }, [initialCaseId]);

  const linkedPrograms = trackedApplications.filter((application) => application.case_id === form.case_id);
  const visibleRecords = useMemo(() => {
    const filtered = typeFilter === 'ALL'
      ? records
      : records.filter((record) => record.aid_type === typeFilter);
    return [...filtered].sort((a, b) => sortOrder === 'NEWEST'
      ? b.received_on.localeCompare(a.received_on)
      : a.received_on.localeCompare(b.received_on));
  }, [records, sortOrder, typeFilter]);

  const setField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm, case_id: caseFilter });
    setEditingId('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      tracked_application_id: form.tracked_application_id || null,
      amount_php: form.aid_type === 'CASH' ? form.amount_php : '',
      estimated_value_php: form.aid_type === 'IN_KIND' ? form.estimated_value_php : ''
    };
    try {
      if (editingId) {
        await updateAidRecord(editingId, payload, csrfToken);
      } else {
        await createAidRecord(payload, csrfToken);
      }
      resetForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (record) => {
    setEditingId(record.aid_id);
    setForm({
      case_id: record.case_id,
      tracked_application_id: record.tracked_application_id || '',
      aid_type: record.aid_type,
      assistance_description: record.assistance_description || '',
      amount_php: record.amount_php ?? '',
      quantity: record.quantity || '',
      estimated_value_php: record.estimated_value_php ?? '',
      source: record.source,
      received_on: record.received_on,
      notes: record.notes || ''
    });
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`${t('deleteAidConfirm')} ${record.assistance_description || record.source}?`)) return;
    setError('');
    try {
      await deleteAidRecord(record.aid_id, csrfToken);
      if (editingId === record.aid_id) resetForm();
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (!isAccountUser) {
    return (
      <div className="modern-card">
        <h1 className="card-heading">{t('aidLedgerTitle')}</h1>
        <p className="card-subheading">{t('aidLedgerSignIn')}</p>
        <button type="button" className="btn btn-primary" onClick={onOpenLogin}>{t('login')}</button>
      </div>
    );
  }

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h1 className="card-heading"><HandCoins size={21} color="var(--primary)" /> {t('aidLedgerTitle')}</h1>
          <p className="card-subheading">{t('aidLedgerSubtitle')}</p>
          <p role="note" style={{ color: 'var(--slate-600)', marginTop: 8 }}>{t('aidLedgerSelfReported')}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> {loading ? t('loading') : t('refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section className="form-grid" aria-label={t('aidSummary')} style={{ margin: '18px 0 24px' }}>
        <div className="flow-card">
          <strong>{t('cashAssistanceTotal')}</strong>
          <p className="card-heading">{php(summary.cash_total_php)}</p>
        </div>
        <div className="flow-card">
          <strong>{t('inKindEntries')}</strong>
          <p className="card-heading">{summary.in_kind_entries || 0}</p>
        </div>
        {summary.valued_in_kind_entries > 0 && (
          <div className="flow-card">
            <strong>{t('inKindEstimatedTotal')}</strong>
            <p className="card-heading">{php(summary.in_kind_estimated_value_php)}</p>
          </div>
        )}
      </section>

      <form className="flow-card" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 className="application-section-heading">{editingId ? t('editAidRecord') : t('addAidRecord')}</h2>
          {editingId && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}><X size={14} /> {t('cancel')}</button>}
        </div>
        <div className="form-grid">
          <label className="form-group">
            <span className="form-label">{t('recoveryCase')} *</span>
            <select className="form-select" required value={form.case_id} onChange={(event) => setForm((previous) => ({ ...previous, case_id: event.target.value, tracked_application_id: '' }))}>
              <option value="">{t('selectRecoveryCase')}</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{t('aidType')} *</span>
            <select className="form-select" value={form.aid_type} onChange={(event) => setForm((previous) => ({
              ...previous,
              aid_type: event.target.value,
              amount_php: '',
              quantity: '',
              estimated_value_php: ''
            }))}>
              <option value="CASH">{t('cashAid')}</option>
              <option value="IN_KIND">{t('inKindAid')}</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{t('aidSource')} *</span>
            <input className="form-input" required maxLength={200} value={form.source} onChange={(event) => setField('source', event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">{t('dateReceived')} *</span>
            <input type="date" className="form-input" required value={form.received_on} onChange={(event) => setField('received_on', event.target.value)} />
          </label>
          {form.aid_type === 'CASH' ? (
            <>
              <label className="form-group">
                <span className="form-label">{t('cashAmountPhp')} *</span>
                <input type="number" className="form-input" required min="0.01" max="1000000000" step="0.01" value={form.amount_php} onChange={(event) => setField('amount_php', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{t('aidDescriptionOptional')}</span>
                <input className="form-input" maxLength={300} value={form.assistance_description} onChange={(event) => setField('assistance_description', event.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="form-group">
                <span className="form-label">{t('itemOrService')} *</span>
                <input className="form-input" required maxLength={300} value={form.assistance_description} onChange={(event) => setField('assistance_description', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{t('quantityOptional')}</span>
                <input className="form-input" maxLength={120} value={form.quantity} onChange={(event) => setField('quantity', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{t('estimatedValueOptionalPhp')}</span>
                <input type="number" className="form-input" min="0" max="1000000000" step="0.01" value={form.estimated_value_php} onChange={(event) => setField('estimated_value_php', event.target.value)} />
              </label>
            </>
          )}
          <label className="form-group">
            <span className="form-label">{t('relatedTrackedApplication')}</span>
            <select className="form-select" value={form.tracked_application_id} onChange={(event) => setField('tracked_application_id', event.target.value)} disabled={!form.case_id}>
              <option value="">{t('none')}</option>
              {linkedPrograms.map((application) => (
                <option key={application.tracked_application_id} value={application.tracked_application_id}>{application.program_name}</option>
              ))}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{t('aidNotesOptional')}</span>
            <input className="form-input" maxLength={2000} value={form.notes} onChange={(event) => setField('notes', event.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving || !cases.length}>
          {saving ? t('saving') : editingId ? t('saveAidChanges') : t('saveAidRecord')}
        </button>
        {cases.length === 0 && !loading && <p className="card-subheading">{t('trackerNoCases')}</p>}
      </form>

      <section>
        <h2 className="application-section-heading">{t('aidRecords')}</h2>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <label className="form-group">
            <span className="form-label">{t('filterByCase')}</span>
            <select className="form-select" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)}>
              <option value="">{t('allCases')}</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{t('filterByAidType')}</span>
            <select className="form-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="ALL">{t('allTypes')}</option>
              <option value="CASH">{t('cashAid')}</option>
              <option value="IN_KIND">{t('inKindAid')}</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{t('sortByDate')}</span>
            <select className="form-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="NEWEST">{t('newestFirst')}</option>
              <option value="OLDEST">{t('oldestFirst')}</option>
            </select>
          </label>
        </div>
        {visibleRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--slate-500)' }}>{t('aidLedgerEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleRecords.map((record) => (
              <article key={record.aid_id} className="flow-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <span className="badge badge-agency">{record.aid_type === 'CASH' ? t('cashAid') : t('inKindAid')}</span>
                    <h3 style={{ marginTop: 8 }}>{record.assistance_description || t('cashAid')}</h3>
                    <p className="card-subheading">
                      {t('aidSource')}: {record.source} · {t('dateReceived')}: {record.received_on}
                    </p>
                    {record.aid_type === 'CASH'
                      ? <p><strong>{php(record.amount_php)}</strong></p>
                      : (
                        <>
                          {record.quantity && <p>{t('quantity')}: {record.quantity}</p>}
                          {record.estimated_value_php != null && <p>{t('estimatedValue')}: {php(record.estimated_value_php)}</p>}
                        </>
                      )}
                    {record.notes && <p>{record.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => beginEdit(record)}><Pencil size={14} /> {t('edit')}</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(record)}><Trash2 size={14} /> {t('delete')}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
