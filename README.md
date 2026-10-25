# Alalai: Philippine Calamity Damage Assessment & Disaster Relief Portal

A disaster risk reduction and social welfare web application built with **React**, **Node.js**, **Express**, and **SQLite**. Designed specifically for adult Filipino citizens and local disaster enumerators to analyze calamity damage from natural hazards (typhoons, floods, earthquakes, landslides, fires), match appropriate government subsidies, and generate editable, directly printable official disaster assistance intake sheets.

---

## Key Features

1. **AI-Powered Calamity Damage Assessment**
   - Natural language damage evaluation accepting descriptions in Filipino/Tagalog, English, or regional dialects.
   - Powered by Google Gemini (`@google/genai`). Assessments fail explicitly when Gemini is not configured or unavailable; fabricated fallback results are never shown.
   - Outputs severity level (Low, Moderate, Severe, Catastrophic), numeric severity scores (1-100), damage categorization, estimated repair costs in Philippine Pesos (₱), and urgent safety precautions.

2. **Verified Philippine Government Subsidy Matching**
   - No subsidy claims are bundled, mocked, or seeded by default.
   - Subsidies are maintained in `backend/data/subsidies.json` and served to the
     frontend through a read-only API; the backend also uses them for matching and
     SQLite persistence. Verify every record
     on its official source before publishing changes.

3. **Editable Official Intake Slip & Direct Print (`window.print()`)**
   - Formatted in accordance with standard Philippine disaster intake sheets (DSWD Family Access Card / NDRRMC Relief Intake Sheet).
   - Allows users to **edit all fields directly**: Applicant personal info, Valid ID type & number, residence address (Purok, Barangay, Municipality, Province), disaster event, incident date, damage narrative, requested aid amount, and dynamic household members list.
   - Single-click **"I-print ang Form (Direct Print)"** button optimized with `@media print` CSS: strips web chrome, banners, and buttons, rendering a clean, high-contrast, black-and-white or navy document ready for barangay stamp and signatures.

4. **Designed for Filipino Adults & Seniors (Modern & Uncluttered)**
   - **Modern Landing Page**: Welcoming home page featuring an official disaster readiness banner, quick emergency hotlines, and entry pathways to either **"Continue as Guest"** or **"Resident Login / Register"**.
   - **Progressive 3-Step Wizard**: Instead of overwhelming users with a 15-field form all at once, intake is divided into clean, focused steps:
     - *Step 1: Disaster Event & Location*
     - *Step 2: Damage Narrative & One-Click Presets*
     - *Step 3: Assessment Results & Matched Aid*
   - **Fully Responsive (Mobile & Tablet Ready)**: Optimized touch targets (minimum 44px), responsive hamburger navigation drawer for smartphones/tablets, and stacked cards for small screens.
   - **Strictly No Gradients & No Emojis**: Clean solid colors (`#1e3a8a` navy, `#0f172a` slate, `#e2e8f0` crisp borders) with formal `lucide-react` iconography.

5. **Local SQLite Database**
   - Stores subsidies catalog, assessment history, and editable applications with generated reference tracking numbers (`NDRRMC-PH-2026-XXXX`).

6. **Guarded Image-Assisted Assessment**
   - Optional JPG, PNG, or WebP damage photo upload (maximum 8 MB) alongside the written report.
   - Gemini checks that the image visibly shows damage relevant to the selected disaster before using it for assessment.
   - Rejects invalid files, unrelated images, screenshots, stock graphics, and ambiguous images; image requests fail closed if Gemini is unavailable.
   - Uploaded images are held in memory for analysis and are not stored in SQLite.

---

## Project Structure

