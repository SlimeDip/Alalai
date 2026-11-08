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

const DISASTERS = [
  { value: 'Typhoon', icon: Wind, titleKey: 'disasterTyphoon', descKey: 'disasterTyphoonDesc' },
  { value: 'Flash Flood', icon: Droplets, titleKey: 'disasterFlood', descKey: 'disasterFloodDesc' },
  { value: 'Earthquake', icon: Activity, titleKey: 'disasterEarthquake', descKey: 'disasterEarthquakeDesc' },
  { value: 'Landslide', icon: Mountain, titleKey: 'disasterLandslide', descKey: 'disasterLandslideDesc' },
  { value: 'Fire', icon: Flame, titleKey: 'disasterFire', descKey: 'disasterFireDesc' },
  { value: 'Volcanic Eruption', icon: Mountain, titleKey: 'disasterVolcano', descKey: 'disasterVolcanoDesc' },
  { value: 'Tornado', icon: Tornado, titleKey: 'disasterTornado', descKey: 'disasterTornadoDesc' },
  { value: 'Storm Surge', icon: Waves, titleKey: 'disasterStormSurge', descKey: 'disasterStormSurgeDesc' },
  { value: 'Drought', icon: Sun, titleKey: 'disasterDrought', descKey: 'disasterDroughtDesc' },
];

const MANUAL_CHECK_KEYS = [
  { id: 'roof', labelKey: 'damageRoof' },
  { id: 'walls', labelKey: 'damageWalls' },
  { id: 'flood', labelKey: 'damageFlood' },
  { id: 'agri', labelKey: 'damageAgri' },
  { id: 'store', labelKey: 'damageStore' },
  { id: 'medical', labelKey: 'damageMedical' }
];

const COST_TIERS = [
  { value: 'under15', labelKey: 'estUnder15k' },
  { value: '15to40', labelKey: 'est15kTo40k' },
  { value: '40to100', labelKey: 'est40kTo100k' },
  { value: 'over100', labelKey: 'estOver100k' }
];

