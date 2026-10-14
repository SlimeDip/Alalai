# AI Damage Analysis Engine & Template Documentation

## Overview
The AI service module in `backend/services/aiService.js` analyzes calamity damage narratives submitted by disaster victims or local enumerators in the Philippines. It categorizes damage, scores disaster severity, estimates repair costs in Philippine Pesos (₱), provides safety reminders, and compares assessment details with subsidy rule fields stored in SQLite for potential relevance.

---

## Architecture & Integration

### 1. Official Google Gen AI SDK Integration
The service integrates the latest `@google/genai` SDK:

```javascript
import { GoogleGenAI } from '@google/genai';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}
```

The backend loads its environment before requests are handled, and the client is initialized lazily when configuration is checked or analysis runs. A configured key does not verify API connectivity.

### 2. Zero-Downtime Heuristic Fallback
Disaster response systems cannot afford downtime due to expired API keys, rate limits, or network connectivity issues at evacuation centers:
- If `GEMINI_API_KEY` is configured in `backend/.env`, the system calls `analyzeWithGemini()` using `gemini-2.5-flash`.
- Image assessments are sent as `multipart/form-data`; supported JPEG, PNG, and WebP images are passed to Gemini as inline multimodal input. Gemini rejects images that cannot be verified as damage related to the selected disaster.
- If `GEMINI_API_KEY` is not present, or if an API exception occurs, the system automatically falls back to `analyzeWithHeuristic()`.
- The health endpoint reports whether the Gemini client can be configured locally; it does not report a verified connection to Google's API.
- The heuristic engine parses Tagalog, Filipino, and English calamity terminology (e.g. *yero*, *bubong*, *guho*, *wasak*, *lubog sa baha*, *sakahan*, *palay*, *bangka*, *tindahan*) to determine severity scores and damage categories.

---

## AI Prompt & Output Schema
The AI is instructed with an expert role prompt tailored to Philippine Disaster Risk Reduction (NDRRMC / DSWD) standards. It enforces structured JSON with the following schema:

```json
{
  "severity_level": "Catastrophic" | "Severe" | "Moderate" | "Low",
  "severity_score": 75,
  "damage_summary": "Extensive structural wind damage with detached corrugated galvanized iron roofing sheets and localized water ingress into residential quarters.",
  "damage_categories": [
    "Structural & Roofing",
    "Water Ingress & Flooding"
  ],
  "estimated_cost_min": 25000,
  "estimated_cost_max": 75000,
  "urgency": "High",
  "recommended_aid_types": [
    "structural",
    "general",
    "food"
  ],
  "safety_precautions": [
    "Beware of live hanging electrical wires and wet outlets.",
    "Boil drinking water for at least 3 minutes.",
    "Inspect timber ceiling beams before entering."
  ],
  "suggested_actions": [
    "Request Barangay Certification of Calamity Damage.",
    "Take geo-tagged photos of damaged structures before clearing debris.",
    "Present this printed intake slip to the MSWDO desk."
  ]
}
```

---

## How to Configure Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/) and generate an API key.
2. Open `backend/.env` (or copy from `.env.example`).
3. Add your key:
   ```env
   GEMINI_API_KEY=AIzaSy...
   PORT=5000
   ```
4. Restart the backend:
   ```bash
   cd backend
   npm run dev
   ```
5. Check backend logs:
   ```text
   Disaster Relief Backend running on http://localhost:5000
   AI Module Status: Gemini client configured (connection not verified)
   ```

---

## Customizing the AI Model or Prompts
- To switch to another model, change `'gemini-2.5-flash'` in `backend/services/aiService.js` to `'gemini-2.5-pro'`.
- Subsidy matching is implemented in `backend/services/subsidyMatcher.js`. Both Gemini and heuristic results use the same attachment path. `matched_subsidies` preserves the existing frontend-facing fields and excludes programs with confirmed rule conflicts; `eligibility_results` additionally classifies every program as `potentially_eligible`, `not_eligible`, or `needs_more_information`. For compatibility, `eligibility_status` remains `potential_match` for potentially eligible programs and uses the corresponding explicit outcome for known mismatches or insufficient information.
- A missing or malformed disaster, damage, or minimum-severity rule is unknown—not unrestricted. The explicit `*` value means unrestricted. Assessment severity is ordered Low < Moderate < Severe < Catastrophic.
- `match_score` is compatibility points from matched disaster (35), damage (45), and severity (20) rules. It is not a probability of approval; `is_top_match` is only a ranking flag and cannot override a confirmed conflict. Textual requirements are not machine-evaluated, and neither field establishes official eligibility or guarantees approval.
- The complete `eligibility_results` snapshot is stored with each new recovery case and returned unchanged when retrieved. Older cases without a snapshot return `eligibility_results: null`; stored snapshots are never reconstructed by rerunning the matcher.
