import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DISASTER_RELIEF_DB_PATH
  ? path.resolve(process.env.DISASTER_RELIEF_DB_PATH)
  : path.join(__dirname, 'disaster_relief.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function tableExists(tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function tableColumns(tableName) {
  return db.pragma(`table_info(${tableName})`).map((column) => column.name);
}

function migrateColumnNames() {
  if (tableExists('subsidies')) {
    const columns = tableColumns('subsidies');
    if (columns.includes('id') && !columns.includes('subsidy_id')) {
      db.exec('ALTER TABLE subsidies RENAME COLUMN id TO subsidy_id');
    }
  }

  if (tableExists('applications')) {
    const columns = tableColumns('applications');
    if (columns.includes('id') && !columns.includes('application_id')) {
      db.exec('ALTER TABLE applications RENAME COLUMN id TO application_id');
    }
  }
}

function migrateLegacyAssessments() {
  if (!tableExists('assessments')) return;

  const rows = db.prepare('SELECT * FROM assessments').all();
  const insertCase = db.prepare(`
    INSERT OR IGNORE INTO recovery_cases (
      case_id, applicant_name, contact_number, disaster_type, incident_date,
      province, city_municipality, barangay, severity_level, severity_score,
      estimated_cost_min, estimated_cost_max, damage_categories,
      recommended_subsidies, safety_precautions
    ) VALUES (
      @case_id, @applicant_name, @contact_number, @disaster_type, @incident_date,
      @province, @city_municipality, @barangay, @severity_level, @severity_score,
      @estimated_cost_min, @estimated_cost_max, @damage_categories,
      @recommended_subsidies, @safety_precautions
    )
  `);
  const insertLoss = db.prepare(`
    INSERT OR IGNORE INTO loss_records (
      loss_record_id, case_id, item_name, item_category, condition,
      loss_type, estimated_loss_php, description
    ) VALUES (
      @loss_record_id, @case_id, @item_name, @item_category, @condition,
      @loss_type, @estimated_loss_php, @description
    )
  `);

  db.transaction((legacyRows) => {
    for (const row of legacyRows) {
      const caseId = row.id;
      let damageCategories = [];
      try {
        damageCategories = JSON.parse(row.damage_categories || '[]');
      } catch {}

      insertCase.run({
        case_id: caseId,
        applicant_name: row.applicant_name,
        contact_number: row.contact_number,
        disaster_type: row.disaster_type || 'Typhoon',
        incident_date: row.incident_date,
        province: row.province || 'Unspecified',
        city_municipality: row.city_municipality || 'Unspecified',
        barangay: row.barangay || 'Unspecified',
        severity_level: row.severity_level || 'Low',
        severity_score: row.severity_score || 0,
        estimated_cost_min: row.estimated_cost_min || 0,
        estimated_cost_max: row.estimated_cost_max || 0,
        damage_categories: JSON.stringify(damageCategories),
        recommended_subsidies: row.recommended_subsidies || '[]',
        safety_precautions: row.safety_precautions || '[]'
      });

      insertLoss.run({
        loss_record_id: `${caseId}-LEGACY-LOSS`,
        case_id: caseId,
        item_name: 'Reported disaster damage',
        item_category: damageCategories.join(', ') || 'general',
        condition: row.severity_level || 'Low',
        loss_type: 'general',
        estimated_loss_php: row.estimated_cost_max || 0,
        description: row.raw_description || ''
      });
    }
  })(rows);

  if (tableColumns('applications').includes('assessment_id')) {
    db.prepare(`
      UPDATE applications
      SET case_id = assessment_id
      WHERE case_id IS NULL
        AND assessment_id IN (SELECT case_id FROM recovery_cases)
    `).run();
  }
}

