/**
 * AI Service Module & Template
 * 
 * Provides disaster damage analysis, severity classification, damage categorization,
 * cost estimation (in Philippine Pesos), and subsidy matching.
 * 
 * Integration:
 * - Uses the official Google Gen AI SDK (@google/genai) when GEMINI_API_KEY is configured.
 * - Fails explicitly when the external AI service is not configured or unavailable.
 */

import { GoogleGenAI } from '@google/genai';
import { attachSubsidyEligibility } from './subsidyMatcher.js';
import { getSubsidyCatalog } from './subsidyCatalog.js';

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
      if (err.code === 'IRRELEVANT_IMAGE' || err.code === 'NO_DAMAGE_DETECTED') {
        throw err;
      }
      const unavailable = new Error('The AI damage analysis service is temporarily unavailable. Please try again in a few moments, or use the Manual Checklist method instead.');
      unavailable.code = 'AI_UNAVAILABLE';
      unavailable.cause = err;
      throw unavailable;
    }
  }

  const unavailable = new Error('The AI damage analysis service is not configured.');
  unavailable.code = 'AI_UNAVAILABLE';
  throw unavailable;
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
An image is attached. First determine whether it shows physical damage or loss related to the selected calamity.
If it is unrelated (for example a person, pet, food, vehicle, landscape, or another non-property image), return:
{"image_relevant": false, "image_issue": "unrelated"}
If it shows a home/property clearly but you detect no visible damage, return:
{"image_relevant": true, "damage_detected": false, "image_issue": "no_damage"}
Otherwise return the complete schema below with "image_relevant": true and "damage_detected": true.
` : ''}

Analyze the report thoroughly and return STRICTLY a valid JSON object matching the following schema:
{
  "image_relevant": true,
  "damage_detected": true,
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

  // Gemini's currently supported, responsive fast multimodal model.
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

  let lastError;
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const models = [...new Set([configuredModel, 'gemini-3.1-flash-lite'])];
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await getGeminiClient().models.generateContent({
          model,
          contents,
          config: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        });
        if (!response) throw new Error('Gemini returned no response.');
        const responseText = response.text?.trim() || '';
        const cleanedText = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleanedText);
        if (image && parsed.image_relevant === false) {
          const error = new Error('The uploaded image does not appear to show disaster-related damage. Please upload a clear photo of the affected property or area.');
          error.code = 'IRRELEVANT_IMAGE';
          error.reason = parsed.image_issue || 'unrelated';
          throw error;
        }
        if (image && parsed.damage_detected === false) {
          const error = new Error('No visible damage was detected in the uploaded photo. Please describe the specific damage in the text box so we can assess it accurately.');
          error.code = 'NO_DAMAGE_DETECTED';
          error.reason = 'no_damage';
          throw error;
        }
        if (image && parsed.image_relevant !== true) {
          throw new TypeError('Gemini did not verify the uploaded image.');
        }
        delete parsed.image_relevant;
        delete parsed.damage_detected;
        delete parsed.image_issue;
        validateGeminiAnalysisResult(parsed);
        parsed.engine = `Gemini (${model})`;
        return parsed;
      } catch (error) {
        lastError = error;
        if (error.code === 'IRRELEVANT_IMAGE' || error.code === 'NO_DAMAGE_DETECTED') throw error;
        const status = Number(error.status || error.code || error.error?.code);
        if (attempt === 3 || ![429, 500, 502, 503, 504].includes(status)) break;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError || new Error('Gemini returned no response.');
}

/**
 * Match subsidies from the SQLite database based on analyzed damage characteristics
 */
function attachDatabaseSubsidies(analysis, disasterType) {
  const allSubsidies = getSubsidyCatalog();

  return attachSubsidyEligibility(analysis, disasterType, allSubsidies);
}
