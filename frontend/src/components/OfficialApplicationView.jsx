import React, { useState, useEffect } from 'react';
import {
  Printer,
  Save,
  CheckCircle2,
  FileText,
  Edit3,
  Eye,
  Download,
  Check,
  ArrowLeft,
  User,
  MapPin,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import {
  saveBrowserApplication,
  saveAccountApplication,
  getApplicationProgram
} from '../utils/applicationStorage';
import { fetchOwnedRecoveryCases } from '../utils/assessmentApi';
import { fetchSubsidyCatalog } from '../utils/subsidyApi';
import { getAssessmentEligibilityModel } from '../utils/subsidyPresentation';
import { createApplicationFormData } from '../utils/applicationForm';
import LocationFields from './LocationFields';

export default function OfficialApplicationView({
  initialData,
  user,
  csrfToken,
  onSavedSuccess,
  onBack,
  backLabel,
}) {
  const [activeView, setActiveView] = useState('editor'); // 'editor' | 'preview'
  const [formData, setFormData] = useState(() => createApplicationFormData(initialData, user));

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [recoveryCases, setRecoveryCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

  useEffect(() => {
    let active = true;
    fetchSubsidyCatalog()
      .then((subsidies) => { if (active) setCatalog(subsidies); })
      .catch((error) => { if (active) setCatalogError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!isAccountUser) {
      setRecoveryCases([]);
      setCasesError('');
      setCasesLoading(false);
      return () => { active = false; };
    }

    setCasesLoading(true);
    setCasesError('');
    fetchOwnedRecoveryCases()
      .then((cases) => {
        if (active) setRecoveryCases(cases);
      })
      .catch((error) => {
        if (active) setCasesError(error.message);
      })
      .finally(() => {
        if (active) setCasesLoading(false);
      });

    return () => { active = false; };
  }, [isAccountUser, user]);

  const selectedProgram = getApplicationProgram(formData);
  const PROGRAM_REQUIRED_MESSAGE = 'Choose the aid program this application is for.';

  const handleProgramChange = (event) => {
    const title = event.target.value;
    const previousProgram = catalog.find((subsidy) => subsidy.title === selectedProgram);
    const nextProgram = catalog.find((subsidy) => subsidy.title === title);
    setSaveError('');
    setFormData((prev) => {
      const previousAmount = Number(prev.requested_amount_php) || 0;
      const amountUntouched = previousAmount === 0
        || previousAmount === Number(previousProgram?.max_amount_php);
      return {
        ...prev,
        applied_subsidies: title ? [title] : [],
        ...(nextProgram && amountUntouched
          ? { requested_amount_php: nextProgram.max_amount_php || 0 }
          : {})
      };
    });
  };

  const hasAgriculturalProgram = formData.applied_subsidies.some((program) =>
    /sure|crop insurance|pcic|agricultural|farm|fish/i.test(program)
  );

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'case_id'
        ? (value || null)
        : type === 'checkbox' ? checked : value,
      ...(name === 'birth_date' && value
        ? { applicant_age: Math.max(0, Math.floor((Date.now() - new Date(`${value}T00:00:00`).getTime()) / 31557600000)) }
        : {}),
      ...(name === 'civil_status' && value.includes('Single')
        ? { spouse_name: 'N/A', children_count: 'N/A' }
        : {})
    }));
  };

  const handleDownloadPdfOrPrint = () => {
    if (!selectedProgram) {
      setSaveError(PROGRAM_REQUIRED_MESSAGE);
      setActiveView('editor');
      return;
    }
    if (!formData.sworn_attestation) {
      setSaveError("Confirm the sworn attestation before saving or printing this application.");
      return;
    }
    window.print();
  };

  const openPdfView = () => {
    if (!selectedProgram) {
      setSaveError(PROGRAM_REQUIRED_MESSAGE);
      setActiveView('editor');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setActiveView('preview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveToDatabase = async () => {
    if (!selectedProgram) {
      setSaveError(PROGRAM_REQUIRED_MESSAGE);
      return;
    }
    if (!formData.sworn_attestation) {
      setSaveError("Confirm the sworn attestation before saving or printing this application.");
      return;
    }
    setSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const application = {
        ...formData,
        status: formData.status || 'DRAFT',
        applicant_name: formData.applicant_name || user?.name || 'Guest'
      };
      let savedApplication;
      if (user && !user.isGuest) {
        savedApplication = await saveAccountApplication(application, csrfToken);
      } else {
        savedApplication = saveBrowserApplication(application);
      }
      setFormData((prev) => ({
        ...prev,
        id: savedApplication.id,
        reference_number: savedApplication.reference_number,
        case_id: savedApplication.case_id,
        status: savedApplication.status
      }));
      setSaveSuccess(`${user && !user.isGuest ? 'Record saved to your account.' : 'Record saved in this browser.'} ${savedApplication.reference_number}`);
      if (onSavedSuccess) onSavedSuccess(savedApplication);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const linkedCase = recoveryCases.find((recoveryCase) => recoveryCase.case_id === formData.case_id);
  const screenedProgramTitles = linkedCase
    ? getAssessmentEligibilityModel({
      eligibility_results: linkedCase.eligibility_results,
      matched_subsidies: linkedCase.recommended_subsidies
    }).programs
      .map((program) => program.title)
      .filter((title) => typeof title === 'string' && title.trim())
    : [];

  const selectedCaseExists = recoveryCases.some(
    (recoveryCase) => recoveryCase.case_id === formData.case_id
  );

  return (
    <div>
      {/* SCREEN ACTION TOOLBAR */}
      <div className="flow-card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="flow-heading">
              <FileText size={20} color="var(--primary)" />
              {"Disaster Assistance Application"}
            </h2>
            <p className="flow-subheading">
              {"Application for"}:{' '}
              {selectedProgram
                ? <strong>{selectedProgram}</strong>
                : <strong className="program-missing-text">No program chosen yet</strong>}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={14} /> {backLabel || "Back to assessment"}
            </button>
            <div className="segmented">
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveView('editor')}
              >
                <Edit3 size={14} /> {"Edit Details"}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveView('preview')}
              >
                <Eye size={14} /> {"A4 Print Preview"}
              </button>
            </div>

            <button
              type="button"
              className="btn-pill-dark"
              style={{ fontSize: 13, padding: '8px 18px' }}
              onClick={openPdfView}
              title={"Print / Save as PDF (A4)"}
            >
              <Download size={14} />
              {"Print / Save as PDF (A4)"}
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div role="status" className="alert alert-success">
            <CheckCircle2 size={16} />
            <strong>{saveSuccess}</strong>
          </div>
        )}
        {saveError && (
          <div role="alert" className="alert alert-error">
            {saveError}
          </div>
        )}
      </div>

      {/* VIEW 1: CLEAN RESPONSIVE FORM EDITOR */}
      {activeView === 'editor' && (
        <div className="application-editor no-print">
          <section className="app-section">
            <h3 className="app-section-title"><span>1</span>{"Aid program"}</h3>
            <div className="form-group">
              <label className="form-label" htmlFor="application-program">
                {"This application is for"} *
              </label>
              <select
                id="application-program"
                name="program"
                value={selectedProgram}
                onChange={handleProgramChange}
                className={`form-select${saveError === PROGRAM_REQUIRED_MESSAGE ? ' is-invalid' : ''}`}
                aria-required="true"
                aria-invalid={saveError === PROGRAM_REQUIRED_MESSAGE}
              >
                <option value="">{"Select an aid program"}</option>
                {selectedProgram && !catalog.some((subsidy) => subsidy.title === selectedProgram) && (
                  <option value={selectedProgram}>{selectedProgram}</option>
                )}
                {screenedProgramTitles.length > 0 && (
                  <optgroup label="Screened for the linked case">
                    {screenedProgramTitles.map((title) => (
                      <option key={`screened-${title}`} value={title}>{title}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={screenedProgramTitles.length ? 'Other aid programs' : 'Aid programs'}>
                  {catalog
                    .filter((subsidy) => !screenedProgramTitles.includes(subsidy.title))
                    .map((subsidy) => (
                      <option key={subsidy.id || subsidy.title} value={subsidy.title}>{subsidy.title}</option>
                    ))}
                </optgroup>
              </select>
              <p className="field-help">{"Each application is filed for one program. The requested amount starts at that program's planning estimate and can be changed below."}</p>
              {catalogError && <p role="alert" className="field-help">{catalogError}</p>}
            </div>
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>2</span>{"Link to a case (optional)"}</h3>
            <div className="form-group">
            <label className="form-label" htmlFor="application-recovery-case">
              {"Recovery case"}
            </label>
            <select
              id="application-recovery-case"
              name="case_id"
              value={formData.case_id || ''}
              onChange={handleChange}
              className="form-select"
            >
              <option value="">{"No linked recovery case"}</option>
              {formData.case_id && !selectedCaseExists && (
                <option value={formData.case_id}>
                  {initialData?.caseLabel || `${"Existing case"}: ${formData.case_id}`}
                </option>
              )}
              {recoveryCases
                .filter((recoveryCase) => recoveryCase.case_id)
                .map((recoveryCase) => (
                  <option key={recoveryCase.case_id} value={recoveryCase.case_id}>
                    {[
                      recoveryCase.disaster_type,
                      [recoveryCase.barangay, recoveryCase.city_municipality, recoveryCase.province]
                        .filter(Boolean)
                        .join(', '),
                      recoveryCase.incident_date
                    ].filter(Boolean).join(' — ')}
                  </option>
                ))}
            </select>
            <p className="field-help">{"Choose the case this application concerns. Linking is optional; Alalai will not select a case automatically."}</p>
            {casesLoading && <p className="field-help">{"Loading your recovery cases…"}</p>}
            {casesError && <p role="alert" className="field-help">{casesError}</p>}
            {!isAccountUser && <p className="field-help">{"Sign in to choose from your saved recovery cases. You may continue without linking a case."}</p>}
          </div>
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>3</span>{"Applicant"}</h3>
            <div className="app-grid">
<div className="form-group">
              <label className="form-label">{"Applicant Full Name"} *</label>
              <input
                type="text"
                name="applicant_name"
                value={formData.applicant_name}
                onChange={handleChange}
                className="form-input"
                placeholder="Hal. Juan Dela Cruz"
              />
            </div>
<div className="form-group">
              <label className="form-label">{"Age"}</label>
              <input
                type="number"
                name="applicant_age"
                value={formData.applicant_age}
                onChange={handleChange}
                className="form-input"
              />
            </div>
<div className="form-group">
              <label className="form-label">Date of birth</label>
              <input type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} className="form-input" />
            </div>
<div className="form-group">
              <label className="form-label">Sex</label>
              <select name="sex" value={formData.sex} onChange={handleChange} className="form-select">
                <option value="">Select</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Intersex">Intersex</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
<div className="form-group">
              <label className="form-label">{"Civil Status"}</label>
              <select
                name="civil_status"
                value={formData.civil_status}
                onChange={handleChange}
                className="form-select"
              >
                <option value="Kasal (Married)">Kasal (Married)</option>
                <option value="Walang Asawa (Single)">Walang Asawa (Single)</option>
                <option value="Biyudo/Biyuda (Widowed)">Biyudo / Biyuda</option>
                <option value="Solo Parent">Solo Parent</option>
              </select>
            </div>
<div className="form-group">
              <label className="form-label">{"Contact Number"}</label>
              <input
                type="text"
                name="contact_number"
                value={formData.contact_number}
                onChange={handleChange}
                className="form-input"
                placeholder="0917-000-0000"
              />
            </div>
            </div>
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>4</span>{"Identification"}</h3>
            <div className="app-grid">
<div className="form-group">
              <label className="form-label">{"Valid ID Type"}</label>
              <select
                name="valid_id_type"
                value={formData.valid_id_type}
                onChange={handleChange}
                className="form-select"
              >
                <option value="Philippine National ID (PhilSys)">PhilSys National ID</option>
                <option value="Senior Citizen ID">Senior Citizen ID</option>
                <option value="Barangay Certificate of Indigency">Barangay Certificate / ID</option>
                <option value="Voters ID / Certification">Voter's ID / Certification</option>
                <option value="PWD ID Card">PWD ID Card</option>
                <option value="SSS / UMID / GSIS Card">SSS / UMID / GSIS Card</option>
              </select>
            </div>
<div className="form-group">
              <label className="form-label">{"ID Number"}</label>
              <input
                type="text"
                name="valid_id_number"
                value={formData.valid_id_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Hal. 1234-5678-9012"
              />
            </div>
            </div>
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>5</span>{"Home address"}</h3>
            <LocationFields
              values={{
                province: formData.province,
                cityMunicipality: formData.city_municipality,
                barangay: formData.barangay,
                purokStreet: formData.purok_street,
              }}
              onChangeField={(field, value) => {
                const keyMap = {
                  province: 'province',
                  cityMunicipality: 'city_municipality',
                  barangay: 'barangay',
                  purokStreet: 'purok_street',
                };
                setFormData((prev) => ({ ...prev, [keyMap[field]]: value }));
              }}
              includeStreet={true}
              required={true}
            />
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>6</span>{"Household"}</h3>
            <div className="app-grid">
<div className="form-group">
              <label className="form-label">Household members *</label>
              <input type="number" min="1" name="household_members_count" value={formData.household_members_count} onChange={handleChange} className="form-input" />
            </div>
<div className="form-group">
                <label className="form-label">{"Spouse name"}</label>
                <input
                  type="text"
                  name="spouse_name"
                  value={formData.spouse_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder={formData.civil_status.includes('Single') ? 'N/A' : "Spouse name"}
                />
              </div>
<div className="form-group">
                <label className="form-label">{"Number of children"}</label>
                <input
                  type="text"
                  name="children_count"
                  value={formData.children_count}
                  onChange={handleChange}
                  className="form-input"
                  placeholder={formData.civil_status.includes('Single') ? 'N/A' : '0'}
                />
              </div>
<div className="form-group">
              <label className="form-label">Occupation / livelihood</label>
              <input type="text" name="occupation" value={formData.occupation} onChange={handleChange} className="form-input" placeholder="Farmer, fisherfolk, vendor, employee" />
            </div>
<div className="form-group">
              <label className="form-label">Beneficiary category</label>
              <select name="beneficiary_category" value={formData.beneficiary_category} onChange={handleChange} className="form-select">
                <option value="">Select if applicable</option>
                <option value="Disaster-affected household">Disaster-affected household</option>
                <option value="Farmer">Farmer</option>
                <option value="Fisherfolk">Fisherfolk</option>
                <option value="Livelihood worker / microenterprise">Livelihood worker / microenterprise</option>
              </select>
            </div>
            </div>
          </section>

          <section className="app-section">
            <h3 className="app-section-title"><span>7</span>{"Disaster and damage"}</h3>
            <div className="app-grid">
<div className="form-group">
              <label className="form-label">{"Disaster Event"}</label>
              <input
                type="text"
                name="disaster_type"
                value={formData.disaster_type}
                onChange={handleChange}
                className="form-input"
              />
            </div>
<div className="form-group">
              <label className="form-label">{"Incident Date"}</label>
              <input
                type="date"
                name="incident_date"
                value={formData.incident_date}
                onChange={handleChange}
                className="form-input"
              />
            </div>
<div className="form-group">
              <label className="form-label">{"Estimated Damage (₱)"}</label>
              <input
                type="number"
                name="estimated_damage_php"
                value={formData.estimated_damage_php}
                onChange={handleChange}
                className="form-input"
              />
            </div>
<div className="form-group">
              <label className="form-label">{"Requested Amount of Aid (₱)"}</label>
              <input
                type="number"
                name="requested_amount_php"
                value={formData.requested_amount_php}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            </div>
            <div className="app-stack">
<div className="form-group">
            <label className="form-label">{"Damage Summary"}</label>
            <textarea
              name="damage_summary"
              rows={3}
              value={formData.damage_summary}
              onChange={handleChange}
              className="form-textarea"
            />
          </div>
<div className="form-group">
            <label className="form-label">{"Family Needs"}</label>
            <input
              type="text"
              name="declared_needs"
              value={formData.declared_needs}
              onChange={handleChange}
              className="form-input"
            />
          </div>
            </div>
          </section>

          {hasAgriculturalProgram && (
            <section className="app-section">
              <h3 className="app-section-title"><span>8</span>{"Farm / fishery details"}</h3>
              <p className="field-help">{"Only for farmers or fisherfolk applying to an agricultural or crop-insurance program."}</p>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">RSBSA registration number</label>
                  <input type="text" name="rsbsa_number" value={formData.rsbsa_number} onChange={handleChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Farm / fishery activity</label>
                  <input type="text" name="agricultural_activity" value={formData.agricultural_activity} onChange={handleChange} className="form-input" placeholder="Rice, vegetables, livestock, fishing" />
                </div>
                <div className="form-group">
                  <label className="form-label">Farm / fishery location</label>
                  <input type="text" name="farm_fishery_location" value={formData.farm_fishery_location} onChange={handleChange} className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Land / fishing tenure</label>
                  <select name="land_tenure" value={formData.land_tenure} onChange={handleChange} className="form-select">
                    <option value="">Select if applicable</option>
                    <option value="Owner">Owner</option>
                    <option value="Tenant / leaseholder">Tenant / leaseholder</option>
                    <option value="Co-owner">Co-owner</option>
                    <option value="Communal / no formal title">Communal / no formal title</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">PCIC policy number</label>
                  <input type="text" name="pcic_policy_number" value={formData.pcic_policy_number} onChange={handleChange} className="form-input" placeholder="If crop insurance claim" />
                </div>
              </div>
            </section>
          )}

          <details className="app-section app-optional">
            <summary>{"Optional: representative and barangay reference"}</summary>
            <div className="app-grid">
<div className="form-group">
              <label className="form-label">Barangay certificate / incident reference</label>
              <input type="text" name="barangay_certificate_reference" value={formData.barangay_certificate_reference} onChange={handleChange} className="form-input" placeholder="Reference number, if issued" />
            </div>
<div className="form-group">
              <label className="form-label">Authorized representative</label>
              <input type="text" name="representative_name" value={formData.representative_name} onChange={handleChange} className="form-input" placeholder="Only if filing through a representative" />
            </div>
<div className="form-group">
              <label className="form-label">Representative relationship</label>
              <input type="text" name="representative_relationship" value={formData.representative_relationship} onChange={handleChange} className="form-input" />
            </div>
<div className="form-group">
              <label className="form-label">Representative contact</label>
              <input type="text" name="representative_contact" value={formData.representative_contact} onChange={handleChange} className="form-input" />
            </div>
            </div>
          </details>

          <section className="app-section app-final">
            <div className="app-confirm">
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                name="sworn_attestation"
                checked={formData.sworn_attestation}
                onChange={handleChange}
                style={{ marginTop: 4 }}
              />
              <span>
                <strong>{"I confirm the information in this application is true and accurate to the best of my knowledge."}</strong>
                <span className="field-help" style={{ display: 'block' }}>
                  {"You must check this box before saving or printing. This confirms your statement to Alalai; it does not submit the form to an agency."}
                </span>
              </span>
            </label>
          </div>
            <div className="app-actions">
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  setActiveView('preview');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Eye size={16} /> {"Preview A4 form"}
              </button>
              <button type="button" className="btn btn-primary btn-lg" disabled={saving} onClick={handleSaveToDatabase}>
                <Save size={16} /> {saving ? '…' : "Save Application"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: OFFICIAL PRINTABLE INTAKE SHEET (STRICT A4 SIZING) — always mounted so print works from editor mode */}
      <div
        className={
          activeView === 'preview'
            ? 'intake-sheet-print-host intake-sheet-print-host--visible-on-screen'
            : 'intake-sheet-print-host'
        }
      >
          {activeView === 'preview' && (
          <div className="no-print alert alert-info alert-info-bar" style={{ marginTop: 0 }}>
            <div>
              {"A4 format: This form is designed to fit on one standard A4 page (210mm x 297mm). Saving or printing does not submit it to an agency."}
            </div>
            <button
              type="button"
              className="btn-pill-dark"
              style={{ fontSize: 13, padding: '8px 18px' }}
              onClick={handleDownloadPdfOrPrint}
            >
              <Download size={14} /> {"Print / Save as PDF (A4)"}
            </button>
          </div>
          )}

          <div className="official-form-wrapper">
            <div className="official-form-container">
              {/* Header */}
              <div className="official-header">
                <div className="official-republic">DISASTER RELIEF INTAKE SLIP</div>
                <div className="official-dept" style={{ fontSize: '9pt', fontWeight: 600 }}>
                  Independent community assistance document
                </div>
                <div style={{ fontSize: '7.5pt', fontWeight: 600, marginTop: 4 }}>
                  Not affiliated with any government agency
                </div>
                <div className="official-form-title">
                  FAMILY CALAMITY ASSISTANCE APPLICATION
                </div>

                <div className="official-meta-bar">
                  <span>{"REFERENCE NO."}: <strong>{formData.reference_number || "TO BE SAVED"}</strong></span>
                  <span>{"DATE"}: <strong>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                  <span>{"STATUS"}: <strong>{formData.status}</strong></span>
                  <span>{"Recovery case"}: <strong>{formData.case_id || "No linked recovery case"}</strong></span>
                </div>
              </div>

              {/* SECTION 1 */}
              <div className="official-section-title">
                I. IMPORMASYON NG APLIKANTE AT TIRAHAN (APPLICANT INFORMATION)
              </div>
              <table className="official-table">
                <tbody>
                  <tr>
                    <th style={{ width: '25%' }}>Pangalan ng Ulo ng Pamilya</th>
                    <td style={{ width: '45%' }}><strong>{formData.applicant_name || '________________________'}</strong></td>
                    <th style={{ width: '15%' }}>{"Age"}</th>
                    <td style={{ width: '15%' }}>{formData.applicant_age || '___'} taong gulang</td>
                  </tr>
                  <tr>
                    <th>{"Civil Status"}</th>
                    <td>{formData.civil_status}</td>
                    <th>Birth date / sex</th>
                    <td>{formData.birth_date || 'N/A'}{formData.sex ? ` • ${formData.sex}` : ''}</td>
                  </tr>
                  <tr>
                    <th>Uri ng Valid ID</th>
                    <td>{formData.valid_id_type}</td>
                    <th>Telepono</th>
                    <td>{formData.contact_number || 'N/A'}</td>
                  </tr>
                  <tr>
                    <th>ID Number</th>
                    <td colSpan={3}><strong>{formData.valid_id_number || '____________________'}</strong></td>
                  </tr>
                  <tr>
                    <th>Tirahan (Address)</th>
                    <td colSpan={3}>
                      {[formData.purok_street, formData.barangay, formData.city_municipality, formData.province]
                        .filter(Boolean)
                        .join(', ') || 'Barangay, Munisipyo, Lalawigan'}
                    </td>
                  </tr>
                  <tr>
                    <th>Household / livelihood</th>
                    <td colSpan={3}>
                      {formData.household_members_count || '___'} member(s)
                      {formData.occupation ? ` • ${formData.occupation}` : ''}
                      {formData.beneficiary_category ? ` • ${formData.beneficiary_category}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th>Barangay reference</th>
                    <td colSpan={3}>{formData.barangay_certificate_reference || 'Not yet issued'}</td>
                  </tr>
                </tbody>
              </table>

              {/* SECTION 2 */}
              <div className="official-section-title">
                II. PAGTATAYA NG PINSALA AT KALAMIDAD (DISASTER & DAMAGE PROFILE)
              </div>
              <table className="official-table">
                <tbody>
                  <tr>
                    <th style={{ width: '25%' }}>Uri ng Kalamidad</th>
                    <td style={{ width: '40%' }}><strong>{formData.disaster_type}</strong></td>
                    <th style={{ width: '15%' }}>{"Incident Date"}</th>
                    <td style={{ width: '20%' }}>{formData.incident_date}</td>
                  </tr>
                  <tr>
                    <th>Antas ng Pinsala</th>
                    <td>
                      <strong style={{ textTransform: 'uppercase' }}>{formData.damage_level} DAMAGE</strong>
                    </td>
                    <th>Tantiya ng Halaga</th>
                    <td><strong>₱{Number(formData.estimated_damage_php || 0).toLocaleString()}</strong></td>
                  </tr>
                  <tr>
                    <th>{"Damage Summary"}</th>
                    <td colSpan={3} style={{ fontStyle: 'italic', padding: '6px' }}>
                      "{formData.damage_summary || 'Naisagawa ang pagsusuri batay sa testimonya ng mamamayan.'}"
                    </td>
                  </tr>
                  <tr>
                    <th>Programa / Hinihiling na Ayuda</th>
                    <td colSpan={3}>
                      <strong>
                        {selectedProgram || '________________________ (program not chosen)'}
                      </strong>
                      <span style={{ marginLeft: 12 }}>
                        (Halaga: ₱{Number(formData.requested_amount_php || 0).toLocaleString()})
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{"Family Needs"}</th>
                    <td colSpan={3}>{formData.declared_needs}</td>
                  </tr>
                  {hasAgriculturalProgram && (
                    <tr>
                      <th>Agriculture records</th>
                      <td colSpan={3}>
                        RSBSA: {formData.rsbsa_number || 'N/A'} • Activity: {formData.agricultural_activity || 'N/A'} •
                        Location: {formData.farm_fishery_location || 'N/A'} • PCIC policy: {formData.pcic_policy_number || 'N/A'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* SECTION 3 */}
              <div className="official-section-title">
                III. ASAWA AT MGA ANAK (SPOUSE AND CHILDREN)
              </div>
              <table className="official-table">
                <thead>
                  <tr>
                    <th style={{ width: '55%' }}>{"Spouse name"}</th>
                    <th style={{ width: '20%' }}>{"Number of children"}</th>
                    <th style={{ width: '25%' }}>Household relationship</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{formData.spouse_name || 'N/A'}</strong></td>
                    <td>{formData.children_count || 'N/A'}</td>
                    <td>{"Spouse and children"}</td>
                  </tr>
                </tbody>
              </table>

              {/* SECTION 4 */}
              <div className="official-section-title">
                IV. MGA KALAKIP NA DOKUMENTO (ATTACHMENT CHECKLIST)
              </div>
              <div className="official-checklist-grid">
                <div>{"Valid government-issued ID or acceptable local ID"}</div>
                <div>{"Proof of residence or Barangay certification"}</div>
                <div>{"Damage photos or inspection documentation"}</div>
                <div>{"Property, crop, or business loss supporting records"}</div>
              </div>
              <p className="official-footer-note">
                {"Bring valid copies of the required documents and confirm the latest checklist with the receiving office. Alalai does not verify or store attachments through this printout."}
              </p>

              {/* SECTION 5 */}
              <div className="official-attestation-box">
                <strong>SINUMPAANG SALAYSAY (SWORN ATTESTATION):</strong><br />
                {formData.sworn_attestation
                  ? 'Ako ay taos-pusong nagpapatunay sa ilalim ng parusa ng batas na ang lahat ng impormasyong nakatala sa dokumentong ito ay totoo at tumpak ayon sa aking pinakamahusay na kaalaman. Ang tulong na aking hihilingin ay gagamitin lamang para sa agarang pagbangon ng aming pamilya mula sa sakunang naganap.'
                  : "Attestation not confirmed. This is a draft and is not ready to be submitted."}
              </div>

              {/* SIGNATURES BLOCK */}
              <div className="official-signature-block">
                <div className="sig-box">
                  <div className="sig-line"></div>
                  <div className="sig-label">{formData.applicant_name || 'LAGDA NG APLIKANTE'}</div>
                  <div className="sig-sub">Lagda sa Ibabaw ng Limbag na Pangalan</div>
                </div>

                <div className="sig-box">
                  <div className="sig-line"></div>
                  <div className="sig-label">PUNONG BARANGAY / BDRRMC OFFICER</div>
                  <div className="sig-sub">Pangalan, Lagda, at Opisyal na Tatak ng Barangay</div>
                </div>
              </div>

              <div className="official-footer-note">
                Alal<span>ai</span> Calamity Portal • {"Prepared by the user. Saving or printing this document does not submit it to any agency or confirm approval."}
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}