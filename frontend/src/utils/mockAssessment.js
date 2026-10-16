/**
 * Client-side damage assessment with Strict AI Guardrail validation.
 * Rejects non-disaster pictures and unrelated text inputs.
 */
const UNRELATED_KEYWORDS = [
  'selfie',
  'portrait',
  'pusa',
  'aso',
  'cat',
  'dog',
  'car',
  'kotse',
  'pagkain',
  'food',
  'landscape',
  'sunset'
];

const DISASTER_KEYWORDS = [
  'damage',
  'damaged',
  'disaster',
  'calamity',
  'typhoon',
  'bagyo',
  'flood',
  'baha',
  'earthquake',
  'lindol',
  'landslide',
  'pagguho',
  'fire',
  'sunog',
  'volcanic',
  'bulkan',
  'tornado',
  'storm surge',
  'drought',
  'tagtuyot',
  'cold',
  'roof',
  'bubong',
  'wall',
  'pader',
  'house',
  'bahay',
  'property',
  'ari-arian',
  'submerged',
  'nalubog',
  'washed away',
  'gumuho',
  'nasira'
];

function hasKeyword(str, kw) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(str);
}

function analyzeText({ disasterType, damageDescription, householdSize = 3 }) {
  const text = (damageDescription || '').toLowerCase();

  const severeKeywords = ['total', 'gumuho', 'collapsed', 'washed away', 'natanggal', 'destroyed', 'wasak', 'tornado'];
  const moderateKeywords = ['crack', 'bitak', 'leak', 'tumagas', 'partial', 'bahagyang', 'damage', 'nasira'];
  const totalKeywords = ['uninhabitable', 'hindi na matirhan', 'total loss', 'lubog', 'completely submerged', 'totally submerged', 'washed out'];
  const agriKeywords = ['palay', 'rice', 'crop', 'farm', 'pananim', 'sakahan', 'fish', 'isda', 'livestock', 'manok'];
  const livelihoodKeywords = ['tindahan', 'sari-sari', 'paninda', 'store', 'livelihood', 'kabuhayan'];
  const structuralKeywords = ['bubong', 'yero', 'roof', 'pader', 'wall', 'kisame', 'ceiling'];
  const waterKeywords = ['baha', 'flood', 'tubig', 'submerged', 'nalubog'];

  let severityScore = 30;
  let severityLevel = 'Moderate';
  let urgency = 'Standard Relief';

  if (totalKeywords.some((kw) => hasKeyword(text, kw))) {
    severityScore = 90;
    severityLevel = 'Catastrophic';
    urgency = 'Immediate — shelter & food priority';
  } else if (severeKeywords.some((kw) => hasKeyword(text, kw))) {
    severityScore = 75;
    severityLevel = 'Severe';
    urgency = 'High — repairs needed soon';
  } else if (moderateKeywords.some((kw) => hasKeyword(text, kw))) {
    severityScore = 45;
    severityLevel = 'Moderate';
  } else {
    severityScore = 25;
    severityLevel = 'Low';
  }

  const categories = [];
  const recommendedAid = ['general', 'food'];

  if (structuralKeywords.some((kw) => hasKeyword(text, kw)) || severityScore >= 50) {
    categories.push('Structural & Roofing');
    recommendedAid.push('structural');
  }
  if (waterKeywords.some((kw) => hasKeyword(text, kw)) || disasterType.toLowerCase().includes('flood')) {
    categories.push('Water & Flooding');
  }
  if (agriKeywords.some((kw) => hasKeyword(text, kw))) {
    categories.push('Agriculture & Fisheries');
    recommendedAid.push('agricultural');
  }
  if (livelihoodKeywords.some((kw) => hasKeyword(text, kw))) {
    categories.push('Small Business & Livelihood');
    recommendedAid.push('livelihood');
  }
  if (categories.length === 0) {
    categories.push('General Home Damage');
  }

  let costMin = 5000;
  let costMax = 15000;
  if (severityLevel === 'Catastrophic') {
    costMin = 80000;
    costMax = 250000;
  } else if (severityLevel === 'Severe') {
    costMin = 25000;
    costMax = 75000;
  } else if (severityLevel === 'Moderate') {
    costMin = 10000;
    costMax = 28000;
  }
  if (householdSize > 4) {
    costMax = Math.round(costMax * 1.15);
  }

  const summary =
    damageDescription && damageDescription.trim().length > 10
      ? damageDescription.trim().slice(0, 280) + (damageDescription.length > 280 ? '…' : '')
      : `Pagsusuri sa ginawang ulat para sa kalamidad na ${disasterType}. Naitala ang pinsala sa ${categories.join(', ')}.`;

  return {
    engine: 'Local Smart Guide (with AI Guardrail Validation)',
    severity_level: severityLevel,
    severity_score: severityScore,
    damage_summary: summary,
    damage_categories: categories,
    estimated_cost_min: costMin,
    estimated_cost_max: costMax,
    urgency,
    recommended_aid_types: [...new Set(recommendedAid)],
    safety_precautions: [
      'Umiwas sa mga sirang pader, bubong, at nakalawit na kable ng kuryente.',
      'Pakuluan ang tubig-inumin bago inumin.',
      'Kumuha ng malinaw na larawan ng pinsala bago magsimulang maglinis.'
    ]
  };
}

