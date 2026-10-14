import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import authRouter, { requireAuthenticatedUser } from './routes/auth.js';
import subsidiesRouter from './routes/subsidies.js';
import assessmentsRouter from './routes/assessments.js';
import applicationsRouter from './routes/applications.js';
import { isGeminiConfigured } from './services/aiService.js';

// Load environment variables from the repository root and backend directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize SQLite database and seed initial subsidies if empty
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// Middleware
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || origin === frontendOrigin),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// API Routes
app.use('/api/subsidies', subsidiesRouter);
app.use('/api/auth', authRouter);
app.use('/api/assessments', requireAuthenticatedUser, assessmentsRouter);
app.use('/api/applications', requireAuthenticatedUser, applicationsRouter);

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return res.status(400).json({
      success: false,
      error: 'Request body must contain valid JSON.'
    });
  }
  next(error);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Philippine Disaster Damage Assessment & Subsidy Assistance API',
    timestamp: new Date().toISOString(),
    aiEngineConfigured: isGeminiConfigured()
  });
});

// Root friendly greeting
app.get('/', (req, res) => {
  res.send('Philippine Disaster Assistance & Damage Assessment API is running.');
});

// Return upload and other middleware errors as JSON for the frontend.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: 'Image upload failed: ' + error.message });
  }
  if (error) {
    console.error('Unhandled API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
  next();
});

// Start listening
export const server = app.listen(PORT, () => {
  console.log(`Disaster Relief Backend running on http://localhost:${PORT}`);
  console.log(`AI Module Status: ${isGeminiConfigured() ? 'Gemini client configured (connection not verified)' : 'Heuristic Rule Analyzer Active (Fallback)'}`);
});