```text
WebSysGroup12/
├── .env.example                     # Environment template
├── .gitignore                       # Git ignore rules for node_modules, SQLite, dist
├── package.json                     # Root workspace scripts
├── REQUIREMENTS.md                  # Comprehensive requirements document
├── requirements.txt                 # Dependency specification
├── README.md                        # Documentation
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── database.js                  # SQLite initialization & subsidy catalog import
│   ├── data/
│   │   ├── subsidies.json           # Single verified subsidy catalog source
│   │   ├── subsidies.template.json
│   │   └── README.md                # Catalog maintenance guide
│   ├── disaster_relief.db           # SQLite database file (created on startup)
│   ├── server.js                    # Express app configuration & routing
│   ├── routes/
│   │   ├── assessments.js           # Assessment endpoint & AI analyzer invocation
│   │   └── applications.js          # CRUD operations for intake applications
│   └── services/
│       ├── aiService.js             # Google Gemini damage analysis service
│       ├── subsidyCatalog.js        # Frontend catalog reader for backend matching
│       └── README_AI_TEMPLATE.md    # Guide to configuring and customizing AI
└── frontend/
    ├── index.html                   # HTML entry point with metadata
    ├── package.json
    ├── vite.config.js               # Vite config with React plugin and backend proxy
    └── src/
        ├── main.jsx                 # React root renderer
        ├── App.jsx                  # Main application orchestrator with tab routing
        ├── index.css                # Solid-color accessible CSS with @media print rules
        ├── utils/
        │   └── translations.js      # English and Filipino UI translations
        └── components/
            ├── Header.jsx           # Gov.ph header banner with emergency hotlines
            ├── LandingPage.jsx      # Landing page and guest entry point
            ├── AuthModal.jsx        # Resident login/register dialog
            ├── DamageAssessmentForm.jsx  # Damage assessment input & AI results display
            ├── SubsidyCatalog.jsx   # Directory of government subsidy programs
            ├── OfficialApplicationView.jsx # Live editable official form & print layout
            └── SavedApplicationsList.jsx   # Database record viewer & reprint manager
```

---

## Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (tested on Node.js v22.14.0)
- **npm**: v9.0.0 or higher
- A modern browser with JavaScript enabled

### 2. Setup & Installation
Run from the root directory:
```bash
# Install root, backend, and frontend dependencies
npm run install:all
```
Or manually install each folder:
```bash
cd backend
npm install
cd ../frontend
npm install
```

### 3. Configure your Gemini API Key
All assessments require Google Gemini. The application does not generate local or fallback assessment results:
1. Copy `backend/.env.example` to either `backend/.env` or the repository root `.env`.
2. Set your API key in that file:
   ```env
   PORT=5000
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```
3. Get an API key from [Google AI Studio](https://aistudio.google.com/).

Never commit `.env` files or an API key to source control.

### 4. Running the Development Servers

#### Terminal 1: Backend Server (Port 5000)
```bash
cd backend
npm run dev
```

#### Terminal 2: Frontend Client (Port 3000)
```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser. The Vite development server proxies
requests under `/api` to the backend at `http://localhost:5000`.

To verify that the backend is running, open
`http://localhost:5000/api/health`.

### Root scripts

The following convenience scripts can be run from the repository root:

```bash
npm run backend        # Start the backend in watch mode
npm run frontend       # Start the Vite development server
npm run build:frontend # Create a production frontend build in frontend/dist
npm start              # Start only the backend
```

### Production frontend build

The frontend is a Vite single-page application. Build it with:

```bash
cd frontend
npm run build
```

The generated static files are written to `frontend/dist`. The backend currently
serves the API only, so deploy the contents of `frontend/dist` using a static
web server or hosting service and point its `/api` requests to the backend.

---

## How to Test the Flow

1. **Step 1 (Damage Assessment)**:
   - Click **"Suriin ang Pinsala at Hanapin ang Ayuda (Analyze Damages)"**.
   - Review the calculated damage severity score, estimated cost range in ₱, damage categories, safety reminders, and matched government subsidies.
2. **Step 2 (Choose Subsidy & Pre-fill Form)**:
   - Click **"Gamitin sa Aplikasyon (Apply Now)"** on any recommended subsidy (e.g., DSWD Emergency Shelter Assistance).
3. **Step 3 (Edit Application & Direct Print)**:
   - The application form is automatically pre-filled with the assessment data.
   - Edit any field (Applicant Name, ID Number, Address, Household Members list, Requested Amount).
   - Click **"I-save sa Rekord"** to save to the SQLite database.
   - Click **"I-print ang Form (Direct Print)"** to open the print dialog. The print preview shows a formatted, clean Philippine Disaster Intake Slip with signature blocks.
4. **Step 4 (Database Records)**:
   - Switch to tab **4. Mga Na-save na Rekord** to view, search, reload, or delete saved applications.
