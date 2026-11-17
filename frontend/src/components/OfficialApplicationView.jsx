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
  saveAccountApplication
} from '../utils/applicationStorage';
import { fetchCaseDocuments } from '../utils/documentApi';
import { fetchOwnedRecoveryCases } from '../utils/trackerApi';
import {
  createApplicationFormData,
  getApplicationDocuments,
  getAttachmentChecklist
} from '../utils/applicationForm';

export default function OfficialApplicationView({
  initialData,
  user,
  csrfToken,
  onSavedSuccess,
  onBack,
  backLabel,
  t = (k) => k,
  lang = 'en'
}) {
  const [activeView, setActiveView] = useState('editor'); // 'editor' | 'preview'
  const [formData, setFormData] = useState(() => createApplicationFormData(initialData, user));

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [recoveryCases, setRecoveryCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState('');
  const [caseDocuments, setCaseDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const isAccountUser = Boolean(user && !user.isGuest);

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

  useEffect(() => {
    let active = true;
    if (!isAccountUser || !formData.case_id) {
      setCaseDocuments([]);
      setDocumentsError('');
      setDocumentsLoading(false);
      return () => { active = false; };
    }

    setCaseDocuments([]);
    setDocumentsError('');
    setDocumentsLoading(true);
    fetchCaseDocuments(formData.case_id)
      .then((documents) => {
        if (active) setCaseDocuments(documents);
      })
      .catch((error) => {
        if (active) setDocumentsError(error.message);
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });

    return () => { active = false; };
  }, [formData.case_id, isAccountUser, user]);

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
    if (!formData.sworn_attestation) {
      setSaveError(t('attestationRequired'));
      return;
    }
    if (documentsLoading || documentsError) {
      setSaveError(documentsError || t('documentsStillLoading'));
      return;
    }
    window.print();
  };

  const openPdfView = () => {
    setActiveView('preview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveToDatabase = async () => {
    if (!formData.sworn_attestation) {
      setSaveError(t('attestationRequired'));
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
      const savedMessage = user && !user.isGuest ? 'recordSavedAccount' : 'recordSavedBrowser';
      setSaveSuccess(`${t(savedMessage)} ${savedApplication.reference_number}`);
      if (onSavedSuccess) onSavedSuccess(savedApplication);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const caseDocumentsForApplication = getApplicationDocuments(caseDocuments, formData.id);
  const attachmentChecklist = getAttachmentChecklist(caseDocumentsForApplication);
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
              {t('appTitle')}
            </h2>
            <p className="flow-subheading">{t('applyingFor')}: <strong>{formData.applied_subsidies[0] || t('generalAssistance')}</strong></p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
              <ArrowLeft size={14} /> {backLabel || t('backToAssessment')}
            </button>
            <div style={{ display: 'inline-flex', backgroundColor: 'var(--slate-100)', padding: 3, borderRadius: 9999 }}>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => setActiveView('editor')}
              >
                <Edit3 size={14} /> {t('editorTab')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => setActiveView('preview')}
              >
                <Eye size={14} /> {t('previewTab')}
              </button>
            </div>

            <button
              type="button"
              className="btn-pill-dark"
              style={{ fontSize: 13, padding: '8px 18px' }}
              onClick={openPdfView}
              title={t('printBtn')}
            >
              <Download size={14} />
              {t('printBtn')}
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: 10, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <CheckCircle2 size={16} />
            <strong>{saveSuccess}</strong>
          </div>
        )}
        {saveError && (
          <div role="alert" style={{ backgroundColor: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 14px', borderRadius: 10, marginTop: 14, fontSize: 14 }}>
            {saveError}
          </div>
        )}
      </div>

      {/* VIEW 1: CLEAN RESPONSIVE FORM EDITOR */}
      {activeView === 'editor' && (
        <div className="flow-card application-editor no-print">
          <div className="application-form-heading">
            <span>ALALAI COMMUNITY DISASTER ASSISTANCE</span>
            <strong>{t('applicantDetailsSection')}</strong>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="application-recovery-case">
              {t('recoveryCaseLink')}
            </label>
            <select
              id="application-recovery-case"
              name="case_id"
              value={formData.case_id || ''}
              onChange={handleChange}
              className="form-select"
            >
              <option value="">{t('noRecoveryCase')}</option>
              {formData.case_id && !selectedCaseExists && (
                <option value={formData.case_id}>
                  {initialData?.caseLabel || `${t('savedCaseReference')}: ${formData.case_id}`}
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
            <p className="field-help">{t('recoveryCaseLinkHelp')}</p>
            {casesLoading && <p className="field-help">{t('loadingRecoveryCases')}</p>}
            {casesError && <p role="alert" className="field-help">{casesError}</p>}
            {!isAccountUser && <p className="field-help">{t('guestCaseLinkNotice')}</p>}
          </div>

          <h3 className="application-section-heading">
            {t('applicantDetailsSection')}
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t('fullName')} *</label>
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
              <label className="form-label">{t('age')}</label>
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
              <label className="form-label">{t('civilStatus')}</label>
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
              <label className="form-label">{t('idType')}</label>
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
              <label className="form-label">{t('idNumber')}</label>
              <input
                type="text"
                name="valid_id_number"
                value={formData.valid_id_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Hal. 1234-5678-9012"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('phone')}</label>
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

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">{t('street')}</label>
              <input
                type="text"
                name="purok_street"
                value={formData.purok_street}
                onChange={handleChange}
                className="form-input"
                placeholder="Purok 2"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('barangay')} *</label>
              <input
                type="text"
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('city')} *</label>
              <input
                type="text"
                name="city_municipality"
                value={formData.city_municipality}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('province')} *</label>
              <input
                type="text"
                name="province"
                value={formData.province}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Household members *</label>
              <input type="number" min="1" name="household_members_count" value={formData.household_members_count} onChange={handleChange} className="form-input" />
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

          <div className="form-grid" style={{ marginTop: 8 }}>
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

          <h3 className="application-section-heading">
            {t('disasterDetailsSection')}
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">{t('disasterEvent')}</label>
              <input
                type="text"
                name="disaster_type"
                value={formData.disaster_type}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('disasterDate')}</label>
              <input
                type="date"
                name="incident_date"
                value={formData.incident_date}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('estimatedDamage')}</label>
              <input
                type="number"
                name="estimated_damage_php"
                value={formData.estimated_damage_php}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('requestedAmount')}</label>
              <input
                type="number"
                name="requested_amount_php"
                value={formData.requested_amount_php}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          {hasAgriculturalProgram && (
            <>
              <h3 className="application-section-heading">Agriculture / crop insurance details</h3>
              <p className="field-help">Complete these only when applying as a farmer or fisherfolk for an agricultural or crop-insurance program.</p>
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
            </>
          )}

          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">{t('damageSummary')}</label>
            <textarea
              name="damage_summary"
              rows={3}
              value={formData.damage_summary}
              onChange={handleChange}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('declaredNeeds')}</label>
            <input
              type="text"
              name="declared_needs"
              value={formData.declared_needs}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                name="sworn_attestation"
                checked={formData.sworn_attestation}
                onChange={handleChange}
                style={{ marginTop: 4 }}
              />
              <span>
                <strong>{t('attestationConfirmation')}</strong>
                <span className="field-help" style={{ display: 'block' }}>
                  {t('attestationConfirmationHelp')}
                </span>
              </span>
            </label>
          </div>

          {/* Household summary */}
          <div style={{ marginTop: 20 }}>
            <strong style={{ display: 'block', fontSize: 15, marginBottom: 10 }}>{t('householdMembers')}</strong>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t('spouseName')}</label>
                <input
                  type="text"
                  name="spouse_name"
                  value={formData.spouse_name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder={formData.civil_status.includes('Single') ? 'N/A' : t('spouseName')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('childrenCount')}</label>
                <input
                  type="text"
                  name="children_count"
                  value={formData.children_count}
                  onChange={handleChange}
                  className="form-input"
                  placeholder={formData.civil_status.includes('Single') ? 'N/A' : '0'}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn-pill-primary"
              onClick={() => {
                setActiveView('preview');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <Eye size={16} /> I-preview ang A4 Form
            </button>
          </div>
          <div className="form-actions-row application-bottom-actions" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-lg" disabled={saving} onClick={handleSaveToDatabase}>
              <Save size={16} /> {saving ? '…' : t('saveBtn')}
            </button>
          </div>
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
          <div className="no-print" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: '12px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#1e40af' }}>
              {t('printGuaranteeNotice')}
            </div>
            <button
              type="button"
              className="btn-pill-dark"
              style={{ fontSize: 13, padding: '8px 18px' }}
              onClick={handleDownloadPdfOrPrint}
            >
              <Download size={14} /> {t('printBtn')}
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
                  <span>{t('referenceNumber')}: <strong>{formData.reference_number || t('toBeSaved')}</strong></span>
                  <span>{t('dateLabel')}: <strong>{new Date().toLocaleDateString(lang === 'tl' ? 'fil-PH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                  <span>{t('statusLabel')}: <strong>{formData.status}</strong></span>
                  <span>{t('recoveryCaseLink')}: <strong>{formData.case_id || t('noRecoveryCase')}</strong></span>
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
                    <th style={{ width: '15%' }}>{t('age')}</th>
                    <td style={{ width: '15%' }}>{formData.applicant_age || '___'} taong gulang</td>
                  </tr>
                  <tr>
                    <th>{t('civilStatus')}</th>
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
                    <th style={{ width: '15%' }}>{t('disasterDate')}</th>
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
                    <th>{t('damageSummary')}</th>
                    <td colSpan={3} style={{ fontStyle: 'italic', padding: '6px' }}>
                      "{formData.damage_summary || 'Naisagawa ang pagsusuri batay sa testimonya ng mamamayan.'}"
                    </td>
                  </tr>
                  <tr>
                    <th>Hinihiling na Ayuda</th>
                    <td colSpan={3}>
                      <strong>
                        {formData.applied_subsidies && formData.applied_subsidies.length > 0
                          ? formData.applied_subsidies.join(', ')
                          : 'Emergency shelter / family relief (local programs)'}
                      </strong>
                      <span style={{ marginLeft: 12 }}>
                        (Halaga: ₱{Number(formData.requested_amount_php || 0).toLocaleString()})
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>{t('declaredNeeds')}</th>
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
                    <th style={{ width: '55%' }}>{t('spouseName')}</th>
                    <th style={{ width: '20%' }}>{t('childrenCount')}</th>
                    <th style={{ width: '25%' }}>Household relationship</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{formData.spouse_name || 'N/A'}</strong></td>
                    <td>{formData.children_count || 'N/A'}</td>
                    <td>{t('spouseAndChildren')}</td>
                  </tr>
                </tbody>
              </table>

              {/* SECTION 4 */}
              <div className="official-section-title">
                IV. MGA KALAKIP NA DOKUMENTO (ATTACHMENT CHECKLIST)
              </div>
              <div className="official-checklist-grid">
                <div>
                  {t('identityCategoryFiles')}: {attachmentChecklist.identityFiles.length
                    ? `${attachmentChecklist.identityFiles.length} ${t('vaultFilesRecorded')}`
                    : t('noVaultFilesRecorded')}
                </div>
                <div>
                  {t('damagePhotoCategoryFiles')}: {attachmentChecklist.damagePhotoFiles.length
                    ? `${attachmentChecklist.damagePhotoFiles.length} ${t('vaultFilesRecorded')}`
                    : t('noVaultFilesRecorded')}
                </div>
                <div>{t('barangayDocumentsNotVerified')}</div>
                <div>{t('residencyDocumentsNotVerified')}</div>
              </div>
              <p className="official-footer-note">
                {documentsLoading
                  ? t('documentsStillLoading')
                  : documentsError
                    ? t('documentsCouldNotLoad')
                    : !formData.case_id
                      ? t('vaultNeedsLinkedCase')
                      : t('vaultChecklistDisclaimer')}
              </p>
              {caseDocumentsForApplication.length > 0 && (
                <ul className="official-document-list">
                  {caseDocumentsForApplication.map((document) => (
                    <li key={document.document_id}>
                      {document.original_filename} ({document.category}) — {t('vaultFileNotAttached')}
                    </li>
                  ))}
                </ul>
              )}

              {/* SECTION 5 */}
              <div className="official-attestation-box">
                <strong>SINUMPAANG SALAYSAY (SWORN ATTESTATION):</strong><br />
                {formData.sworn_attestation
                  ? 'Ako ay taos-pusong nagpapatunay sa ilalim ng parusa ng batas na ang lahat ng impormasyong nakatala sa dokumentong ito ay totoo at tumpak ayon sa aking pinakamahusay na kaalaman. Ang tulong na aking hihilingin ay gagamitin lamang para sa agarang pagbangon ng aming pamilya mula sa sakunang naganap.'
                  : t('attestationNotConfirmed')}
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
                Alal<span>ai</span> Calamity Portal • {t('printNotSubmittedNotice')}
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
