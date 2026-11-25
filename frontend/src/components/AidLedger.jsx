import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, Package, Wallet, RefreshCw, Trash2, Pencil, X, Plus } from 'lucide-react';
import { fetchOwnedRecoveryCases } from '../utils/assessmentApi';
import { getCaseTitle } from '../utils/caseNames';
import {
  createAidRecord,
  deleteAidRecord,
  fetchAidLedger,
  updateAidRecord
} from '../utils/aidApi';

const emptyForm = {
  case_id: '',
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
  return `${getCaseTitle(item)} — ${item.barangay}, ${item.city_municipality}`;
}

function php(value) {
  return `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export default function AidLedger({ user, csrfToken, initialCaseId = '', onOpenLogin}) {
  const [cases, setCases] = useState([]);
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
      setRecords([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [recoveryCases, ledgerResult] = await Promise.all([
        fetchOwnedRecoveryCases(),
        fetchAidLedger(caseFilter)
      ]);
      setCases(recoveryCases);
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
    setForm((previous) => ({ ...previous, case_id: initialCaseId }));
  }, [initialCaseId]);

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
    if (!window.confirm(`${"Delete this aid record?"} ${record.assistance_description || record.source}?`)) return;
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
      <div className="modern-card aid-ledger-guest">
        <HandCoins size={32} color="var(--primary)" aria-hidden />
        <h1 className="card-heading">{"Aid Received Ledger"}</h1>
        <p className="card-subheading">{"Sign in to save and track the aid you receive."}</p>
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={onOpenLogin}>{"Sign In"}</button>
      </div>
    );
  }

  return (
    <div className="aid-ledger">
      <div className="aid-ledger-head">
        <div>
          <h1 className="card-heading-lg" style={{ marginBottom: 4 }}>{"Aid Received Ledger"}</h1>
          <p role="note" className="aid-ledger-note">{"Self-reported records. Not official receipts or proof of agency distribution."}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      <section className="aid-ledger-summary" aria-label={"Aid summary"}>
        <div className="aid-ledger-stat">
          <span className="aid-ledger-stat-icon"><Wallet size={18} aria-hidden /></span>
          <p>{php(summary.cash_total_php)}</p>
          <strong>{"Cash received"}</strong>
        </div>
        <div className="aid-ledger-stat">
          <span className="aid-ledger-stat-icon"><Package size={18} aria-hidden /></span>
          <p>{summary.in_kind_entries || 0}</p>
          <strong>{"In-kind entries"}</strong>
        </div>
        {summary.valued_in_kind_entries > 0 && (
          <div className="aid-ledger-stat">
            <span className="aid-ledger-stat-icon"><HandCoins size={18} aria-hidden /></span>
            <p>{php(summary.in_kind_estimated_value_php)}</p>
            <strong>{"In-kind value (recorded)"}</strong>
          </div>
        )}
      </section>

      <form className="aid-ledger-form" onSubmit={handleSubmit}>
        <div className="aid-ledger-section-head">
          <h2><Plus size={16} aria-hidden /> {editingId ? "Edit aid record" : "Record aid received"}</h2>
          {editingId && <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}><X size={14} /> Cancel</button>}
        </div>
        <div className="app-grid">
          <label className="form-group">
            <span className="form-label">{"Recovery case"} *</span>
            <select className="form-select" required value={form.case_id} onChange={(event) => setField('case_id', event.target.value)}>
              <option value="">{"Select a saved recovery case"}</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Assistance type"} *</span>
            <select className="form-select" value={form.aid_type} onChange={(event) => setForm((previous) => ({
              ...previous,
              aid_type: event.target.value,
              amount_php: '',
              quantity: '',
              estimated_value_php: ''
            }))}>
              <option value="CASH">{"Cash"}</option>
              <option value="IN_KIND">{"In-kind"}</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Source / organization"} *</span>
            <input className="form-input" required maxLength={200} value={form.source} onChange={(event) => setField('source', event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">{"Date received"} *</span>
            <input type="date" className="form-input" required value={form.received_on} onChange={(event) => setField('received_on', event.target.value)} />
          </label>
          {form.aid_type === 'CASH' ? (
            <>
              <label className="form-group">
                <span className="form-label">{"Cash amount (PHP)"} *</span>
                <input type="number" className="form-input" required min="0.01" max="1000000000" step="0.01" value={form.amount_php} onChange={(event) => setField('amount_php', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{"Description (optional)"}</span>
                <input className="form-input" maxLength={300} value={form.assistance_description} onChange={(event) => setField('assistance_description', event.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="form-group">
                <span className="form-label">{"Item, goods, or service"} *</span>
                <input className="form-input" required maxLength={300} value={form.assistance_description} onChange={(event) => setField('assistance_description', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{"Quantity (optional)"}</span>
                <input className="form-input" maxLength={120} value={form.quantity} onChange={(event) => setField('quantity', event.target.value)} />
              </label>
              <label className="form-group">
                <span className="form-label">{"Estimated value in PHP (optional)"}</span>
                <input type="number" className="form-input" min="0" max="1000000000" step="0.01" value={form.estimated_value_php} onChange={(event) => setField('estimated_value_php', event.target.value)} />
              </label>
            </>
          )}
          <label className="form-group">
            <span className="form-label">{"Notes (optional)"}</span>
            <input className="form-input" maxLength={2000} value={form.notes} onChange={(event) => setField('notes', event.target.value)} />
          </label>
        </div>
        <div className="aid-ledger-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !cases.length}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Save aid record"}
          </button>
        </div>
        {cases.length === 0 && !loading && <p className="card-subheading">{"Save an account-backed recovery case before tracking a program."}</p>}
      </form>

      <section className="aid-ledger-history">
        <div className="aid-ledger-section-head"><h2>{"Aid records"}</h2><span className="aid-ledger-count">{visibleRecords.length}</span></div>
        <div className="aid-ledger-filters">
          <label className="form-group">
            <span className="form-label">{"Recovery case"}</span>
            <select className="form-select" value={caseFilter} onChange={(event) => setCaseFilter(event.target.value)}>
              <option value="">{"All cases"}</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Assistance type"}</span>
            <select className="form-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="ALL">{"All types"}</option>
              <option value="CASH">{"Cash"}</option>
              <option value="IN_KIND">{"In-kind"}</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Sort by date"}</span>
            <select className="form-select" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="NEWEST">{"Newest first"}</option>
              <option value="OLDEST">{"Oldest first"}</option>
            </select>
          </label>
        </div>
        {visibleRecords.length === 0 ? (
          <div className="empty-state">{"No aid received has been recorded yet."}</div>
        ) : (
          <div className="aid-ledger-records">
            {visibleRecords.map((record) => (
              <article key={record.aid_id} className="aid-ledger-record">
                <span className={`aid-ledger-record-icon ${record.aid_type === 'CASH' ? 'is-cash' : 'is-kind'}`}>
                  {record.aid_type === 'CASH' ? <Wallet size={18} aria-hidden /> : <Package size={18} aria-hidden />}
                </span>
                <div className="aid-ledger-record-main">
                  <h3>{record.assistance_description || "Cash"}</h3>
                  <p>{record.source} · {record.received_on}{record.aid_type !== 'CASH' && record.quantity ? ` · ${"Quantity"}: ${record.quantity}` : ''}</p>
                  {record.notes && <p className="aid-ledger-record-notes">{record.notes}</p>}
                </div>
                <div className="aid-ledger-record-side">
                  <strong>
                    {record.aid_type === 'CASH'
                      ? php(record.amount_php)
                      : record.estimated_value_php != null ? php(record.estimated_value_php) : '—'}
                  </strong>
                  {record.aid_type !== 'CASH' && record.estimated_value_php != null && <span>{"Estimated value"}</span>}
                  <div className="record-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => beginEdit(record)} aria-label={"Edit"}><Pencil size={14} /></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDelete(record)} aria-label={"Delete"}><Trash2 size={14} /></button>
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