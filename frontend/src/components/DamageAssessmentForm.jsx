import React, { useState, useEffect } from 'react';
import {
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  User,
  Calendar,
  DollarSign,
  Shield,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ClipboardList,
  Info,
  Check
} from 'lucide-react';

const PRESETS = [
  {
    label: 'Bagyo: Wasak na Bubong at Bahay',
    disasterType: 'Typhoon',
    applicantName: 'Eduardo Santos',
    contactNumber: '09171234567',
    province: 'Cagayan',
    cityMunicipality: 'Tuguegarao City',
    barangay: 'Caritan Norte',
    householdSize: 5,
    damageDescription: 'Dumaan ang malakas na bagyo. Natanggal ang halos lahat ng yero sa aming bubong at bumagsak ang kahoy na haligi sa kusina. Nabasa ang lahat ng aming gamit at kutson dahil sa tuloy-tuloy na ulan.'
  },
  {
    label: 'Baha: Lubog na Palayan at Pananim',
    disasterType: 'Flash Flood',
    applicantName: 'Danilo Cruz',
    contactNumber: '09289876543',
    province: 'Pampanga',
    cityMunicipality: 'Candaba',
    barangay: 'San Agustin',
    householdSize: 4,
    damageDescription: 'Umapaw ang ilog at umabot sa dibdib ang baha sa aming sakahan. Nalubog ang dalawang ektaryang tanim na palay na malapit nang anihin. Nawasak din ang lambat at nawala ang mga alagang manok.'
  },
  {
    label: 'Lindol: Bitak na Pader at Sirang Tindahan',
    disasterType: 'Earthquake',
    applicantName: 'Teresita Morales',
    contactNumber: '09395551234',
    province: 'Davao del Sur',
    cityMunicipality: 'Digos City',
    barangay: 'Zone 1',
    householdSize: 3,
    damageDescription: 'Lumindol ng malakas. Nagkaroon ng malalaking bitak sa kongkretong pader ng aming bahay at delikado nang tirhan. Bumagsak ang mga estante ng aming maliit na sari-sari store at nasira ang mga paninda.'
  }
];

