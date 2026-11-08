# Alalai: Philippine Calamity Damage Assessment & Disaster Relief Portal

Alalai is a disaster-assistance web application for Filipino residents and local
disaster responders. It helps users document calamity damage, assess its severity,
find potentially relevant government assistance programs, and prepare a printable
official intake application.

The application uses React and Vite for the frontend, Node.js and Express for the
backend, SQLite for persistence, and Google Gemini for AI-assisted assessments.

## Features

- **AI damage assessment** using a written damage report and optional JPG, PNG, or
  WebP damage image.
  - Supports English and Filipino/Tagalog descriptions.
  - Returns severity, score, damage categories, estimated PHP costs, urgency,
    safety precautions, suggested actions, and matched aid types.
  - Rejects unrelated or non-damage images and fails explicitly when Gemini is
    unavailable; it does not display fabricated fallback assessments.
- **Manual damage checklist** for users who prefer guided inputs instead of
  writing a full narrative.
- **Verified subsidy catalog** loaded from `backend/data/subsidies.json`.
  Programs include official source links, eligibility information, requirements,
  application steps, and verification dates.
- **Resident accounts and guest access** with password-based sign up/sign in,
  secure sessions, CSRF protection for state-changing requests, and rate-limited
  authentication endpoints. Residents sign up with separate first, middle, and
  last name fields and can edit an autofill profile containing contact details,
  address, household information, occupation, beneficiary category, and ID
  details.
- **Editable official application form** pre-filled from assessment results.
  Users can edit applicant details, address, disaster information, damage
  narrative, requested aid, and household members.
- **Saved applications and recovery records** stored in SQLite for authenticated
  residents, with search, reload, delete, and reprint actions.
- **Direct print support** that removes application UI controls and renders a
  clean, high-contrast intake sheet through print-specific CSS.
- **Responsive bilingual interface** with English and Filipino UI translations,
  mobile navigation, accessible touch targets, emergency hotlines, and a
  responsive layout for phones, tablets, and desktops.

## Project structure

```text
WebSysGroup12/
├── package.json                  # Root development and build scripts
├── README.md
├── backend/
│   ├── package.json
│   ├── server.js                 # Express app and API startup
│   ├── database.js               # SQLite schema and migrations
│   ├── disaster_relief.db        # Local database created/updated at runtime
│   ├── data/
│   │   ├── subsidies.json        # Verified subsidy catalog source
│   │   ├── subsidies.template.json
│   │   └── README.md             # Subsidy verification and maintenance guide
│   ├── routes/
│   │   ├── auth.js               # Registration, login, logout, and sessions
│   │   ├── assessments.js        # AI/manual assessment persistence
│   │   ├── applications.js       # Saved application CRUD
│   │   └── subsidies.js          # Read-only subsidy catalog API
│   └── services/
│       ├── aiService.js          # Gemini integration and response validation
│       ├── subsidyCatalog.js     # Catalog loading and database synchronization
│       └── subsidyMatcher.js     # Eligibility and aid matching
└── frontend/
    ├── package.json
    ├── vite.config.js             # Vite config and API proxy
    └── src/
        ├── App.jsx                # Main application flow and navigation
        ├── index.css              # Responsive and print styles
        ├── utils/translations.js  # English and Filipino translations
        └── components/
            ├── Header.jsx
            ├── LandingPage.jsx
            ├── AuthModal.jsx
            ├── DamageAssessmentForm.jsx
            ├── SubsidyCatalog.jsx
            ├── OfficialApplicationView.jsx
            └── SavedApplicationsList.jsx
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A modern browser with JavaScript enabled
- A Google Gemini API key for AI-assisted assessments

## Installation

From the repository root:

```bash
npm run install:all
```

To install manually:

```bash
cd backend
npm install
cd ../frontend
npm install
```

## Configuration

Create `backend/.env` and add:

```env
PORT=5000
GEMINI_API_KEY=your_actual_gemini_api_key_here
# Optional: GEMINI_MODEL=gemini-3.8-flash
# Optional: FRONTEND_ORIGIN=http://localhost:3000
```

Get a Gemini key from [Google AI Studio](https://aistudio.google.com/). Never
commit `.env` files or API keys to source control.

The backend imports the verified subsidy catalog into SQLite on startup. Follow
the instructions in [`backend/data/README.md`](backend/data/README.md) before
adding or changing subsidy records.

## Run locally

Start the backend in one terminal:

```bash
npm run backend
```

Start the frontend in another terminal:

```bash
npm run frontend
```

Then open [http://localhost:3000](http://localhost:3000). The Vite development
server proxies `/api` requests to `http://localhost:5000`.

The backend health endpoint is available at
[http://localhost:5000/api/health](http://localhost:5000/api/health).

Root convenience scripts:

```bash
npm start              # Start only the backend
npm run backend        # Start backend in watch mode
npm run frontend       # Start Vite development server
npm run build:frontend # Build frontend into frontend/dist
```

## Typical user flow

1. Continue as a guest or register/login as a resident.
2. Select an AI assessment or the manual checklist.
3. Enter the disaster, location, household, and damage information. Optionally
   upload a clear damage photo under 8 MB.
4. Review the validated assessment and matched subsidy programs.
5. Select a program to pre-fill the official application.
6. Edit the application, save it when logged in, and print the completed intake
   form.

## Important notes

- AI results are advisory and do not guarantee eligibility or benefit approval.
- Subsidy details must be verified against the linked official government source.
- Assessment images are held in memory for analysis and are not stored in
  SQLite.
- The backend API serves API routes only; deploy `frontend/dist` separately
  behind a static web server for production.
