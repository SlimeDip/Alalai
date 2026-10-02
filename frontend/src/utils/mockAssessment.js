/**
 * Client-side damage assessment (no external AI API).
 * Uses simple keyword heuristics and matches against subsidy catalog from the API.
 */

function analyzeText({ disasterType, damageDescription, householdSize = 3 }) {
  const text = (damageDescription || '').toLowerCase();
  const severeKeywords = ['total', 'gumuho', 'collapsed', 'washed away', 'natanggal', 'destroyed', 'wasak', 'tornado'];
  const moderateKeywords = ['crack', 'bitak', 'leak', 'tumagas', 'partial', 'bahagyang', 'damage', 'nasira'];
  const totalKeywords = ['uninhabitable', 'hindi na matirhan', 'total loss', 'lubog', 'submerged', 'washed out'];
  const agriKeywords = ['palay', 'rice', 'crop', 'farm', 'pananim', 'sakahan', 'fish', 'isda', 'livestock', 'manok'];
  const livelihoodKeywords = ['tindahan', 'sari-sari', 'paninda', 'store', 'livelihood', 'kabuhayan'];
  const structuralKeywords = ['bubong', 'yero', 'roof', 'pader', 'wall', 'kisame', 'ceiling'];
  const waterKeywords = ['baha', 'flood', 'tubig', 'submerged', 'nalubog'];

  let severityScore = 30;
  let severityLevel = 'Moderate';
  let urgency = 'Standard Relief';

  if (totalKeywords.some((kw) => text.includes(kw))) {
    severityScore = 90;
    severityLevel = 'Catastrophic';
    urgency = 'Immediate — shelter & food priority';
  } else if (severeKeywords.some((kw) => text.includes(kw))) {
    severityScore = 75;
    severityLevel = 'Severe';
    urgency = 'High — repairs needed soon';
  } else if (moderateKeywords.some((kw) => text.includes(kw))) {
    severityScore = 45;
    severityLevel = 'Moderate';
  } else {
    severityScore = 25;
    severityLevel = 'Low';
  }

  const categories = [];
  const recommendedAid = ['general', 'food'];

  if (structuralKeywords.some((kw) => text.includes(kw)) || severityScore >= 50) {
    categories.push('Structural & Roofing');
    recommendedAid.push('structural');
  }
  if (waterKeywords.some((kw) => text.includes(kw)) || disasterType.toLowerCase().includes('flood')) {
    categories.push('Water & Flooding');
  }
  if (agriKeywords.some((kw) => text.includes(kw))) {
    categories.push('Agriculture & Fisheries');
    recommendedAid.push('agricultural');
  }
  if (livelihoodKeywords.some((kw) => text.includes(kw))) {
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
    damageDescription.trim().length > 20
      ? damageDescription.trim().slice(0, 280) + (damageDescription.length > 280 ? '…' : '')
      : `Reported ${severityLevel.toLowerCase()} impact from ${disasterType}. Main concerns: ${categories.join(', ')}.`;

  return {
    engine: 'Local Smart Guide (no cloud AI)',
    severity_level: severityLevel,
    severity_score: severityScore,
    damage_summary: summary,
    damage_categories: categories,
    estimated_cost_min: costMin,
    estimated_cost_max: costMax,
    urgency,
    recommended_aid_types: [...new Set(recommendedAid)],
    safety_precautions: [
      'Stay away from damaged walls, roofs, and downed power lines until inspected.',
      'Use clean drinking water; boil water if supply may be contaminated.',
      'Take clear photos of damage before cleanup for your intake records.'
    ]
  };
}

function matchSubsidies(analysis, allSubsidies) {
  const matched = allSubsidies.map((sub) => {
    let score = 0;
    const subDamageTypes = (sub.damage_types || '')
      .split(',')
      .map((s) => s.trim().toLowerCase());
    for (const aidType of analysis.recommended_aid_types) {
      if (subDamageTypes.includes(aidType.toLowerCase())) {
        score += 35;
      }
    }
    if (analysis.severity_level === 'Catastrophic' && sub.id === 'dswd-esa-total') score += 50;
    else if (analysis.severity_level === 'Severe' && (sub.id === 'dswd-esa-total' || sub.id === 'dswd-esa-partial')) score += 40;
    else if (analysis.severity_level === 'Moderate' && sub.id === 'dswd-esa-partial') score += 45;
    if (sub.id === 'dswd-aics' || sub.id === 'lgu-barangay-relief') score += 25;
    if (analysis.damage_categories.some((c) => c.toLowerCase().includes('agri')) && sub.id === 'da-sure-aid') score += 55;
    if (
      analysis.damage_categories.some((c) => c.toLowerCase().includes('livelihood') || c.toLowerCase().includes('business')) &&
      sub.id === 'ndrrmc-livelihood-grant'
    ) {
      score += 55;
    }

    let requirements = sub.requirements;
    let application_steps = sub.application_steps;
    if (typeof requirements === 'string') {
      try {
        requirements = JSON.parse(requirements);
      } catch {
        requirements = [];
      }
    }
    if (typeof application_steps === 'string') {
      try {
        application_steps = JSON.parse(application_steps);
      } catch {
        application_steps = [];
      }
    }

    return {
      ...sub,
      requirements,
      application_steps,
      match_score: score,
      is_top_match: score >= 50
    };
  });

  matched.sort((a, b) => b.match_score - a.match_score);
  return matched;
}

export async function runLocalDamageAssessment(formPayload) {
  const {
    disasterType,
    damageDescription,
    householdSize = 3,
    manualChecks = {},
    costTier = ''
  } = formPayload;

  let narrative = damageDescription || '';
  if (!narrative.trim() && Object.keys(manualChecks).length > 0) {
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

  if (costTier.includes('100')) {
    core.severity_level = 'Catastrophic';
    core.severity_score = Math.max(core.severity_score, 85);
    core.estimated_cost_min = 80000;
    core.estimated_cost_max = 250000;
  } else if (costTier.includes('40')) {
    core.severity_level = 'Severe';
    core.severity_score = Math.max(core.severity_score, 70);
    core.estimated_cost_min = 40000;
    core.estimated_cost_max = 100000;
  } else if (costTier.includes('15')) {
    core.estimated_cost_min = 15000;
    core.estimated_cost_max = 40000;
  }

  let subsidies = [];
  try {
    const res = await fetch('/api/subsidies');
    const data = await res.json();
    if (data.success) subsidies = data.data;
  } catch {
    subsidies = [];
  }

  const id = 'LOCAL-' + Date.now().toString(36).toUpperCase();
  return {
    id,
    ...core,
    matched_subsidies: matchSubsidies(core, subsidies)
  };
}
