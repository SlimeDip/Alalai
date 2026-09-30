import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './database.js';
import subsidiesRouter from './routes/subsidies.js';
import assessmentsRouter from './routes/assessments.js';
import applicationsRouter from './routes/applications.js';

// Load environment variables (.env)
dotenv.config();

// Initialize SQLite database and seed initial subsidies if empty
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// API Routes
app.use('/api/subsidies', subsidiesRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/applications', applicationsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Philippine Disaster Damage Assessment & Subsidy Assistance API',
    timestamp: new Date().toISOString(),
    aiEngineConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Root friendly greeting
app.get('/', (req, res) => {
  res.send('Philippine Disaster Assistance & Damage Assessment API is running.');
});

// Start listening
app.listen(PORT, () => {
  console.log(`Disaster Relief Backend running on http://localhost:${PORT}`);
  console.log(`AI Module Status: ${process.env.GEMINI_API_KEY ? 'Google Gemini API Connected' : 'Heuristic Rule Analyzer Active (Fallback)'}`);
});
