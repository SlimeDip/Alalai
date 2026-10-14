/**
 * AI Service Module & Template
 * 
 * Provides disaster damage analysis, severity classification, damage categorization,
 * cost estimation (in Philippine Pesos), and subsidy matching.
 * 
 * Integration:
 * - Uses the official Google Gen AI SDK (@google/genai) when GEMINI_API_KEY is configured.
 * - Automatically falls back to an intelligent heuristic analyzer if the API key is missing
 *   or if the external API call fails, ensuring zero downtime for disaster intake.
 */

import { GoogleGenAI } from '@google/genai';
import db from '../database.js';
import { attachSubsidyEligibility } from './subsidyMatcher.js';

let aiClient = null;
let aiClientApiKey = null;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!aiClient || apiKey !== aiClientApiKey) {
    aiClient = new GoogleGenAI({ apiKey });
    aiClientApiKey = apiKey;
  }

  return aiClient;
}

export function isGeminiConfigured() {
  return Boolean(getGeminiClient());
}

export function validateGeminiAnalysisResult(result) {
  const validSeverityLevels = ['Low', 'Moderate', 'Severe', 'Catastrophic'];
  const isStringArray = (value) => Array.isArray(value)
    && value.every((entry) => typeof entry === 'string');

  if (
    !result
    || typeof result !== 'object'
    || Array.isArray(result)
    || !validSeverityLevels.includes(result.severity_level)
    || !Number.isFinite(result.severity_score)
    || result.severity_score < 1
    || result.severity_score > 100
    || typeof result.damage_summary !== 'string'
    || !isStringArray(result.damage_categories)
    || !Number.isFinite(result.estimated_cost_min)
    || result.estimated_cost_min < 0
    || !Number.isFinite(result.estimated_cost_max)
    || result.estimated_cost_max < 0
    || result.estimated_cost_min > result.estimated_cost_max
    || typeof result.urgency !== 'string'
    || !isStringArray(result.recommended_aid_types)
    || !isStringArray(result.safety_precautions)
    || !isStringArray(result.suggested_actions)
  ) {
    throw new TypeError('Gemini returned an invalid assessment response.');
  }

  return result;
}

/**
 * Main Analysis Function
 * 
 * @param {Object} params
 * @param {string} params.disasterType - e.g. "Typhoon", "Flash Flood", "Earthquake", "Fire"
 * @param {string} params.damageDescription - User's narrative of the damages
 * @param {string} [params.location] - Barangay, City, Province
 * @param {number} [params.householdSize] - Number of affected family members
 * @returns {Promise<Object>} Structured damage assessment & matched subsidies
 */
export async function analyzeDisasterDamage({
  disasterType,
  damageDescription,
  location = 'Philippines',
  householdSize = 1,
  image = null
}) {
  // If Gemini API key is configured, use Gemini model
  const geminiClient = getGeminiClient();
  if (geminiClient) {
    try {
      const geminiResult = await analyzeWithGemini({
        disasterType,
        damageDescription,
        location,
        householdSize,
        image
      });
      if (geminiResult) {
        return attachDatabaseSubsidies(geminiResult, disasterType);
      }
    } catch (err) {
      if (err.code === 'IRRELEVANT_IMAGE') {
        throw err;
      }
      console.warn('Gemini API call failed or timed out. Falling back to heuristic engine:', err.message);
    }
  }

  // Fallback heuristic analyzer
  const heuristicResult = analyzeWithHeuristic({
    disasterType,
    damageDescription,
    location,
    householdSize
  });

  return attachDatabaseSubsidies(heuristicResult, disasterType);
}

/**
 * Gemini API Analysis Implementation
 * (Template for Google Gen AI integration)
 */