// Initialize database schema
export function initDatabase() {
  migrateColumnNames();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_ownership_migrations (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS subsidies (
      subsidy_id TEXT PRIMARY KEY,
      agency TEXT NOT NULL,
      title TEXT NOT NULL,
      short_description TEXT NOT NULL,
      details TEXT NOT NULL,
      max_amount_php REAL NOT NULL,
      amount_display TEXT NOT NULL,
      disaster_categories TEXT NOT NULL, -- comma-separated or JSON e.g. "typhoon,flood,earthquake"
      damage_types TEXT NOT NULL, -- "structural,agricultural,livelihood,general"
      min_severity TEXT NOT NULL, -- "Low", "Moderate", "Severe", "Catastrophic"
      requirements TEXT NOT NULL, -- JSON array
      contact_info TEXT NOT NULL,
      application_steps TEXT NOT NULL, -- JSON array
      source_url TEXT,
      last_verified_on TEXT
    );

    CREATE TABLE IF NOT EXISTS recovery_cases (
      case_id TEXT PRIMARY KEY,
      user_id TEXT,
      applicant_name TEXT,
      contact_number TEXT,
      disaster_type TEXT NOT NULL,
      incident_date TEXT,
      province TEXT NOT NULL,
      city_municipality TEXT NOT NULL,
      barangay TEXT NOT NULL,
      purok_street TEXT,
      severity_level TEXT NOT NULL,
      severity_score INTEGER DEFAULT 0,
      estimated_cost_min REAL DEFAULT 0,
      estimated_cost_max REAL DEFAULT 0,
      damage_summary TEXT DEFAULT '',
      damage_categories TEXT NOT NULL DEFAULT '[]',
      urgency TEXT DEFAULT 'standard',
      suggested_actions TEXT DEFAULT '[]',
      recommended_subsidies TEXT NOT NULL DEFAULT '[]',
      eligibility_results TEXT,
      safety_precautions TEXT NOT NULL DEFAULT '[]',
      status TEXT DEFAULT 'OPEN',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS loss_records (
      loss_record_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_category TEXT NOT NULL,
      condition TEXT NOT NULL,
      loss_type TEXT NOT NULL,
      estimated_loss_php REAL NOT NULL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES recovery_cases(case_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_plans (
      plan_id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      category TEXT NOT NULL,
      estimated_cost_php REAL NOT NULL DEFAULT 0,
      priority_level TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES recovery_cases(case_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS applications (
      application_id TEXT PRIMARY KEY,
      case_id TEXT REFERENCES recovery_cases(case_id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      reference_number TEXT UNIQUE NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_age INTEGER,
      civil_status TEXT,
      contact_number TEXT,
      valid_id_type TEXT,
      valid_id_number TEXT,
      province TEXT NOT NULL,
      city_municipality TEXT NOT NULL,
      barangay TEXT NOT NULL,
      purok_street TEXT,
      household_members_count INTEGER DEFAULT 1,
      household_members_detail TEXT, -- JSON array
      disaster_type TEXT NOT NULL,
      incident_date TEXT,
      damage_level TEXT NOT NULL,
      damage_summary TEXT NOT NULL,
      applied_subsidies TEXT NOT NULL, -- JSON array of subsidy IDs/titles
      estimated_damage_php REAL,
      requested_amount_php REAL,
      declared_needs TEXT,
      sworn_attestation INTEGER DEFAULT 1,
      status TEXT DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_loss_records_case_id ON loss_records(case_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_plans_case_id ON recovery_plans(case_id);

  `);

  const subsidyColumns = tableColumns('subsidies');
  if (!subsidyColumns.includes('source_url')) db.exec('ALTER TABLE subsidies ADD COLUMN source_url TEXT');
  if (!subsidyColumns.includes('last_verified_on')) db.exec('ALTER TABLE subsidies ADD COLUMN last_verified_on TEXT');

  if (tableExists('recovery_cases')) {
    const columns = tableColumns('recovery_cases');
    const recoveryCaseColumns = [
      ['applicant_name', 'TEXT'],
      ['contact_number', 'TEXT'],
      ['severity_score', 'INTEGER DEFAULT 0'],
      ['estimated_cost_min', 'REAL DEFAULT 0'],
      ['estimated_cost_max', 'REAL DEFAULT 0'],
      ["damage_summary", "TEXT DEFAULT ''"],
      ["damage_categories", "TEXT NOT NULL DEFAULT '[]'"],
      ["urgency", "TEXT DEFAULT 'standard'"],
      ["suggested_actions", "TEXT DEFAULT '[]'"],
      ["recommended_subsidies", "TEXT NOT NULL DEFAULT '[]'"],
      ["eligibility_results", "TEXT"],
      ["safety_precautions", "TEXT NOT NULL DEFAULT '[]'"]
    ];
    for (const [columnName, columnDefinition] of recoveryCaseColumns) {
      if (!columns.includes(columnName)) {
        db.exec(`ALTER TABLE recovery_cases ADD COLUMN ${columnName} ${columnDefinition}`);
      }
    }
  }

  const applicationColumns = tableColumns('applications');
  if (!applicationColumns.includes('case_id')) {
    db.exec('ALTER TABLE applications ADD COLUMN case_id TEXT REFERENCES recovery_cases(case_id) ON DELETE SET NULL');
  }
  if (!applicationColumns.includes('user_id')) {
    db.exec('ALTER TABLE applications ADD COLUMN user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_recovery_cases_user_id ON recovery_cases(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_loss_records_case_id ON loss_records(case_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recovery_plans_case_id ON recovery_plans(case_id)');

  if (!db.prepare('SELECT 1 FROM auth_ownership_migrations WHERE version = 1').get()) {
    db.transaction(() => {
      db.prepare('UPDATE recovery_cases SET user_id = NULL').run();
      db.prepare('UPDATE applications SET user_id = NULL').run();
      db.prepare('INSERT INTO auth_ownership_migrations (version) VALUES (1)').run();
    })();
  }

  migrateLegacyAssessments();

  // Subsidies are intentionally not seeded. Import verified records from the template.
  db.prepare('DELETE FROM subsidies WHERE source_url IS NULL OR last_verified_on IS NULL').run();
  importVerifiedSubsidies();
}

function importVerifiedSubsidies() {
  const dataPath = path.join(__dirname, 'data', 'subsidies.json');
  if (!fs.existsSync(dataPath)) return;
  if (db.prepare('SELECT 1 FROM subsidies LIMIT 1').get()) return;

  let records;
  try {
    records = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    console.error('Unable to read backend/data/subsidies.json:', error.message);
    return;
  }
  if (!Array.isArray(records)) {
    console.error('backend/data/subsidies.json must contain an array.');
    return;
  }

  const insert = db.prepare(`
    INSERT INTO subsidies (
      subsidy_id, agency, title, short_description, details, max_amount_php,
      amount_display, disaster_categories, damage_types, min_severity,
      requirements, contact_info, application_steps, source_url, last_verified_on
    ) VALUES (
      @id, @agency, @title, @short_description, @details, @max_amount_php,
      @amount_display, @disaster_categories, @damage_types, @min_severity,
      @requirements, @contact_info, @application_steps, @source_url, @last_verified_on
    )
  `);
  const importRecords = db.transaction((items) => {
    for (const item of items) {
      if (
        !item.id
        || item.id === 'replace-with-stable-program-id'
        || !item.title
        || !item.agency
        || !item.source_url
        || item.source_url.includes('.example')
        || !item.last_verified_on
        || item.last_verified_on === 'YYYY-MM-DD'
      ) {
        throw new Error('Every subsidy must include id, agency, title, source_url, and last_verified_on.');
      }
      insert.run({
        ...item,
        disaster_categories: JSON.stringify(item.disaster_categories || []),
        damage_types: JSON.stringify(item.damage_types || []),
        requirements: JSON.stringify(item.requirements || []),
        application_steps: JSON.stringify(item.application_steps || [])
      });
    }
  });
  try {
    importRecords(records);
  } catch (error) {
    console.error('Unable to import verified subsidies:', error.message);
  }
}

export default db;