export default function DamageAssessmentForm({
  user,
  onSelectSubsidyForApplication
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    disasterType: 'Typhoon',
    incidentDate: new Date().toISOString().split('T')[0],
    applicantName: '',
    contactNumber: '',
    province: '',
    cityMunicipality: '',
    barangay: '',
    householdSize: 3,
    damageDescription: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Prefill from user session if available
  useEffect(() => {
    if (user && !user.isGuest) {
      setFormData((prev) => ({
        ...prev,
        applicantName: user.name || prev.applicantName,
        contactNumber: user.mobile || prev.contactNumber,
        province: user.province || prev.province,
        cityMunicipality: user.cityMunicipality || prev.cityMunicipality,
        barangay: user.barangay || prev.barangay
      }));
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleApplyPreset = (preset) => {
    setFormData((prev) => ({
      ...prev,
      disasterType: preset.disasterType,
      applicantName: preset.applicantName,
      contactNumber: preset.contactNumber,
      province: preset.province,
      cityMunicipality: preset.cityMunicipality,
      barangay: preset.barangay,
      householdSize: preset.householdSize,
      damageDescription: preset.damageDescription
    }));
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!formData.disasterType) {
        setErrorMsg('Pakipili po ang uri ng kalamidad.');
        return;
      }
      setErrorMsg('');
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setErrorMsg('');
    setCurrentStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!formData.damageDescription.trim()) {
      setErrorMsg('Pakisulat po ang paglalarawan ng pinsala.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Nabigo ang pagsusuri ng pinsala.');
      }

      setResult(data.data);
      setCurrentStep(3); // Advance to results step
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Hindi makakonekta sa assessment server.');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadgeClass = (level) => {
    switch (level?.toLowerCase()) {
      case 'catastrophic':
        return 'badge-severe';
      case 'severe':
        return 'badge-severe';
      case 'moderate':
        return 'badge-moderate';
      default:
        return 'badge-low';
    }
  };

  return (
    <div>
      {/* PROGRESS STEPPER (Keeps user focused and uncluttered) */}
      <div className="wizard-stepper no-print">
        <div className={`step-node ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 1 ? <Check size={16} /> : '1'}
          </div>
          <span className="step-label">Kalamidad at Tirahan</span>
        </div>

        <div className="step-connector"></div>

        <div className={`step-node ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 2 ? <Check size={16} /> : '2'}
          </div>
          <span className="step-label">Ilarawan ang Pinsala</span>
        </div>

        <div className="step-connector"></div>

        <div className={`step-node ${currentStep === 3 ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <span className="step-label">Resulta at Ayuda</span>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: DISASTER EVENT & LOCATION */}
      {currentStep === 1 && (
        <div className="modern-card">
          <div className="modern-card-header">
            <div>
              <h2 className="card-heading">
                <AlertTriangle size={20} color="var(--primary)" />
                Hakbang 1: Detalye ng Kalamidad at Tirahan
              </h2>
              <p className="card-subheading">
                Piliin ang naganap na sakuna at ilagay ang lokasyon ng inyong pamilya.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Uri ng Kalamidad (Disaster Event) *</label>
              <select
                name="disasterType"
                value={formData.disasterType}
                onChange={handleChange}
                className="form-select"
                required
              >
                <option value="Typhoon">Bagyo (Typhoon / Malalakas na Hangin)</option>
                <option value="Flash Flood">Baha / Flash Flood</option>
                <option value="Earthquake">Lindol (Earthquake)</option>
                <option value="Landslide">Pagguho ng Lupa (Landslide)</option>
                <option value="Fire">Sunog (Fire)</option>
                <option value="Volcanic Eruption">Pagsabog ng Bulkan / Ashfall</option>
                <option value="Drought">Tagtuyot / El Niño</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <Calendar size={15} /> Petsa ng Pagkaganap (Date) *
              </label>
              <input
                type="date"
                name="incidentDate"
                value={formData.incidentDate}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">
                <User size={15} /> Pangalan ng Ulo ng Pamilya (Household Head)
              </label>
              <input
                type="text"
                name="applicantName"
                placeholder="Hal. Juan Dela Cruz"
                value={formData.applicantName}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Numero ng Telepono</label>
              <input
                type="text"
                name="contactNumber"
                placeholder="Hal. 0917-123-4567"
                value={formData.contactNumber}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">
                <MapPin size={15} /> Lalawigan (Province)
              </label>
              <input
                type="text"
                name="province"
                placeholder="Hal. Pangasinan"
                value={formData.province}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Lungsod / Bayan (City/Municipality)</label>
              <input
                type="text"
                name="cityMunicipality"
                placeholder="Hal. Dagupan City"
                value={formData.cityMunicipality}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Barangay</label>
              <input
                type="text"
                name="barangay"
                placeholder="Hal. Pantal"
                value={formData.barangay}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleNextStep}
            >
              Susunod: Ilarawan ang Pinsala
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DAMAGE NARRATIVE & PRESETS */}
      {currentStep === 2 && (
        <div className="modern-card">
          <div className="modern-card-header">
            <div>
              <h2 className="card-heading">
                <FileSearch size={20} color="var(--primary)" />
                Hakbang 2: Detalye ng Pinsala sa Bahay o Kabuhayan
              </h2>
              <p className="card-subheading">
                Ipaliwanag kung ano ang nasira upang makalkula ng AI ang antas ng tulong.
              </p>
            </div>
          </div>

          {/* Presets to make it effortless */}
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-600)' }}>
              Mabilis na Halimbawa (Pumili ng isa para awtomatikong punan):
            </span>
            <div className="preset-chips">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="preset-chip"
                  onClick={() => handleApplyPreset(p)}
                >
                  <ClipboardList size={14} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAnalyze}>
            <div className="form-group">
              <label className="form-label">
                <Info size={15} />
                Ilarawan ang Naging Pinsala (Damage Description) *
              </label>
              <textarea
                name="damageDescription"
                value={formData.damageDescription}
                onChange={handleChange}
                rows={5}
                className="form-textarea"
                placeholder="Halimbawa: Natanggal ang yero sa bubong, gumuho ang pader sa kusina, nalubog sa baha ang palayan o tindahan..."
                required
              />
              <span className="field-help">
                Maaaring isulat sa Tagalog, Ilokano, Cebuano, o Ingles.
              </span>
            </div>

            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Bilang ng Kasambahay (Household Members)</label>
              <input
                type="number"
                name="householdSize"
                min="1"
                max="20"
                value={formData.householdSize}
                onChange={handleChange}
                className="form-input"
              />
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={handlePrevStep}
              >
                <ArrowLeft size={16} />
                Bumalik (Previous)
              </button>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-lg"
              >
                {loading ? (
                  <span>Kasalukuyang sinusuri ng AI...</span>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Suriin ang Pinsala at Hanapin ang Ayuda
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: RESULTS & SUBSIDIES */}
      {currentStep === 3 && result && (
        <div>
          <div className="modern-card" style={{ border: '2px solid var(--primary)' }}>
            <div className="modern-card-header">
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                  RESULTA NG PAGTATASA • REF: {result.id}
                </span>
                <h2 className="card-heading" style={{ marginTop: 2 }}>
                  Pagtataya ng Pinsala: {formData.applicantName || 'Mamamayan'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${getSeverityBadgeClass(result.severity_level)}`}>
                  Antas: {result.severity_level} ({result.severity_score}/100)
                </span>
                <span className="badge badge-agency">
                  {result.engine || 'AI Engine'}
                </span>
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div style={{ backgroundColor: 'var(--slate-50)', padding: 14, borderRadius: 6, border: '1px solid var(--slate-200)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                  Tinatayang Halaga ng Pinsala
                </span>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
                  ₱{result.estimated_cost_min?.toLocaleString()} - ₱{result.estimated_cost_max?.toLocaleString()}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--slate-50)', padding: 14, borderRadius: 6, border: '1px solid var(--slate-200)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                  Kagyat na Pangangailangan
                </span>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--amber-700)', marginTop: 4 }}>
                  {result.urgency || 'Standard Relief'}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--slate-50)', padding: 14, borderRadius: 6, border: '1px solid var(--slate-200)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                  Natukoy na Kategorya
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {result.damage_categories?.map((cat, idx) => (
                    <span key={idx} className="badge badge-agency" style={{ fontSize: 11 }}>
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ padding: '12px 14px', backgroundColor: 'var(--white)', border: '1px solid var(--slate-200)', borderRadius: 6, marginBottom: 14 }}>
              <strong style={{ fontSize: 13, display: 'block', marginBottom: 2 }}>Buod ng Pinsala:</strong>
              <p style={{ fontSize: 14, color: 'var(--slate-800)' }}>{result.damage_summary}</p>
            </div>

            {/* Safety reminders */}
            {result.safety_precautions && result.safety_precautions.length > 0 && (
              <div style={{ backgroundColor: 'var(--amber-50)', border: '1px solid #fde68a', padding: 14, borderRadius: 6, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--amber-700)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                  <Shield size={16} />
                  Paalalang Pangkaligtasan para sa Pamilya:
                </div>
                <ul style={{ paddingLeft: 18, fontSize: 13, color: '#92400e' }}>
                  {result.safety_precautions.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: 3 }}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft size={14} /> Baguhin ang Pagsusuri (Edit Assessment)
              </button>
            </div>
          </div>

          {/* Matched Subsidies Grid */}
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
              Mga Itinutugmang Ayuda ng Gobyerno ({result.matched_subsidies?.length || 0})
            </h3>
            <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 16 }}>
              Piliin ang subsidiya na nais mong i-apply upang mabuo ang opisyal na printable intake slip.
            </p>

            <div className="subsidy-grid">
              {result.matched_subsidies?.map((sub) => (
                <div
                  key={sub.id}
                  className={`subsidy-card ${sub.is_top_match ? 'top-match' : ''}`}
                >
                  <div>
                    {sub.is_top_match && (
                      <span className="top-match-tag">Inirerekomenda</span>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-agency">{sub.agency}</span>
                      <span style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                        Kalamidad: {sub.min_severity}+
                      </span>
                    </div>

                    <h4 style={{ fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 6 }}>
                      {sub.title}
                    </h4>

                    <p style={{ fontSize: 13, color: 'var(--slate-600)', marginBottom: 10 }}>
                      {sub.short_description}
                    </p>

                    <div className="subsidy-amount">
                      {sub.amount_display}
                    </div>

                    <div style={{ borderTop: '1px solid var(--slate-100)', paddingTop: 10, marginTop: 10 }}>
                      <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                        Kailangang Dokumento:
                      </strong>
                      <ul style={{ paddingLeft: 18, fontSize: 12, color: 'var(--slate-600)' }}>
                        {sub.requirements?.slice(0, 3).map((req, rIdx) => (
                          <li key={rIdx}>{req}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={() =>
                        onSelectSubsidyForApplication({
                          subsidy: sub,
                          assessment: result,
                          applicant: formData
                        })
                      }
                    >
                      Gamitin sa Aplikasyon (Apply Now)
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
