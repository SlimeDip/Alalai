import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  User,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ClipboardList,
  Check,
  Wind,
  Droplets,
  Flame,
  Mountain,
  Activity,
  Tornado,
  Waves,
  Sun,
  ImagePlus,
  X,
} from 'lucide-react';
import { runDamageAssessment } from '../utils/assessmentApi';
import { getAssessmentEligibilityModel } from '../utils/subsidyPresentation';

const DISASTERS = [
  { value: 'Typhoon', icon: Wind, title: 'Typhoon / Strong Winds', description: 'Violent winds, blown off roofs, fallen trees' },
  { value: 'Flash Flood', icon: Droplets, title: 'Flood / Flash Flood', description: 'Overflowing rivers, submerged houses, damaged crops' },
  { value: 'Earthquake', icon: Activity, title: 'Earthquake', description: 'Ground shaking, cracked walls, collapsed structures' },
  { value: 'Landslide', icon: Mountain, title: 'Landslide / Mudflow', description: 'Soil erosion, mud ingress, foundation damage' },
  { value: 'Fire', icon: Flame, title: 'Fire Incident', description: 'Residential fire or electrical fire damage' },
  { value: 'Volcanic Eruption', icon: Mountain, title: 'Volcanic Ashfall', description: 'Heavy ash on roof, air quality emergency' },
  { value: 'Tornado', icon: Tornado, title: 'Tornado', description: 'Extreme rotating winds and structural damage' },
  { value: 'Storm Surge', icon: Waves, title: 'Storm Surge', description: 'Coastal flooding caused by a severe storm' },
  { value: 'Drought', icon: Sun, title: 'Drought', description: 'Extended lack of rain affecting water and livelihoods' },
];

const MANUAL_CHECK_KEYS = [
  { id: 'roof', label: 'Roof and upper structure' },
  { id: 'walls', label: 'Walls, doors, and windows' },
  { id: 'flood', label: 'Flood or water damage' },
  { id: 'agri', label: 'Crops or agricultural equipment' },
  { id: 'store', label: 'Store, business, or livelihood tools' },
  { id: 'medical', label: 'Medical or essential household items' }
];

const COST_TIERS = [
  { value: 'under15', label: 'Under ₱15,000' },
  { value: '15to40', label: '₱15,000 to ₱40,000' },
  { value: '40to100', label: '₱40,000 to ₱100,000' },
  { value: 'over100', label: 'Over ₱100,000' }
];

const SCREENING_OUTCOME_LABELS = {
  eligible: 'Likely eligible',
  maybe: 'Potentially eligible',
  ineligible: 'Not likely eligible',
  unavailable: 'Information unavailable'
};