async function analyzeWithGemini({ disasterType, damageDescription, location, householdSize, image }) {
  const prompt = `
You are an expert disaster risk reduction, damage assessment, and social welfare specialist working with the Philippine National Disaster Risk Reduction and Management Council (NDRRMC) and the Department of Social Welfare and Development (DSWD).

Analyze the following calamity damage report submitted by a resident in the Philippines.
- Calamity / Disaster Event: ${disasterType}
- Resident Location: ${location}
- Household Size: ${householdSize}
- Resident's Damage Narrative: "${damageDescription}"
${image ? `
An image is attached. First determine whether it clearly shows physical damage or loss related to the selected calamity. If it is unrelated, not a damage photo, or too unclear to verify, return:
{"image_relevant": false}
and no other fields. Otherwise return the complete schema below with "image_relevant": true.
` : ''}

Analyze the report thoroughly and return STRICTLY a valid JSON object matching the following schema:
{
  "image_relevant": true,
  "severity_level": "Low" | "Moderate" | "Severe" | "Catastrophic",
  "severity_score": <number between 1 and 100>,
  "damage_summary": "<clear 2-3 sentence professional summary suitable for an official government intake slip>",
  "damage_categories": ["<array of strings: e.g. Structural/Roofing, Flooding/Water Ingress, Agriculture/Crops, Livelihood/Small Business, Medical/Injuries>"],
  "estimated_cost_min": <realistic estimated repair/recovery cost in Philippine Pesos (PHP) as a number>,
  "estimated_cost_max": <realistic high-end repair/recovery cost in PHP as a number>,
  "urgency": "Standard" | "High" | "Immediate Evacuation / Lifeline Need",
  "recommended_aid_types": ["<array of keywords: structural, agricultural, livelihood, general, food, medical>"],
  "safety_precautions": [
    "<3 practical safety reminders in simple, clear language tailored for adult Filipino residents (e.g. electrical hazards, contaminated water, boiling drinking water, checking building integrity)>"
  ],
  "suggested_actions": [
    "<2-3 immediate bureaucratic/community steps to take: e.g. secure Barangay certification, take photos with timestamp, register at evacuation center>"
  ]
}

DO NOT include markdown fences, code blocks, or extraneous text. Return ONLY the raw JSON string.
`;

  // Model choice: 'gemini-2.5-flash' provides fast, structured responses
  const contents = image
    ? [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: image.mimetype,
              data: image.buffer.toString('base64')
            }
          }
        ]
      }]
    : prompt;

  const response = await getGeminiClient().models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  });

  const responseText = response.text?.trim() || '';
  // Clean potential backticks if returned
  const cleanedText = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleanedText);
  if (image && parsed.image_relevant === false) {
    const error = new Error('The uploaded image is not relevant to the selected disaster.');
    error.code = 'IRRELEVANT_IMAGE';
    throw error;
  }
  if (image && parsed.image_relevant !== true) {
    throw new TypeError('Gemini did not verify the uploaded image.');
  }
  delete parsed.image_relevant;
  validateGeminiAnalysisResult(parsed);
  parsed.engine = 'Gemini 2.5 Flash';
  return parsed;
}

const hasKeyword = (text, kw) => new RegExp(`(?:^|[^a-zA-ZáéíóúñÑ])${kw}(?:$|[^a-zA-ZáéíóúñÑ])`, 'i').test(text);

/**
 * Heuristic Fallback Analysis Engine
 * Evaluates Tagalog and English disaster keywords, damage patterns, and scales.
 */