export default function DamageAssessmentForm({ user, t, lang = 'en', onSelectSubsidyForApplication, onViewReliefOptions }) {
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
      setErrorMsg(t('imageTypeError'));
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg(t('imageSizeError'));
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
      setErrorMsg(t('step1Subtitle'));
      return;
    }
    setErrorMsg('');
    setInputMethod(null);
    goStep(2);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();

    if (inputMethod === 'ai' && !formData.damageDescription.trim() && !damageImage) {
      setErrorMsg(t('provideAnalysisInput'));
      return;
    }

    if (inputMethod === 'manual' && !Object.values(manualChecks).some(Boolean)) {
      setErrorMsg(t('manualChecklistTitle'));
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const manualDescription = MANUAL_CHECK_KEYS
        .filter((key) => manualChecks[key.id])
        .map((key) => t(key.labelKey))
        .join('. ');
      const selectedCostTier = COST_TIERS.find((tier) => tier.value === costTier);
      const assessmentPayload = {
        disasterType: formData.disasterType,
        damageDescription: inputMethod === 'manual'
          ? `${manualDescription}. Estimated damage range selected by resident: ${selectedCostTier ? t(selectedCostTier.labelKey) : costTier}.`
          : formData.damageDescription,
        householdSize: formData.householdSize,
        manualChecks: Object.fromEntries(
          MANUAL_CHECK_KEYS.filter((k) => manualChecks[k.id]).map((k) => [t(k.labelKey), true])
        ),
        costTier: inputMethod === 'manual' ? costTier : ''
      };
      const assessment = await runDamageAssessment({
        ...formData,
        ...assessmentPayload,
        incidentDate: formData.incidentDate,
        damageImage
      });
      setResult(assessment);
      goStep(3);
    } catch (err) {
      console.error(err);
      if (err.code === 'NO_DAMAGE_DETECTED') {
        setErrorMsg(t('noDamageDetectedError'));
      } else if (err.code === 'IRRELEVANT_IMAGE' || err.isRelevanceError) {
        setErrorMsg(t('imageRelevanceError'));
      } else if (err.code === 'AI_UNAVAILABLE') {
        setErrorMsg(t('aiUnavailableError'));
      } else if (err.code === 'MISSING_ANALYSIS_INPUT') {
        setErrorMsg(t('missingAnalysisInputError'));
      } else {
        setErrorMsg(t('analysisError'));
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
              {t('assessmentAlert')}
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
              {t('gotIt')}
            </button>
          </div>
        </div>
      )}

      <div className="wizard-stepper no-print">
        <div className={`step-node ${currentStep === 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">{currentStep > 1 ? <Check size={16} /> : '1'}</div>
          <span className="step-label">{t('stepDisaster')}</span>
        </div>
        <div className="step-connector" />
        <div className={`step-node ${currentStep === 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">{currentStep > 2 ? <Check size={16} /> : '2'}</div>
          <span className="step-label">{t('stepDetails')}</span>
        </div>
        <div className="step-connector" />
        <div className={`step-node ${currentStep === 3 ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <span className="step-label">{t('stepResults')}</span>
        </div>
      </div>

      {currentStep === 1 && (
        <div className="modern-card">
          <h2 className="card-heading-lg">{t('step1Title')}</h2>
          <p className="card-subheading-lg">{t('step1Subtitle')}</p>

          <div className="disaster-grid">
            {DISASTERS.map(({ value, icon: Icon, titleKey, descKey }) => (
              <button
                key={value}
                type="button"
                className={`disaster-card ${formData.disasterType === value ? 'selected' : ''}`}
                onClick={() => selectDisaster(value)}
              >
                <Icon size={28} strokeWidth={1.75} aria-hidden />
                <strong>{t(titleKey)}</strong>
                <span>{t(descKey)}</span>
              </button>
            ))}
          </div>

          <div className="form-group" style={{ maxWidth: 280, marginTop: 20 }}>
            <label className="form-label">
              <Calendar size={15} /> {t('disasterDate')}
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
              {t('nextBtn')}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="modern-card">
          <h2 className="card-heading-lg">{t('step2Title')}</h2>
          <p className="card-subheading-lg">{t('step2Subtitle')}</p>

          {!inputMethod && (
            <div className="method-grid">
              <button type="button" className="method-card" onClick={() => setInputMethod('ai')}>
                <Sparkles size={32} aria-hidden />
                <strong>{t('methodAiTitle')}</strong>
                <p>{t('methodAiDesc')}</p>
                <span className="method-action">{t('methodAiAction')}</span>
              </button>
              <button type="button" className="method-card" onClick={() => setInputMethod('manual')}>
                <ClipboardList size={32} aria-hidden />
                <strong>{t('methodManualTitle')}</strong>
                <p>{t('methodManualDesc')}</p>
                <span className="method-action">{t('methodManualAction')}</span>
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
                <ArrowLeft size={14} /> {t('backBtn')}
              </button>

              {inputMethod === 'ai' && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('aiInputLabel')}</label>
                    <textarea
                      name="damageDescription"
                      value={formData.damageDescription}
                      onChange={handleChange}
                      rows={5}
                      className="form-textarea form-input-lg"
                      placeholder={t('aiInputPlaceholder')}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><ImagePlus size={15} /> {t('damageImageLabel')}</label>
                    <p className="field-help">{t('damageImageHelp')}</p>
                    {!damageImage ? (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="form-input"
                      />
                    ) : (
                      <div className="image-upload-preview">
                        <img src={imagePreview} alt={t('damageImagePreviewAlt')} />
                        <button type="button" className="btn btn-secondary btn-sm" onClick={clearImage}>
                          <X size={14} /> {t('removeImage')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {inputMethod === 'manual' && (
                <>
                  <p className="form-label" style={{ marginBottom: 12 }}>{t('manualChecklistTitle')}</p>
                  <div className="checklist-grid">
                    {MANUAL_CHECK_KEYS.map(({ id, labelKey }) => (
                      <label key={id} className="checklist-item">
                        <input
                          type="checkbox"
                          checked={!!manualChecks[id]}
                          onChange={(e) =>
                            setManualChecks((prev) => ({ ...prev, [id]: e.target.checked }))
                          }
                        />
                        <span>{t(labelKey)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="form-group" style={{ marginTop: 20 }}>
                    <label className="form-label">{t('estDamageLabel')}</label>
                    <select
                      className="form-select form-input-lg"
                      value={costTier}
                      onChange={(e) => setCostTier(e.target.value)}
                    >
                      {COST_TIERS.map((tier) => (
                        <option key={tier.value} value={tier.value}>
                          {t(tier.labelKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <details className="optional-details">
                <summary>{t('fullName')} & {t('address')} ({t('optional')})</summary>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label"><User size={15} /> {t('fullName')}</label>
                    <input type="text" name="applicantName" value={formData.applicantName} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('phone')}</label>
                    <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><MapPin size={15} /> {t('address')}</label>
                    <input type="text" name="barangay" placeholder="Barangay" value={formData.barangay} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <input type="text" name="cityMunicipality" placeholder={t('cityPlaceholder')} value={formData.cityMunicipality} onChange={handleChange} className="form-input" />
                  </div>
                  <div className="form-group">
                    <input type="text" name="province" placeholder="Province" value={formData.province} onChange={handleChange} className="form-input" />
                  </div>
                </div>
              </details>

              <div className="form-actions-row">
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => goStep(1)}>
                  <ArrowLeft size={16} /> {t('backBtn')}
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary btn-lg">
                  {loading ? '…' : t('analyzeButton')}
                  {!loading && <Sparkles size={18} />}
                </button>
              </div>
            </form>
          )}

          {!inputMethod && (
            <div style={{ marginTop: 24 }}>
              <button type="button" className="btn btn-secondary" onClick={() => goStep(1)}>
                <ArrowLeft size={16} /> {t('backBtn')}
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
                <h2 className="card-heading-lg">{t('resultsTitle')}</h2>
              </div>
              <span className={`badge ${getSeverityBadgeClass(result.severity_level)}`}>
                {t('severityLabel')}: {result.severity_level}
              </span>
            </div>

            <div className="results-metrics">
              <div className="metric-box">
                <span>{t('estCostLabel')}</span>
                <strong>
                  ₱{result.estimated_cost_min?.toLocaleString()} – ₱{result.estimated_cost_max?.toLocaleString()}
                </strong>
              </div>
              <div className="metric-box">
                <span>{t('categoriesLabel')}</span>
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
              <ArrowLeft size={14} /> {t('backBtn')}
            </button>
            <div className="form-actions-row" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={onViewReliefOptions}>
                {t('viewReliefOptions')}
              </button>
              <button type="button" className="btn btn-primary" onClick={startAnotherAssessment}>
                {t('anotherAssessment')}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <h3 className="card-heading-lg">{t('subsidiesTitle')}</h3>
            <p className="card-subheading-lg">{t('subsidiesSubtitle')}</p>

            <div className="subsidy-grid">
              {(result.matched_subsidies || []).slice(0, 8).map((sub) => (
                <div key={sub.id} className={`subsidy-card ${sub.is_top_match ? 'top-match' : ''}`}>
                  <div>
                    {sub.is_top_match && <span className="top-match-tag">{t('recommended')}</span>}
                    <h4 style={{ fontSize: 17, fontWeight: 700, margin: '8px 0 6px' }}>{sub.title}</h4>
                    <p style={{ fontSize: 14, color: 'var(--slate-600)', marginBottom: 10 }}>{sub.short_description}</p>
                    <div className="subsidy-amount">
                      {Number(sub.amount_display) > 0 ? `₱${Number(sub.amount_display).toLocaleString()}` : t('amountVaries')}
                    </div>
                  </div>
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
                    {t('applySubsidyBtn')}
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}