import React, { useState, useEffect } from 'react';
import {
  Printer,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
  FileText,
  Edit3,
  Eye,
  Check,
  Building,
  User,
  MapPin,
  Calendar
} from 'lucide-react';

export default function OfficialApplicationView({
  initialData,
  user,
  onSavedSuccess
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
    household_members_count: 3,
    household_members_detail: [
      { name: '', age: '', relationship: 'Asawa (Spouse)' },
      { name: '', age: '', relationship: 'Anak (Child)' }
    ],
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
      const assessment = initialData.assessment || {};
      const subsidy = initialData.subsidy || {};

      setFormData((prev) => ({
        ...prev,
        applicant_name: applicant.applicantName || user?.name || prev.applicant_name,
        contact_number: applicant.contactNumber || user?.mobile || prev.contact_number,
        province: applicant.province || user?.province || prev.province,
        city_municipality: applicant.cityMunicipality || user?.cityMunicipality || prev.city_municipality,
        barangay: applicant.barangay || user?.barangay || prev.barangay,
        disaster_type: applicant.disasterType || assessment.disaster_type || prev.disaster_type,
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
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleMemberChange = (index, field, value) => {
    const updated = [...formData.household_members_detail];
    updated[index][field] = value;
    setFormData((prev) => ({
      ...prev,
      household_members_detail: updated,
      household_members_count: updated.length + 1
    }));
  };

  const handleAddMember = () => {
    setFormData((prev) => {
      const updated = [
        ...prev.household_members_detail,
        { name: '', age: '', relationship: 'Anak (Child)' }
      ];
      return {
        ...prev,
        household_members_detail: updated,
        household_members_count: updated.length + 1
      };
    });
  };

  const handleRemoveMember = (index) => {
    setFormData((prev) => {
      const updated = prev.household_members_detail.filter((_, i) => i !== index);
      return {
        ...prev,
        household_members_detail: updated,
        household_members_count: updated.length + 1
      };
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveToDatabase = async () => {
    setSaving(true);
    setSaveSuccess('');
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save application.');
      }

      setFormData((prev) => ({
        ...prev,
        id: data.data.id,
        reference_number: data.data.reference_number,
        status: data.data.status
      }));

      setSaveSuccess(`Naitala ang aplikasyon! Reference: ${data.data.reference_number}`);
      if (onSavedSuccess) onSavedSuccess(data.data);
    } catch (err) {
      console.error(err);
      alert('May aberya sa pag-save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* ACTION TOOLBAR (SCREEN ONLY) */}
      <div className="modern-card no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="card-heading">
              <FileText size={20} color="var(--primary)" />
              Opisyal na Intake Slip at Dokumento ng Ayuda
            </h2>
            <p className="card-subheading">
              I-edit ang anumang bahagi sa editor, o lumipat sa Print Preview upang i-print nang direkta.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', backgroundColor: 'var(--slate-100)', padding: 3, borderRadius: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => setActiveView('editor')}
              >
                <Edit3 size={14} /> Form Editor
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none' }}
                onClick={() => setActiveView('preview')}
              >
                <Eye size={14} /> Print Preview
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving}
              onClick={handleSaveToDatabase}
            >
              <Save size={15} />
              {saving ? 'Isina-save...' : 'I-save sa Rekord'}
            </button>

            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handlePrint}
            >
              <Printer size={15} />
              I-print ang Form
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="alert alert-success" style={{ marginTop: 14 }}>
            <CheckCircle2 size={16} />
            <strong>{saveSuccess}</strong>
          </div>
        )}
      </div>

      {/* VIEW 1: CLEAN RESPONSIVE FORM EDITOR */}
      {activeView === 'editor' && (
        <div className="modern-card no-print">
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--slate-900)' }}>
            I. Detalye ng Aplikante at Tirahan
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Buong Pangalan ng Aplikante *</label>
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
              <label className="form-label">Edad (Age)</label>
              <input
                type="number"
                name="applicant_age"
                value={formData.applicant_age}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Katayuang Sibil</label>
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
              <label className="form-label">Uri ng Valid ID</label>
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
              <label className="form-label">Numero ng ID</label>
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
              <label className="form-label">Telepono / Cellphone</label>
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
              <label className="form-label">Purok / Kalye</label>
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
              <label className="form-label">Barangay *</label>
              <input
                type="text"
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lungsod / Bayan *</label>
              <input
                type="text"
                name="city_municipality"
                value={formData.city_municipality}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lalawigan (Province) *</label>
              <input
                type="text"
                name="province"
                value={formData.province}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 14px 0', color: 'var(--slate-900)' }}>
            II. Detalye ng Kalamidad at Pinsala
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Kalamidad (Disaster Event)</label>
              <input
                type="text"
                name="disaster_type"
                value={formData.disaster_type}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Petsa ng Sakuna</label>
              <input
                type="date"
                name="incident_date"
                value={formData.incident_date}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tantiya ng Halaga ng Pinsala (₱)</label>
              <input
                type="number"
                name="estimated_damage_php"
                value={formData.estimated_damage_php}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hinihiling na Halaga ng Ayuda (₱)</label>
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
            <label className="form-label">Opisyal na Buod ng Pinsala</label>
            <textarea
              name="damage_summary"
              rows={3}
              value={formData.damage_summary}
              onChange={handleChange}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pangangailangan ng Pamilya (Declared Needs)</label>
            <input
              type="text"
              name="declared_needs"
              value={formData.declared_needs}
              onChange={handleChange}
              className="form-input"
            />
          </div>

          {/* Household members list */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontSize: 15 }}>Kasama sa Tirahan (Household Members):</strong>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddMember}
              >
                <Plus size={14} /> Magdagdag
              </button>
            </div>

            {formData.household_members_detail.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Pangalan"
                  value={m.name}
                  onChange={(e) => handleMemberChange(idx, 'name', e.target.value)}
                  className="form-input"
                  style={{ flex: 2 }}
                />
                <input
                  type="number"
                  placeholder="Edad"
                  value={m.age}
                  onChange={(e) => handleMemberChange(idx, 'age', e.target.value)}
                  className="form-input"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder="Relasyon"
                  value={m.relationship}
                  onChange={(e) => handleMemberChange(idx, 'relationship', e.target.value)}
                  className="form-input"
                  style={{ flex: 1.5 }}
                />
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemoveMember(idx)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                setActiveView('preview');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <Eye size={16} /> I-preview at I-print ang Form
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: OFFICIAL PRINTABLE INTAKE SHEET */}
      {(activeView === 'preview' || window.matchMedia('print').matches) && (
        <div style={{ overflowX: 'auto' }}>
          <div className="official-form-container">
            {/* Header */}
            <div className="official-header">
              <div className="official-republic">Republika ng Pilipinas</div>
              <div className="official-dept">PAMAHALAANG LOKAL AT KAGAWARAN NG KAGALINGANG PANLIPUNAN</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>DSWD • NDRRMC • MUNICIPAL DISASTER RISK REDUCTION DESK</div>
              <div className="official-form-title">
                DISASTER ASSISTANCE FAMILY INTAKE & SUBSIDY APPLICATION SLIP
              </div>

              <div className="official-meta-bar">
                <span>REFERENCE BLG: <strong>{formData.reference_number || 'TBA SA PAG-SAVE'}</strong></span>
                <span>PETSA: <strong>{new Date().toLocaleDateString('fil-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                <span>KATAYUAN: <strong>{formData.status}</strong></span>
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
                  <th style={{ width: '15%' }}>Edad</th>
                  <td style={{ width: '15%' }}>{formData.applicant_age || '___'} taong gulang</td>
                </tr>
                <tr>
                  <th>Katayuang Sibil</th>
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
                  <th style={{ width: '15%' }}>Petsa ng Sakuna</th>
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
                  <th>Opisyal na Buod ng Pinsala</th>
                  <td colSpan={3} style={{ fontStyle: 'italic', padding: '10px' }}>
                    "{formData.damage_summary || 'Naisagawa ang pagsusuri batay sa testimonya ng mamamayan.'}"
                  </td>
                </tr>
                <tr>
                  <th>Hinihiling na Ayuda</th>
                  <td colSpan={3}>
                    <strong>
                      {formData.applied_subsidies && formData.applied_subsidies.length > 0
                        ? formData.applied_subsidies.join(', ')
                        : 'DSWD Emergency Shelter Assistance (ESA) / AICS Assistance'}
                    </strong>
                    <span style={{ marginLeft: 16 }}>
                      (Halaga: ₱{Number(formData.requested_amount_php || 0).toLocaleString()})
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>Pangangailangan ng Pamilya</th>
                  <td colSpan={3}>{formData.declared_needs}</td>
                </tr>
              </tbody>
            </table>

            {/* SECTION 3 */}
            <div className="official-section-title">
              III. TALAAN NG MGA KASAMBAHAY (LIST OF HOUSEHOLD MEMBERS)
            </div>
            <table className="official-table">
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>Blg.</th>
                  <th style={{ width: '50%' }}>Buong Pangalan</th>
                  <th style={{ width: '15%' }}>Edad</th>
                  <th style={{ width: '25%' }}>Relasyon sa Ulo ng Pamilya</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td><strong>{formData.applicant_name} (Applicant / Ulo ng Pamilya)</strong></td>
                  <td>{formData.applicant_age}</td>
                  <td>Head of Household</td>
                </tr>
                {formData.household_members_detail.map((member, mIdx) => (
                  <tr key={mIdx}>
                    <td>{mIdx + 2}</td>
                    <td>{member.name || '(Pangalan ng Miyembro)'}</td>
                    <td>{member.age || '—'}</td>
                    <td>{member.relationship || 'Kasambahay'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* SECTION 4 */}
            <div className="official-section-title">
              IV. MGA KALAKIP NA DOKUMENTO (ATTACHMENT CHECKLIST)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 13, margin: '8px 0 16px 0' }}>
              <div>[✓] Kopya ng Valid Government ID ng Aplikante</div>
              <div>[✓] Barangay Certificate of Calamity / Indigency</div>
              <div>[✓] Litrato ng Nasirang Bahay / Pananim / Kabuhayan</div>
              <div>[✓] Katibayan ng Paninirahan sa Barangay</div>
            </div>

            {/* SECTION 5 */}
            <div style={{ border: '1px solid var(--slate-900)', padding: '10px', fontSize: 12, backgroundColor: 'var(--slate-50)', lineHeight: 1.4 }}>
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

            <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px dashed var(--slate-500)', fontSize: 11, textAlign: 'center', color: 'var(--slate-600)' }}>
              Tulong Bayan Calamity Portal • Libre at Hindi Ipinagbibili • Republic Act 10121 (DRRM Act of 2010)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
