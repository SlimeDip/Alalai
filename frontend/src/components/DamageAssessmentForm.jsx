import React, { useState, useEffect, useRef } from 'react';
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
  CloudFog,
  ImagePlus,
  X,
} from 'lucide-react';
import { runDamageAssessment } from '../utils/assessmentApi';
import { getAssessmentEligibilityModel } from '../utils/subsidyPresentation';
import LocationFields from './LocationFields';

const DISASTERS = [
  { value: 'Typhoon', icon: Wind, title: 'Typhoon / Strong Winds', description: 'Violent winds, blown off roofs, fallen trees' },
  { value: 'Flash Flood', icon: Droplets, title: 'Flood / Flash Flood', description: 'Overflowing rivers, submerged houses, damaged crops' },
  { value: 'Earthquake', icon: Activity, title: 'Earthquake', description: 'Ground shaking, cracked walls, collapsed structures' },
  { value: 'Landslide', icon: Mountain, title: 'Landslide / Mudflow', description: 'Soil erosion, mud ingress, foundation damage' },
  { value: 'Fire', icon: Flame, title: 'Fire Incident', description: 'Residential fire or electrical fire damage' },
  { value: 'Volcanic Eruption', icon: CloudFog, title: 'Volcanic Ashfall', description: 'Heavy ash on roof, air quality emergency' },
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
  potentialMatch: 'Potential match',
  needsMoreInformation: 'Needs more info',
  outcomeUnavailable: 'Not screened'
};