export async function runLocalDamageAssessment(formPayload) {
  const {
    disasterType,
    damageDescription,
    householdSize = 3,
    manualChecks = {},
    costTier = ''
  } = formPayload;

  let narrative = (damageDescription || '').trim();

  // Guardrail check for narrative text
  if (narrative.length > 0) {
    const lowerText = narrative.toLowerCase();
    const containsUnrelated = UNRELATED_KEYWORDS.some((kw) => lowerText.includes(kw));
    const containsDisaster = DISASTER_KEYWORDS.some((kw) => lowerText.includes(kw));

    if (containsUnrelated || (!containsDisaster && narrative.length > 3 && Object.keys(manualChecks).length === 0)) {
      const error = new Error('Hindi napatunayang may kaugnayan sa sakuna ang ibinigay na pahayag. Magbigay ng malinaw na detalye ng pinsala.');
      error.code = 'IRRELEVANT_IMAGE';
      error.isRelevanceError = true;
      throw error;
    }
  }

  if (!narrative && Object.keys(manualChecks).length > 0) {
    const parts = Object.entries(manualChecks)
      .filter(([, v]) => v)
      .map(([k]) => k);
    narrative = `Manual checklist: ${parts.join('; ')}. ${costTier}`;
  }

  const core = analyzeText({
    disasterType,
    damageDescription: narrative,
    householdSize: Number(householdSize) || 3
  });

  if (costTier) {
    switch (costTier) {
      case 'over100':
        core.severity_level = 'Catastrophic';
        core.severity_score = Math.max(core.severity_score, 85);
        core.estimated_cost_min = 80000;
        core.estimated_cost_max = 250000;
        break;
      case '40to100':
        core.severity_level = 'Severe';
        core.severity_score = Math.max(core.severity_score, 70);
        core.estimated_cost_min = 40000;
        core.estimated_cost_max = 100000;
        break;
      case '15to40':
        core.severity_level = 'Moderate';
        core.severity_score = Math.max(core.severity_score, 45);
        core.estimated_cost_min = 15000;
        core.estimated_cost_max = 40000;
        break;
      case 'under15':
      default:
        core.severity_level = 'Low';
        core.severity_score = Math.min(core.severity_score, 35);
        core.estimated_cost_min = 5000;
        core.estimated_cost_max = 15000;
        break;
    }
  }

  const id = 'LOCAL-' + Date.now().toString(36).toUpperCase();
  return {
    id,
    ...core,
    matched_subsidies: []
  };
}

export async function runImageDamageAssessment(formPayload) {
  const imageFile = formPayload.damageImage;
  const description = (formPayload.damageDescription || '').trim().toLowerCase();
  const fileName = (imageFile?.name || '').toLowerCase();

  const containsUnrelatedText = UNRELATED_KEYWORDS.some((kw) => description.includes(kw));
  const containsUnrelatedFile = UNRELATED_KEYWORDS.some((kw) => fileName.includes(kw));

  const hasDisasterText = DISASTER_KEYWORDS.some((kw) => description.includes(kw));

  // STRICT GUARDRAIL RULES FOR IMAGE & TEXT INPUTS:
  
  // Rule A: Contains explicit non-disaster terms (selfie, pusa, car, etc.)
  if (containsUnrelatedText || containsUnrelatedFile) {
    const error = new Error('Hindi napatunayang may kaugnayan sa sakuna ang ibinigay na larawan o detalye. Mag-upload ng malinaw na larawan ng pinsala mula sa kalamidad.');
    error.code = 'IRRELEVANT_IMAGE';
    error.isRelevanceError = true;
    throw error;
  }

  // Rule B: Text was provided but lacks any disaster-related context
  if (description.length > 0 && !hasDisasterText) {
    const error = new Error('Hindi napatunayang may kaugnayan sa sakuna ang ibinigay na paglalarawan. Paki-paliwanag ang pinsala sa inyong tahanan o ari-arian.');
    error.code = 'IRRELEVANT_IMAGE';
    error.isRelevanceError = true;
    throw error;
  }

  // Try Backend Gemini Vision API if online
  let responseError = '';
  try {
    const body = new FormData();
    Object.entries(formPayload).forEach(([key, value]) => {
      if (key !== 'damageImage' && value !== undefined && value !== null) {
        body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    });
    if (imageFile) {
      body.append('damageImage', imageFile);
    }

    const response = await fetch('/api/assessments', {
      method: 'POST',
      body
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok && payload.success) {
      if (payload.data?.engine?.startsWith('Heuristic')) {
        const error = new Error('The AI service is unavailable, so this result was not presented as an AI analysis.');
        error.code = 'AI_UNAVAILABLE';
        throw error;
      }
      return payload.data;
    }

    console.warn('Image assessment request failed:', response.status, payload.error || 'Unknown API error');
    responseError = payload.error || '';

    if (payload.code === 'IRRELEVANT_IMAGE' || payload.code === 'NO_DAMAGE_DETECTED' || payload.is_disaster_related === false) {
      const error = new Error(payload.error || payload.relevance_error || 'Hindi kaugnay sa sakuna ang litrato.');
      error.code = 'IRRELEVANT_IMAGE';
      if (payload.code === 'NO_DAMAGE_DETECTED') error.code = 'NO_DAMAGE_DETECTED';
      error.isRelevanceError = true;
      throw error;
    }
  } catch (err) {
    if (err.code === 'IRRELEVANT_IMAGE' || err.isRelevanceError) {
      throw err;
    }
    const error = new Error(responseError || 'The AI analysis service is unavailable. Please try again.');
    error.code = 'AI_UNAVAILABLE';
    throw error;
  }
}