function analyzeWithHeuristic({ disasterType, damageDescription, householdSize }) {
  const text = (damageDescription || '')
    .toLowerCase()
    .replace(/\bno damage to the roof\b/g, ' ')
    .replace(/\bwalang sira ang bubong\b/g, ' ');

  // Keyword lexicons (English & Filipino / Tagalog)
  const totalKeywords = ['wasak', 'guho', 'collapsed', 'washed away', 'anod', 'walang natira', 'total destruction', 'flattened', 'lipad lahat', 'lubog sa putik', 'abo lahat', 'sinunog', 'abo', 'lumubog'];
  const severeKeywords = ['sira ang bubong', 'tinangay ang yero', 'bumagsak ang pader', 'chest deep', 'hanggang dibdib', 'hanggang bubong', 'malaking sira', 'patay ang pananim', 'wasak ang bangka', 'severe', 'major damage', 'lumipad ang yero'];
  const moderateKeywords = ['bahagya', 'may sira', 'nabutas', 'tulo', 'nabasa', 'gutter', 'waist deep', 'hanggang bewang', 'knee deep', 'hanggang tuhod', 'tumbang puno', 'damaged roof', 'partial'];
  
  const agriKeywords = ['palay', 'sakahan', 'tanim', 'pananim', 'gulay', 'bukid', 'mais', 'talong', 'bangka', 'lambat', 'isda', 'fishpond', 'pig', 'baboy', 'manok', 'poultry', 'livestock', 'ani'];
  const livelihoodKeywords = ['tindahan', 'sari-sari', 'paninda', 'talyer', 'tricycle', 'motor', 'kariton', 'pwesto', 'stocks', 'paninda sa palengke', 'equipment', 'sewing machine', 'freeze'];
  const structuralKeywords = ['bubong', 'yero', 'pader', 'haligi', 'kisame', 'bintana', 'pinto', 'dingding', 'sahig', 'wall', 'roof', 'timber', 'post', 'ceiling', 'beam'];
  const waterKeywords = ['baha', 'flood', 'tubig', 'putik', 'mud', 'inundation', 'agos', 'drainage'];

  let severityScore = 30;
  let severityLevel = 'Moderate';
  let urgency = 'Standard';

  if (totalKeywords.some(kw => hasKeyword(text, kw))) {
    severityScore = 90;
    severityLevel = 'Catastrophic';
    urgency = 'Immediate Evacuation / Lifeline Need';
  } else if (severeKeywords.some(kw => hasKeyword(text, kw))) {
    severityScore = 75;
    severityLevel = 'Severe';
    urgency = 'High';
  } else if (moderateKeywords.some(kw => hasKeyword(text, kw))) {
    severityScore = 45;
    severityLevel = 'Moderate';
    urgency = 'Standard';
  } else {
    severityScore = 25;
    severityLevel = 'Low';
    urgency = 'Standard';
  }

  // Identify categories
  const categories = [];
  const recommendedAid = [];

  if (structuralKeywords.some(kw => hasKeyword(text, kw))) {
    categories.push('Structural & Roofing');
    recommendedAid.push('structural');
  }

  if (waterKeywords.some(kw => hasKeyword(text, kw)) || disasterType.toLowerCase().includes('flood')) {
    categories.push('Water Ingress & Flooding');
    recommendedAid.push('general');
  }

  if (agriKeywords.some(kw => hasKeyword(text, kw))) {
    categories.push('Agriculture & Fisheries');
    recommendedAid.push('agricultural');
  }

  if (livelihoodKeywords.some(kw => hasKeyword(text, kw))) {
    categories.push('Small Business & Livelihood');
    recommendedAid.push('livelihood');
  }

  // Cost estimates in PHP
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

  // Adjust slightly for household size
  if (householdSize > 4) {
    costMax = Math.round(costMax * 1.2);
  }

  const damageSummary = categories.length
    ? `Initial intake identifies ${severityLevel.toLowerCase()} damage from ${disasterType}. Affected assets focus on ${categories.join(' and ')}. Urgent restoration is advised for family dwelling stability.`
    : `Initial intake did not identify a supported damage category for ${disasterType}.`;

  return {
    engine: 'Heuristic Rule Analyzer (Gemini Ready)',
    severity_level: severityLevel,
    severity_score: severityScore,
    damage_summary: damageSummary,
    damage_categories: categories,
    estimated_cost_min: costMin,
    estimated_cost_max: costMax,
    urgency: urgency,
    recommended_aid_types: recommendedAid,
    safety_precautions: [
      'Mag-ingat sa mga nakabiting kawad ng kuryente at basang switch bago pumasok sa bahay.',
      'Pakuluan ang tubig-inumin ng hindi bababa sa 3 minuto o gumamit ng water purification tablets.',
      'Siyasatin ang katatagan ng kisame at mga pader bago payagan ang mga bata at matatanda sa loob.'
    ],
    suggested_actions: [
      'Kumuha ng Barangay Certificate of Calamity / Indigency sa inyong Barangay Hall.',
      'Kumuha ng malinaw na litrato ng mga nasirang bahagi ng bahay o pananim bago maglinis o mag-kumpuni.',
      'I-print ang nakalakip na official disaster application slip at ipapirma sa Barangay Disaster Officer.'
    ]
  };
}

/**
 * Match subsidies from the SQLite database based on analyzed damage characteristics
 */
function attachDatabaseSubsidies(analysis, disasterType) {
  const allSubsidies = db.prepare('SELECT subsidy_id AS id, * FROM subsidies').all();

  return attachSubsidyEligibility(analysis, disasterType, allSubsidies);
}
