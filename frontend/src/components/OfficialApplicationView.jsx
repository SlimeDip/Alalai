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
import { readSavedApplications, writeSavedApplications } from '../utils/applicationStorage';

export default function OfficialApplicationView({
  initialData,
  user,
  onSavedSuccess,
  onBack,
  backLabel,
  t = (k) => k,
  lang = 'en'
}) {
  const [activeView, setActiveView] = useState('editor'); // 'editor' | 'preview'
  const [formData, setFormData] = useState({
    id: '',
    reference_number: '',
    applicant_name: '',
    applicant_age: 42,
    civil_status: 'Kasal (Married)',
    contact_number: '',
    valid_id_type: 'Philippine National ID (PhilSys)',
    valid_id_number: '',
    province: '',
    city_municipality: '',
    barangay: '',
    purok_street: '',
    spouse_name: 'N/A',
    children_count: '0',
    disaster_type: 'Typhoon',
    incident_date: new Date().toISOString().split('T')[0],
    damage_level: 'Severe',
    damage_summary: '',
    applied_subsidies: [],
    estimated_damage_php: 25000,
    requested_amount_php: 10000,
    declared_needs: 'Yero (GI sheets), kahoy, pako, bigas, at agarang tulong pinansyal.',
    sworn_attestation: true,
    status: 'DRAFT'
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Auto-fill from incoming data or logged-in user
  useEffect(() => {
    if (initialData) {
      const applicant = initialData.applicant || {};
      const assessment = initialData.assessment || initialData.fullRecord?.ai_response || {};
      const subsidy = initialData.subsidy || {};

      setFormData((prev) => ({
        ...prev,
        applicant_name: applicant.applicantName || user?.name || prev.applicant_name,
        contact_number: applicant.contactNumber || user?.mobile || prev.contact_number,
        province: applicant.province || user?.province || prev.province,
        city_municipality: applicant.cityMunicipality || user?.cityMunicipality || prev.city_municipality,
        barangay: applicant.barangay || user?.barangay || prev.barangay,
        disaster_type: applicant.disasterType || applicant.disaster_type || assessment.disaster_type || prev.disaster_type,
        incident_date: applicant.incidentDate || prev.incident_date,
        damage_level: assessment.severity_level || prev.damage_level,
        damage_summary: assessment.damage_summary || applicant.damageDescription || prev.damage_summary,
        estimated_damage_php: assessment.estimated_cost_max || prev.estimated_damage_php,
        requested_amount_php: subsidy.max_amount_php || prev.requested_amount_php,
        applied_subsidies: subsidy.title ? [subsidy.title] : prev.applied_subsidies
      }));
    } else if (user && !user.isGuest) {
      setFormData((prev) => ({
        ...prev,
        applicant_name: user.name || prev.applicant_name,
        contact_number: user.mobile || prev.contact_number,
        province: user.province || prev.province,
        city_municipality: user.cityMunicipality || prev.city_municipality,
        barangay: user.barangay || prev.barangay
      }));
    }
  }, [initialData, user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'civil_status' && value.includes('Single')
        ? { spouse_name: 'N/A', children_count: 'N/A' }
        : {})
    }));
  };

  const handleDownloadPdfOrPrint = () => {
    window.print();
  };

  const handleSaveToDatabase = async () => {
    setSaving(true);
    setSaveSuccess('');
    try {
      const id = formData.id || `LOCAL-${Date.now().toString(36).toUpperCase()}`;
      const referenceNumber = formData.reference_number || `AL-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const savedApplication = {
        ...formData,
        id,
        reference_number: referenceNumber,
        status: 'DRAFT',
        saved_at: new Date().toISOString(),
        applicant_name: formData.applicant_name || user?.name || 'Guest'
      };
      const existing = readSavedApplications().filter((item) => item.id !== id);
      writeSavedApplications([savedApplication, ...existing]);
      setFormData((prev) => ({ ...prev, id, reference_number: referenceNumber, status: 'DRAFT' }));
      setSaveSuccess(`${t('recordSaved')} ${referenceNumber}`);
      if (onSavedSuccess) onSavedSuccess(savedApplication);
    } catch (err) {
      console.error(err);
      alert('May aberya sa pag-save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

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
              onClick={handleDownloadPdfOrPrint}
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
      </div>

      {/* VIEW 1: CLEAN RESPONSIVE FORM EDITOR */}
      {activeView === 'editor' && (
        <div className="flow-card no-print">
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: 'var(--slate-900)' }}>
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
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 14px 0', color: 'var(--slate-900)' }}>
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
                    <th>Telepono</th>
                    <td>{formData.contact_number || 'N/A'}</td>
                  </tr>
                  <tr>
                    <th>Uri ng Valid ID</th>
                    <td>{formData.valid_id_type}</td>
                    <th>ID Number</th>
                    <td><strong>{formData.valid_id_number || '____________________'}</strong></td>
                  </tr>
                  <tr>
                    <th>Tirahan (Address)</th>
                    <td colSpan={3}>
                      {[formData.purok_street, formData.barangay, formData.city_municipality, formData.province]
                        .filter(Boolean)
                        .join(', ') || 'Barangay, Munisipyo, Lalawigan'}
                    </td>
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
                </tbody>
              </table>

              {/* SECTION 3 */}
              <div className="official-section-title">
                III. ASAWA AT MGA ANAK (SPOUSE AND CHILDREN)
              </div>
              <table className="official-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%' }}>Blg.</th>
                    <th style={{ width: '52%' }}>{t('spouseName')}</th>
                    <th style={{ width: '15%' }}>{t('childrenCount')}</th>
                    <th style={{ width: '25%' }}>{t('relation')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
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
                <div>[✓] Kopya ng Valid Government ID ng Aplikante</div>
                <div>[✓] Barangay Certificate of Calamity / Indigency</div>
                <div>[✓] Litrato ng Nasirang Bahay / Pananim / Kabuhayan</div>
                <div>[✓] Katibayan ng Paninirahan sa Barangay</div>
              </div>

              {/* SECTION 5 */}
              <div className="official-attestation-box">
                <strong>SINUMPAANG SALAYSAY (SWORN ATTESTATION):</strong><br />
                Ako ay taos-pusong nagpapatunay sa ilalim ng parusa ng batas na ang lahat ng impormasyong nakatala sa dokumentong ito ay totoo at tumpak ayon sa aking pinakamahusay na kaalaman. Ang tulong na aking hihilingin ay gagamitin lamang para sa agarang pagbangon ng aming pamilya mula sa sakunang naganap.
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
                Alal<span>ai</span> Calamity Portal • Naka-format para sa A4 Paper Size (Fit to 1 Page) • Libre at Hindi Ipinagbibili • Republic Act 10121
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
