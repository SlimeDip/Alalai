import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Clock3, Bell, CheckCircle2 } from 'lucide-react';
import { fetchAccountApplications } from '../utils/applicationStorage';
import {
  createFollowUpReminder,
  createTrackedApplication,
  fetchOwnedRecoveryCases,
  fetchTrackedApplications,
  updateFollowUpReminder,
  updateTrackedStatus
} from '../utils/trackerApi';

const STATUS_OPTIONS = [
  'PREPARED',
  'SUBMITTED',
  'FOLLOW_UP_NEEDED',
  'DECISION_RECEIVED'
];

const STATUS_LABELS = {
  PREPARED: 'Prepared',
  SUBMITTED: 'Submitted',
  FOLLOW_UP_NEEDED: 'Follow-up needed',
  DECISION_RECEIVED: 'Decision received'
};

const REMINDER_LABELS = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

const today = () => new Date().toISOString().slice(0, 10);

function applicationPrograms(application) {
  if (Array.isArray(application?.applied_subsidies)) return application.applied_subsidies;
  if (typeof application?.applied_subsidies === 'string') {
    try {
      const parsed = JSON.parse(application.applied_subsidies);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function dateLabel(value) {
  if (!value) return '';
  return new Date(value.includes(' ') ? `${value.replace(' ', 'T')}Z` : `${value}T00:00:00`).toLocaleDateString();
}

function ReminderItem({ reminder, onUpdate }) {
  const [reminderDate, setReminderDate] = useState(reminder.reminder_date);
  const [note, setNote] = useState(reminder.note || '');
  const overdue = reminder.state === 'ACTIVE' && reminder.reminder_date < today();

  useEffect(() => {
    setReminderDate(reminder.reminder_date);
    setNote(reminder.note || '');
  }, [reminder.reminder_id, reminder.updated_at]);

  return (
    <div style={{ border: '1px solid var(--slate-200)', borderRadius: 10, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Bell size={15} />
        <strong>{dateLabel(reminder.reminder_date)}</strong>
        <span className="badge badge-agency">
          {overdue ? 'Overdue' : REMINDER_LABELS[reminder.state] || 'Reminder'}
        </span>
      </div>
      {reminder.state === 'ACTIVE' ? (
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="form-group">
            <span className="form-label">{"Reminder date"}</span>
            <input
              type="date"
              className="form-input"
              value={reminderDate}
              onChange={(event) => setReminderDate(event.target.value)}
            />
          </label>
          <label className="form-group">
            <span className="form-label">{"Reminder note (optional)"}</span>
            <input
              className="form-input"
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
      ) : reminder.note ? <p>{reminder.note}</p> : null}
      {reminder.state === 'ACTIVE' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUpdate(reminder.reminder_id, { reminder_date: reminderDate, note })}>
            {"Save reminder"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUpdate(reminder.reminder_id, { action: 'COMPLETE' })}>
            {"Complete"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUpdate(reminder.reminder_id, { action: 'DISMISS' })}>
            {"Dismiss"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => onUpdate(reminder.reminder_id, { action: 'REOPEN' })}>
          {"Reopen"}
        </button>
      )}
    </div>
  );
}

export default function ApplicationTracker({ user, csrfToken, initialCaseId = '', onOpenLogin}) {
  const [trackedApplications, setTrackedApplications] = useState([]);
  const [applications, setApplications] = useState([]);
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [caseFilter, setCaseFilter] = useState(initialCaseId || 'ALL');
  const [form, setForm] = useState({
    case_id: '',
    application_id: '',
    program_name: '',
    agency_source: '',
    reference_number: '',
    notes: ''
  });
  const [statusDrafts, setStatusDrafts] = useState({});
  const [submissionDates, setSubmissionDates] = useState({});
  const [statusNotes, setStatusNotes] = useState({});
  const [newReminders, setNewReminders] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  const refresh = useCallback(async () => {
    if (!isAccountUser) {
      setTrackedApplications([]);
      setApplications([]);
      setCases([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [tracked, savedApplications, recoveryCases] = await Promise.all([
        fetchTrackedApplications(),
        fetchAccountApplications(),
        fetchOwnedRecoveryCases()
      ]);
      setTrackedApplications(tracked);
      setApplications(savedApplications);
      setCases(recoveryCases);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isAccountUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!initialCaseId || !cases.some((item) => item.case_id === initialCaseId || item.id === initialCaseId)) {
      return;
    }
    setCaseFilter(initialCaseId);
    setForm((previous) => previous.case_id === initialCaseId
      ? previous
      : {
        ...previous,
        case_id: initialCaseId,
        application_id: '',
        program_name: '',
        agency_source: '',
        reference_number: '',
        notes: ''
      });
  }, [cases, initialCaseId]);

  const selectedCaseApplications = useMemo(
    () => applications.filter((application) => application.case_id === form.case_id),
    [applications, form.case_id]
  );
  const selectedApplication = selectedCaseApplications.find((application) => application.id === form.application_id);
  const availablePrograms = applicationPrograms(selectedApplication);
  const visibleApplications = trackedApplications.filter((application) => (
    (filter === 'ALL' || application.status === filter)
    && (caseFilter === 'ALL' || application.case_id === caseFilter)
  ));

  const changeForm = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await createTrackedApplication({
        ...form,
        application_id: form.application_id || null,
        program_name: form.program_name.trim()
      }, csrfToken);
      setTrackedApplications((previous) => [created, ...previous]);
      setForm((previous) => ({
        ...previous,
        program_name: '',
        agency_source: '',
        reference_number: '',
        notes: ''
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (application) => {
    const id = application.tracked_application_id;
    const status = statusDrafts[id] || application.status;
    if (status === application.status) return;
    setSaving(true);
    setError('');
    try {
      const update = {
        status,
        note: statusNotes[id] || ''
      };
      if (status === 'SUBMITTED') {
        update.submitted_on = submissionDates[id] || today();
      }
      const updated = await updateTrackedStatus(id, update, csrfToken);
      setTrackedApplications((previous) => previous.map((item) => (
        item.tracked_application_id === id ? updated : item
      )));
      setStatusNotes((previous) => ({ ...previous, [id]: '' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddReminder = async (application) => {
    const id = application.tracked_application_id;
    const reminder = newReminders[id] || {};
    if (!reminder.reminder_date) {
      setError("Choose a reminder date first.");
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createFollowUpReminder(id, reminder, csrfToken);
      setTrackedApplications((previous) => previous.map((item) => (
        item.tracked_application_id === id
          ? { ...item, reminders: [...(item.reminders || []), created] }
          : item
      )));
      setNewReminders((previous) => ({ ...previous, [id]: { reminder_date: '', note: '' } }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateReminder = async (reminderId, update) => {
    setSaving(true);
    setError('');
    try {
      const updated = await updateFollowUpReminder(reminderId, update, csrfToken);
      setTrackedApplications((previous) => previous.map((application) => ({
        ...application,
        reminders: (application.reminders || []).map((reminder) => (
          reminder.reminder_id === reminderId ? updated : reminder
        ))
      })));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAccountUser) {
    return (
      <div className="modern-card">
        <h1 className="card-heading">{"Application Tracker"}</h1>
        <p className="card-subheading">{"Sign in to keep your program tracker, history, and reminders with your account."}</p>
        <button type="button" className="btn btn-primary" onClick={onOpenLogin}>{"Sign In"}</button>
      </div>
    );
  }

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <h1 className="card-heading"><CalendarClock size={21} color="var(--primary)" /> {"Application Tracker"}</h1>
          <p className="card-subheading">{"Track each program application separately from your recovery case."}</p>
          <p role="note" style={{ color: 'var(--slate-600)', marginTop: 8 }}>{"Statuses and reminders are self-managed by you. They are not verified by an agency and do not confirm submission, approval, or aid received."}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form className="flow-card" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
        <h2 className="application-section-heading">{"Track a program application"}</h2>
        <div className="form-grid">
          <label className="form-group">
            <span className="form-label">{"Recovery case"} *</span>
            <select
              className="form-select"
              required
              value={form.case_id}
              onChange={(event) => setForm({
                case_id: event.target.value,
                application_id: '',
                program_name: '',
                agency_source: '',
                reference_number: '',
                notes: ''
              })}
            >
              <option value="">{"Select a saved recovery case"}</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.disaster_type} — {item.barangay}, {item.city_municipality}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Related saved form (optional)"}</span>
            <select
              className="form-select"
              value={form.application_id}
              onChange={(event) => {
                const applicationId = event.target.value;
                const application = selectedCaseApplications.find((item) => item.id === applicationId);
                const programs = applicationPrograms(application);
                setForm((previous) => ({
                  ...previous,
                  application_id: applicationId,
                  program_name: programs[0] || ''
                }));
              }}
              disabled={!form.case_id}
            >
              <option value="">{"No related saved form"}</option>
              {selectedCaseApplications.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.reference_number} — {item.applicant_name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">{"Assistance program"} *</span>
            {availablePrograms.length ? (
              <select
                className="form-select"
                required
                value={form.program_name}
                onChange={(event) => changeForm('program_name', event.target.value)}
              >
                <option value="">{"Select a program from this saved form"}</option>
                {availablePrograms.map((program) => <option key={program} value={program}>{program}</option>)}
              </select>
            ) : (
              <input
                className="form-input"
                required
                maxLength={160}
                value={form.program_name}
                onChange={(event) => changeForm('program_name', event.target.value)}
                placeholder={"Enter the program name you are tracking"}
              />
            )}
          </label>
          <label className="form-group">
            <span className="form-label">{"Agency / source (optional)"}</span>
            <input className="form-input" maxLength={160} value={form.agency_source} onChange={(event) => changeForm('agency_source', event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">{"Program reference number (optional)"}</span>
            <input className="form-input" maxLength={120} value={form.reference_number} onChange={(event) => changeForm('reference_number', event.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">{"Notes (optional)"}</span>
            <input className="form-input" maxLength={2000} value={form.notes} onChange={(event) => changeForm('notes', event.target.value)} />
          </label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving || !cases.length}>
          {saving ? "Saving…" : "Add to tracker"}
        </button>
        {cases.length === 0 && !loading && <p className="card-subheading">{"Save an account-backed recovery case before tracking a program."}</p>}
      </form>

      <div className="form-group" style={{ maxWidth: 280, marginBottom: 18 }}>
        <label className="form-label" htmlFor="tracker-case-filter">{"Recovery case"}</label>
        <select
          id="tracker-case-filter"
          className="form-select"
          value={caseFilter}
          onChange={(event) => setCaseFilter(event.target.value)}
        >
          <option value="ALL">{"All cases"}</option>
          {cases.map((item) => <option key={item.id} value={item.case_id || item.id}>{item.disaster_type} — {item.barangay}, {item.city_municipality}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ maxWidth: 280, marginBottom: 18 }}>
        <label className="form-label" htmlFor="tracker-status-filter">{"Filter applications"}</label>
        <select
          id="tracker-status-filter"
          className="form-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="ALL">{"All applications"}</option>
          {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </select>
      </div>

      {loading && trackedApplications.length === 0 ? <p role="status">{"Loading…"}</p> : null}
      {visibleApplications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--slate-500)' }}>
          {"No tracked program applications match this filter."}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {visibleApplications.map((application) => {
            const id = application.tracked_application_id;
            const status = statusDrafts[id] || application.status;
            const draftReminder = newReminders[id] || { reminder_date: '', note: '' };
            const activeReminderCount = (application.reminders || [])
              .filter((reminder) => reminder.state === 'ACTIVE').length;
            const caseLocation = [
              application.barangay,
              application.city_municipality,
              application.province
            ].filter(Boolean).join(', ');
            return (
              <article key={id} className="flow-card">
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 className="card-heading">{application.program_name}</h2>
                    <p className="card-subheading">
                      {[application.agency_source, caseLocation, application.disaster_type].filter(Boolean).join(' · ')}
                    </p>
                    {application.reference_number && <p>Program reference: {application.reference_number}</p>}
                    {application.notes && <p>{application.notes}</p>}
                  </div>
                  <span className="badge badge-agency">{STATUS_LABELS[application.status] || application.status}</span>
                </header>

                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0' }}>
                  <span>{"Submission date"}: {application.submitted_on ? dateLabel(application.submitted_on) : "Not reported"}</span>
                  <span>{"Last updated"}: {dateLabel(application.updated_at)}</span>
                </div>

                <div className="form-grid">
                  <label className="form-group">
                    <span className="form-label">{"Update status"}</span>
                    <select className="form-select" value={status} onChange={(event) => setStatusDrafts((previous) => ({ ...previous, [id]: event.target.value }))}>
                      {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{STATUS_LABELS[option]}</option>)}
                    </select>
                  </label>
                  {status === 'SUBMITTED' && (
                    <label className="form-group">
                      <span className="form-label">{"Submission date"}</span>
                      <input type="date" className="form-input" value={submissionDates[id] || application.submitted_on || today()} onChange={(event) => setSubmissionDates((previous) => ({ ...previous, [id]: event.target.value }))} />
                    </label>
                  )}
                  {status !== application.status && (
                    <label className="form-group">
                      <span className="form-label">{"Note for this status change (optional)"}</span>
                      <input className="form-input" maxLength={2000} value={statusNotes[id] || ''} onChange={(event) => setStatusNotes((previous) => ({ ...previous, [id]: event.target.value }))} />
                    </label>
                  )}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={saving || status === application.status} onClick={() => handleStatusUpdate(application)}>
                  {"Save status"}
                </button>

                <section style={{ marginTop: 20 }}>
                  <h3 className="application-section-heading">{"Status timeline"}</h3>
                  <ol style={{ borderLeft: '2px solid var(--slate-200)', paddingLeft: 20, marginLeft: 8 }}>
                    {application.history.map((entry) => (
                      <li key={entry.history_id} style={{ padding: '0 0 14px 8px' }}>
                        <strong>{entry.previous_status ? `${STATUS_LABELS[entry.previous_status] || entry.previous_status} → ` : ''}{STATUS_LABELS[entry.new_status] || entry.new_status}</strong>
                        <div style={{ fontSize: 13, color: 'var(--slate-600)' }}>{dateLabel(entry.created_at)}</div>
                        {entry.note && <p>{entry.note}</p>}
                      </li>
                    ))}
                  </ol>
                </section>

                <section style={{ marginTop: 18 }}>
                  <h3 className="application-section-heading">{"Follow-up reminders"}</h3>
                  {(application.reminders || []).map((reminder) => (
                    <ReminderItem key={reminder.reminder_id} reminder={reminder} onUpdate={handleUpdateReminder} />
                  ))}
                  {activeReminderCount > 0 && (
                    <p className="card-subheading" style={{ marginTop: 10 }}>
                      <Clock3 size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {"Active reminders"}: {activeReminderCount}
                    </p>
                  )}
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <label className="form-group">
                      <span className="form-label">{"Reminder date"}</span>
                      <input type="date" className="form-input" value={draftReminder.reminder_date} onChange={(event) => setNewReminders((previous) => ({ ...previous, [id]: { ...draftReminder, reminder_date: event.target.value } }))} />
                    </label>
                    <label className="form-group">
                      <span className="form-label">{"Reminder note (optional)"}</span>
                      <input className="form-input" maxLength={2000} value={draftReminder.note} onChange={(event) => setNewReminders((previous) => ({ ...previous, [id]: { ...draftReminder, note: event.target.value } }))} />
                    </label>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => handleAddReminder(application)}>
                    <CheckCircle2 size={14} /> {"Add reminder"}
                  </button>
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