export default function DamageAssessmentForm({ user, csrfToken, onSelectSubsidyForApplication, onViewReliefOptions }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [inputMethod, setInputMethod] = useState(null);

  const [formData, setFormData] = useState({
    disasterType: '',
    incidentDate: new Date().toISOString().split('T')[0],
    applicantName: '',
    contactNumber: '',
    province: '',
    cityMunicipality: '',
    barangay: '',
    householdSize: 3,
    damageDescription: ''
  });

  const [manualChecks, setManualChecks] = useState({});
  const [costTier, setCostTier] = useState('15to40');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [damageImage, setDamageImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    if (user && !user.isGuest) {
      setFormData((prev) => ({
        ...prev,
        applicantName: user.name || prev.applicantName,
        contactNumber: user.mobile || prev.contactNumber,
        province: user.province || prev.province,
        cityMunicipality: user.cityMunicipality || prev.cityMunicipality,
        barangay: user.barangay || prev.barangay,
        householdSize: user.householdSize || prev.householdSize
      }));
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectDisaster = (value) => {
    setFormData((prev) => ({ ...prev, disasterType: value }));
    setErrorMsg('');
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg("Please choose a JPG, PNG, or WebP image.");
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg("The image must be 8 MB or smaller.");
      e.target.value = '';
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setDamageImage(file);
    setImagePreview(URL.createObjectURL(file));
    setErrorMsg('');
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setDamageImage(null);
    setImagePreview('');
  };

  const goStep = (step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStep1Next = () => {
    if (!formData.disasterType) {
      setErrorMsg("Please choose which calamity affected your home or livelihood.");
      return;
    }
    setErrorMsg('');
    setInputMethod(null);
    goStep(2);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();

    if (inputMethod === 'ai' && !formData.damageDescription.trim() && !damageImage) {
      setErrorMsg("Please provide a damage description, a photo, or both for analysis.");
      return;
    }

    if (inputMethod === 'manual' && !Object.values(manualChecks).some(Boolean)) {
      setErrorMsg("Check all damages that apply to your situation:");
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const manualDescription = MANUAL_CHECK_KEYS
        .filter((key) => manualChecks[key.id])
        .map((key) => key.label)
        .join('. ');
      const selectedCostTier = COST_TIERS.find((tier) => tier.value === costTier);
      const assessmentPayload = {
        disasterType: formData.disasterType,
        damageDescription: inputMethod === 'manual'
          ? `${manualDescription}. Estimated damage range selected by resident: ${selectedCostTier ? selectedCostTier.label : costTier}.`
          : formData.damageDescription,
        householdSize: formData.householdSize,
        manualChecks: Object.fromEntries(
          MANUAL_CHECK_KEYS.filter((k) => manualChecks[k.id]).map((k) => [k.label, true])
        ),
        costTier: inputMethod === 'manual' ? costTier : ''
      };
      const assessment = await runDamageAssessment({
        ...formData,
        ...assessmentPayload,
        incidentDate: formData.incidentDate,
        damageImage
      }, csrfToken);
      setResult(assessment);
      goStep(3);
    } catch (err) {
      console.error(err);
      if (err.code === 'NO_DAMAGE_DETECTED') {
        setErrorMsg("No visible damage was detected in the uploaded photo. Please describe the specific damage in the text box below so we can assess it accurately.");
      } else if (err.code === 'IRRELEVANT_IMAGE' || err.isRelevanceError) {
        setErrorMsg("The uploaded image does not appear to show disaster-related damage. Please upload a clear photo of the affected property or area.");
      } else if (err.code === 'AI_UNAVAILABLE') {
        setErrorMsg("The AI damage analysis service is temporarily unavailable. Please try again in a few moments, or use the Manual Checklist method instead.");
      } else if (err.code === 'MISSING_ANALYSIS_INPUT') {
        setErrorMsg("Please provide a damage description, a damage photo, or both before running the analysis.");
      } else {
        setErrorMsg("An unexpected error occurred while analyzing your submission. Please check your internet connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadgeClass = (level) => {
    switch (level?.toLowerCase()) {
      case 'catastrophic':
      case 'severe':
        return 'badge-severe';
      case 'moderate':
        return 'badge-moderate';
      default:
        return 'badge-low';
    }
  };

  const startAnotherAssessment = () => {
    setCurrentStep(1);
    setInputMethod(null);
    setManualChecks({});
    setResult(null);
    setErrorMsg('');
    clearImage();
    setFormData((prev) => ({ ...prev, disasterType: '', damageDescription: '' }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eligibility = getAssessmentEligibilityModel(result);

  return (
    <div>
      {/* DYNAMIC TRANSLATED POPUP MODAL */}
      {errorMsg && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setErrorMsg('')}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
              {"Assessment Notice"}
            </h3>
            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', marginBottom: '20px' }}>
              {errorMsg}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 16px', fontWeight: '600', borderRadius: '8px' }}
              onClick={() => setErrorMsg('')}
            >
              {"Got It"}
            </button>
          </div>
        </div>
      )}

      <div className="wizard-stepper no-print">
        <div className={`step-node ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">{currentStep > 1 ? <Check size={16} /> : '1'}</div>
          <span className="step-label">{"Disaster"}</span>
        </div>
        <div className="step-connector" />
        <div className={`step-node ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">{currentStep > 2 ? <Check size={16} /> : '2'}</div>
          <span className="step-label">{"Your Details"}</span>
        </div>
        <div className="step-connector" />
        <div className={`step-node ${currentStep === 3 ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <span className="step-label">{"Relief Options"}</span>
        </div>
      </div>

      {currentStep === 1 && (
        <div className="modern-card">
          <h2 className="card-heading-lg">{"Select the Disaster You Experienced"}</h2>
          <p className="card-subheading-lg">{"Please choose which calamity affected your home or livelihood."}</p>

          <div className="disaster-grid">
            {DISASTERS.map(({ value, icon: Icon, title, description }) => (
              <button
                key={value}
                type="button"
                className={`disaster-card ${formData.disasterType === value ? 'selected' : ''}`}
                onClick={() => selectDisaster(value)}
              >
                <Icon size={28} strokeWidth={1.75} aria-hidden />
                <strong>{title}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>

          <div className="form-group" style={{ maxWidth: 280, marginTop: 20 }}>
            <label className="form-label">
              <Calendar size={15} /> {"Incident Date"}
            </label>
            <input
              type="date"
              name="incidentDate"
              value={formData.incidentDate}
              onChange={handleChange}
              className="form-input form-input-lg"
            />
          </div>

          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={handleStep1Next}>
              {"Next"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="modern-card">
          <h2 className="card-heading-lg">{"How Would You Like to Detail the Damages?"}</h2>
          <p className="card-subheading-lg">{"Choose the method that is most comfortable for you."}</p>

          {!inputMethod && (
            <div className="method-grid">
              <button type="button" className="method-card" onClick={() => setInputMethod('ai')}>
                <Sparkles size={32} aria-hidden />
                <strong>{"AI Smart Assistant"}</strong>
                <p>{"Simply describe what happened in your own words. Our smart system will calculate the damage severity and estimated cost for you."}</p>
                <span className="method-action">{"Use Smart Assistant"}</span>
              </button>
              <button type="button" className="method-card" onClick={() => setInputMethod('manual')}>
                <ClipboardList size={32} aria-hidden />
                <strong>{"Manual Damage Checklist"}</strong>
                <p>{"Prefer not to type? Simply tick checkboxes for the items that were damaged in your home or farm."}</p>
                <span className="method-action">{"Use Checklist"}</span>
              </button>
            </div>
          )}

          {inputMethod && (
            <form onSubmit={handleAnalyze}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: 16 }}
                onClick={() => setInputMethod(null)}
              >
                <ArrowLeft size={14} /> {"Back"}
              </button>

              {inputMethod === 'ai' && (
                <>
                  <div className="form-group">
                    <label className="form-label">{"Describe what happened to your home or belongings"}</label>
                    <textarea
                      name="damageDescription"
                      value={formData.damageDescription}
                      onChange={handleChange}
                      rows={5}
                      className="form-textarea form-input-lg"
                      placeholder={"Example: Strong typhoon winds tore off 10 GI sheets from our roof. Rain water flooded the bedrooms and damaged our rice sacks and mattress..."}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><ImagePlus size={15} /> {"Add a damage photo (optional)"}</label>
                    <p className="field-help">{"Upload a clear photo of the affected property or livelihood. JPG, PNG, or WebP up to 8 MB. The photo must match the selected disaster; unrelated images are rejected."}</p>
                    {!damageImage ? (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="form-input"
                      />
                    ) : (
                      <div className="image-upload-preview">
                        <img src={imagePreview} alt={"Selected damage photo preview"} />
                        <button type="button" className="btn btn-secondary btn-sm" onClick={clearImage}>
                          <X size={14} /> {"Remove photo"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {inputMethod === 'manual' && (
                <>
                  <p className="form-label" style={{ marginBottom: 12 }}>{"Check all damages that apply to your situation:"}</p>
                  <div className="checklist-grid">
                    {MANUAL_CHECK_KEYS.map(({ id, label }) => (
                      <label key={id} className="checklist-item">
                        <input
                          type="checkbox"
                          checked={!!manualChecks[id]}
                          onChange={(e) =>
                            setManualChecks((prev) => ({ ...prev, [id]: e.target.checked }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="form-group" style={{ marginTop: 20 }}>
                    <label className="form-label">{"Estimated Total Damage in Pesos (₱):"}</label>
                    <select
                      className="form-select form-input-lg"
                      value={costTier}
                      onChange={(e) => setCostTier(e.target.value)}
                    >
                      {COST_TIERS.map((tier) => (
                        <option key={tier.value} value={tier.value}>
                          {tier.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <details className="optional-details">
                <summary>{"Applicant Full Name"} & {"Address (Purok, Barangay, City, Province)"} ({"optional"})</summary>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label"><User size={15} /> {"Applicant Full Name"}</label>
                    <input type="text" name="applicantName" value={formData.applicantName} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{"Contact Number"}</label>
                    <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><MapPin size={15} /> {"Address (Purok, Barangay, City, Province)"}</label>
                    <input type="text" name="barangay" placeholder="Barangay" value={formData.barangay} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <input type="text" name="cityMunicipality" placeholder={"City / Municipality"} value={formData.cityMunicipality} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <input type="text" name="province" placeholder="Province" value={formData.province} onChange={handleChange} className="form-input" />
                  </div>
                </div>
              </details>

              <div className="form-actions-row">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => goStep(1)}>
                  <ArrowLeft size={16} /> {"Back"}
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
                  {loading ? '…' : "Assess Damage & Find Aid"}
                  {!loading && <Sparkles size={18} />}
                </button>
              </div>
            </form>
          )}

          {!inputMethod && (
            <div style={{ marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => goStep(1)}>
                <ArrowLeft size={16} /> {"Back"}
              </button>
            </div>
          )}
        </div>
      )}

      {currentStep === 3 && result && (
        <div>
          <div className="modern-card results-card">
            <div className="results-header">
              <div>
                <span className="results-ref">REF: {result.id}</span>
                <h2 className="card-heading-lg">{"Damage Assessment Summary"}</h2>
              </div>
              <span className={`badge ${getSeverityBadgeClass(result.severity_level)}`}>
                {"Severity Level"}: {result.severity_level}
              </span>
            </div>

            <div className="results-metrics">
              <div className="metric-box">
                <span>{"Estimated Repair Cost"}</span>
                <strong>
                  ₱{result.estimated_cost_min?.toLocaleString()} – ₱{result.estimated_cost_max?.toLocaleString()}
                </strong>
              </div>
              <div className="metric-box">
                <span>{"Identified Damage Categories"}</span>
                <div className="chip-row">
                  {result.damage_categories?.map((cat, idx) => (
                    <span key={idx} className="badge badge-agency">{cat}</span>
                  ))}
                </div>
              </div>
            </div>

            <p className="results-summary">{result.damage_summary}</p>

            {result.safety_precautions?.length > 0 && (
              <ul className="safety-list">
                {result.safety_precautions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}

            <button type="button" className="btn btn-secondary btn-sm" onClick={() => goStep(2)}>
              <ArrowLeft size={14} /> {"Back"}
            </button>
            <div className="form-actions-row" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={onViewReliefOptions}>
                {"Browse all aid options"}
              </button>
              <button type="button" className="btn btn-primary" onClick={startAnotherAssessment}>
                {"Do another assessment"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <h3 className="card-heading-lg">{"Preliminary assistance screening"}</h3>
            <p className="card-subheading-lg">{"These program comparisons use the information in this assessment."}</p>
            <p role="note" className="subsidy-screening-disclaimer">
              {"This is preliminary screening, not an official eligibility determination. A program listed here does not guarantee approval. The screening may not account for every agency requirement. Verify current program details and requirements with the responsible agency."}
            </p>

            {eligibility.state === 'empty' ? (
              <p className="field-help">{"No program screening results are available for this assessment."}</p>
            ) : (
              <div className="subsidy-grid">
                {eligibility.programs.map((sub, index) => (
                  <article
                    key={sub.id || `${sub.title || 'program'}-${index}`}
                    className={`subsidy-card subsidy-screening-card subsidy-screening-card--${sub.outcomeClass}`}
                  >
                    <div>
                      <span className={`subsidy-outcome subsidy-outcome--${sub.outcomeClass}`}>
                        {SCREENING_OUTCOME_LABELS[sub.outcomeKey] || 'Status unavailable'}
                      </span>
                      <h4 style={{ fontSize: 17, fontWeight: 700, margin: '8px 0 6px' }}>
                        {sub.title || "Program title unavailable"}
                      </h4>
                      {sub.short_description && (
                        <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 10 }}>
                          {sub.short_description}
                        </p>
                      )}
                      <div className="subsidy-amount">
                        {Number(sub.amount_display) > 0
                          ? `₱${Number(sub.amount_display).toLocaleString()}`
                          : "Amount varies"}
                      </div>
                      <div className="subsidy-screening-details">
                        <div>
                          <strong>{"Why it appeared in screening"}</strong>
                          {sub.reasons.length
                            ? <ul>{sub.reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}</ul>
                            : <p>{"No details were returned for this section."}</p>}
                        </div>
                        <div>
                          <strong>{"Information to review or provide"}</strong>
                          {sub.missingInformation.length
                            ? <ul>{sub.missingInformation.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                            : <p>{"No details were returned for this section."}</p>}
                        </div>
                        <div>
                          <strong>{"Conditions and limitations"}</strong>
                          {sub.restrictions.length
                            ? <ul>{sub.restrictions.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                            : <p>{"No details were returned for this section."}</p>}
                        </div>
                      </div>
                    </div>
                    {sub.outcomeKey !== 'noCurrentMatch' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: 16 }}
                        onClick={() =>
                          onSelectSubsidyForApplication({
                            subsidy: sub,
                            assessment: result,
                            applicant: formData,
                            returnTab: 'assessment'
                          })
                        }
                      >
                        {"Choose This Program"}
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}