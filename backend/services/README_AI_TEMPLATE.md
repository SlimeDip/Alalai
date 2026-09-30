# AI Damage Analysis Engine & Template Documentation

## Overview
The AI service module in `backend/services/aiService.js` is designed to analyze calamity damage narratives submitted by disaster victims or local enumerators in the Philippines. It categorizes damage, scores disaster severity, provides realistic repair cost estimates in Philippine Pesos (₱), outputs crucial family safety reminders, and automatically matches eligibility criteria with national and local subsidies stored in SQLite.

---

## Architecture & Integration

### 1. Official Google Gen AI SDK Integration
The service integrates the latest `@google/genai` SDK:

```javascript
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || '';
const aiClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
```

### 2. Zero-Downtime Heuristic Fallback
Disaster response systems cannot afford downtime due to expired API keys, rate limits, or network connectivity issues at evacuation centers:
- If `GEMINI_API_KEY` is configured in `backend/.env`, the system calls `analyzeWithGemini()` using `gemini-2.5-flash`.
- If `GEMINI_API_KEY` is not present, or if an API exception occurs, the system automatically falls back to `analyzeWithHeuristic()`.
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
   AI Module Status: Google Gemini API Connected
   ```

---

## Customizing the AI Model or Prompts
- To switch to another model, change `'gemini-2.5-flash'` in `backend/services/aiService.js` to `'gemini-2.5-pro'`.
- To adjust subsidy matching weights or scoring thresholds, modify `attachDatabaseSubsidies()` in `backend/services/aiService.js`.