function ProgramDetailsDialog({ program, onClose, onChoose }) {
  const closeRef = useRef(null);
  const sections = [
    ['Why it appeared in screening', program.reasons],
    ['Information to review or provide', program.missingInformation],
    ['Conditions and limitations', program.restrictions]
  ].filter(([, items]) => items.length > 0);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="case-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="program-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-dialog-title"
      >
        <div className="program-dialog-head">
          <div className="program-dialog-heading">
            <span className={`subsidy-outcome subsidy-outcome--${program.outcomeClass}`}>
              {SCREENING_OUTCOME_LABELS[program.outcomeKey] || 'Status unavailable'}
            </span>
            <h2 id="program-dialog-title">{program.title || 'Program title unavailable'}</h2>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="program-dialog-body">
          {sections.length === 0 && <p className="field-help">No details were returned for this program.</p>}
          {sections.map(([label, items]) => (
            <div key={label} className="program-dialog-section">
              <h3>{label}</h3>
              <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          ))}
        </div>

        <div className="program-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{"Close"}</button>
          {program.outcomeKey !== 'noCurrentMatch' && (
            <button type="button" className="btn btn-primary" onClick={onChoose}>
              {"Choose This Program"} <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DamageAssessmentForm({ user, csrfToken, onSelectSubsidyForApplication, onViewReliefOptions }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [detailsProgram, setDetailsProgram] = useState(null);
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
        <div className="modal-overlay" onClick={() => setErrorMsg('')}>
          <div className="modal-card notice-modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="notice-modal-icon">
              <AlertTriangle size={28} />
            </div>
            <h3>{"Assessment Notice"}</h3>
            <p>{errorMsg}</p>
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setErrorMsg('')}>
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

          <div className="disaster-grid" role="group" aria-label="Type of disaster">
            {DISASTERS.map(({ value, icon: Icon, title, description }) => {
              const selected = formData.disasterType === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`disaster-card ${selected ? 'selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => selectDisaster(value)}
                >
                  <span className="disaster-card-icon" aria-hidden>
                    <Icon size={22} strokeWidth={1.9} />
                  </span>
                  <span className="disaster-card-text">
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                  <span className="disaster-card-check" aria-hidden>
                    {selected && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="disaster-selected-note" role="status" aria-live="polite">
            {formData.disasterType
              ? <>Selected: <strong>{DISASTERS.find((item) => item.value === formData.disasterType)?.title}</strong></>
              : 'No disaster selected yet.'}
          </p>

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

      {currentStep === 2 && loading && (
        <div className="analyzing" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{"Analyzing your damage report. Please wait."}</span>
          <div className="modern-card results-card">
            <div className="sk-row sk-between">
              <div className="sk-col">
                <div className="sk sk-line sk-w-20" />
                <div className="sk sk-title sk-w-60" />
              </div>
              <div className="sk sk-pill" />
            </div>
            <div className="sk-grid-2">
              <div className="sk sk-box" />
              <div className="sk sk-box" />
            </div>
            <div className="sk sk-line sk-w-100" />
            <div className="sk sk-line sk-w-80" />
            <div className="sk sk-callout" />
          </div>
          <p className="analyzing-label">{"Analyzing your damage and matching aid programs…"}</p>
          <div className="sk-cards">
            {[0, 1, 2].map((i) => (
              <div className="modern-card sk-card" key={i}>
                <div className="sk-row sk-between">
                  <div className="sk sk-chip" />
                  <div className="sk sk-line sk-w-20" />
                </div>
                <div className="sk sk-title sk-w-80" />
                <div className="sk sk-line sk-w-100" />
                <div className="sk sk-line sk-w-60" />
                <div className="sk sk-btn" />
              </div>
            ))}
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="modern-card" style={loading ? { display: 'none' } : undefined}>
          <h2 className="card-heading-lg">{"How Would You Like to Detail the Damages?"}</h2>
          
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
                    <label className="form-label">{"Add a damage photo (optional)"}</label>
                    <p className="field-help">{"JPG, PNG or WebP, up to 8 MB. The photo must match the selected disaster."}</p>
                    {!damageImage ? (
                      <label className="upload-drop">
                        <ImagePlus size={24} aria-hidden />
                        <span><strong>{"Choose a photo"}</strong> {"from your device"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleImageChange}
                          className="upload-drop-input"
                        />
                      </label>
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
                </div>
                <div style={{ marginTop: 8 }}>
                  <LocationFields
                    values={{
                      province: formData.province,
                      cityMunicipality: formData.cityMunicipality,
                      barangay: formData.barangay,
                    }}
                    onChangeField={(field, value) =>
                      setFormData((prev) => ({ ...prev, [field]: value }))
                    }
                    includeStreet={false}
                    required={false}
                  />
                </div>
              </details>

              <div className="form-actions-row">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => setInputMethod(null)}>
                  <ArrowLeft size={16} /> {"Change method"}
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
          <div className="modern-card results-card report">
            <header className="report-head">
              <div>
                <p className="report-kicker">{"Damage assessment"}</p>
                <h2 title={`Ref: ${result.id}`}>{"Assessment Summary"}</h2>
              </div>
              <span className={`badge ${getSeverityBadgeClass(result.severity_level)}`}>
                {"Severity Level"}: {result.severity_level}
              </span>
            </header>

            <dl className="report-figures">
              <div className="report-figure report-figure--main">
                <dt>{"Estimated repair cost"}</dt>
                <dd>
                  ₱{result.estimated_cost_min?.toLocaleString()}
                  <span> – </span>
                  ₱{result.estimated_cost_max?.toLocaleString()}
                </dd>
              </div>
              <div className="report-figure">
                <dt>{"Damage categories"}</dt>
                <dd className="report-tags">
                  {result.damage_categories?.length
                    ? result.damage_categories.map((cat, idx) => <span key={idx}>{cat}</span>)
                    : <em>{"None identified"}</em>}
                </dd>
              </div>
            </dl>

            <section className="report-section">
              <h3>{"Summary"}</h3>
              <p>{result.damage_summary}</p>
            </section>

            {result.safety_precautions?.length > 0 && (
              <section className="report-section">
                <details className="report-safety">
                  <summary>
                    <h3>{"Safety precautions"}</h3>
                    <span>{result.safety_precautions.length}</span>
                  </summary>
                  <ul>
                    {result.safety_precautions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </details>
              </section>
            )}

            <footer className="report-foot">
              <button type="button" className="btn btn-secondary" onClick={() => goStep(2)}>
                <ArrowLeft size={14} /> {"Back"}
              </button>
              <div className="report-foot-right">
                <button type="button" className="btn btn-secondary" onClick={onViewReliefOptions}>
                  {"Browse all aid options"}
                </button>
                <button type="button" className="btn btn-primary" onClick={startAnotherAssessment}>
                  {"New assessment"}
                </button>
              </div>
            </footer>
          </div>

          <div style={{ marginTop: 28 }}>
            <h3 className="card-heading-lg" style={{ marginBottom: 8 }}>{"Aid programs you may qualify for"}</h3>
            <p role="note" className="subsidy-screening-disclaimer">
              {"Preliminary screening only. Not an official decision. Confirm requirements with the agency."}
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
                    <div className="program-card-body">
                      <div className="program-card-top">
                        <span className={`subsidy-outcome subsidy-outcome--${sub.outcomeClass}`}>
                          {SCREENING_OUTCOME_LABELS[sub.outcomeKey] || 'Status unavailable'}
                        </span>
                        <span className="program-card-amount">
                          {Number(sub.amount_display) > 0
                            ? `₱${Number(sub.amount_display).toLocaleString()}`
                            : "Amount varies"}
                        </span>
                      </div>
                      <h4 className="program-card-title">
                        {sub.title || "Program title unavailable"}
                      </h4>
                      {sub.short_description && (
                        <p className="program-card-desc">{sub.short_description}</p>
                      )}
                      <button
                        type="button"
                        className="program-card-more-btn"
                        aria-haspopup="dialog"
                        onClick={() => setDetailsProgram(sub)}
                      >
                        {"See why it matched and what to prepare"}
                      </button>
                    </div>
                    {sub.outcomeKey !== 'noCurrentMatch' && (
                      <button
                        type="button"
                        className="btn btn-primary program-card-cta"
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
      {detailsProgram && (
        <ProgramDetailsDialog
          program={detailsProgram}
          onClose={() => setDetailsProgram(null)}
          onChoose={() => {
            const program = detailsProgram;
            setDetailsProgram(null);
            onSelectSubsidyForApplication({
              subsidy: program,
              assessment: result,
              applicant: formData,
              returnTab: 'assessment'
            });
          }}
        />
      )}
    </div>
  );
}
