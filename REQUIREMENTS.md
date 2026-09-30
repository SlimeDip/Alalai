# Disaster Risk Relief & Damage Assessment Portal - System Requirements

## 1. System Prerequisites
- **Node.js**: Version 18.x, 20.x, or 22.x LTS (Recommended: Node.js v22.14.0+)
- **NPM**: Version 9.x or 10.x+
- **Operating System**: Windows 10/11, macOS, or Linux
- **Modern Web Browser**: Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari (supporting standard CSS print media queries).

---

## 2. Backend Dependencies (`backend/package.json`)
| Package | Version | Purpose |
| :--- | :--- | :--- |
| `express` | `^5.2.1` | REST API HTTP server and routing |
| `cors` | `^2.8.6` | Cross-Origin Resource Sharing middleware |
| `better-sqlite3` | `^13.0.3` | Fast, synchronous SQLite3 driver and storage engine |
| `dotenv` | `^18.0.5` | Environment variable management (`.env`) |
| `@google/genai` | `^2.25.0` | Official Google Gen AI SDK for Gemini damage analysis |

---

## 3. Frontend Dependencies (`frontend/package.json`)
| Package | Version | Purpose |
| :--- | :--- | :--- |
| `react` | `^19.3.0` | UI component library |
| `react-dom` | `^19.3.0` | DOM rendering layer for React |
| `lucide-react` | `^1.49.0` | Clean icon suite (strictly replacing emojis) |
| `vite` | `^8.3.1` | Fast frontend bundler and local development server |
| `@vitejs/plugin-react`| `^6.1.1` | Vite React fast refresh plugin |

---

## 4. Environment Variables Configuration (`.env`)
Create a `.env` file in `backend/.env` (or copy from `.env.example`):

```env
# Server Port (Default: 5000)
PORT=5000

# Google Gemini API Key (Optional: system automatically uses an intelligent Heuristic Analyzer fallback if not set)
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 5. Database Schema & Storage
- **Engine**: SQLite 3 (WAL mode enabled for concurrent read/write)
- **Database File**: `backend/disaster_relief.db` (auto-created and auto-seeded upon first server start)
- **Tables**:
  - `subsidies`: Catalog of Philippine disaster relief programs (DSWD ESA, DSWD AICS, DA SURE, Pag-IBIG, SSS, LGU).
  - `assessments`: Damage reports, severity scoring, cost ranges (PHP), and AI assessment logs.
  - `applications`: Official printable intake applications with editable fields and reference tracking numbers (`NDRRMC-PH-2026-XXXX`).

---

## 6. How to Run the Application

### Option A: Running Backend and Frontend in separate terminals

#### 1. Start the Backend Server:
```bash
cd backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

#### 2. Start the Frontend Application:
```bash
cd frontend
npm install
npm run dev
# Vite runs on http://localhost:3000 (proxies /api to backend)
```

### Option B: Build Frontend for Production
```bash
cd frontend
npm run build
```
The compiled static assets will be located in `frontend/dist/`.
