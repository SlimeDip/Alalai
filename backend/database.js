import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateOwnershipV2 } from './services/ownershipMigration.js';
import {
  ensureSubsidyCatalogStatusColumn,
  importSubsidyCatalog
} from './services/subsidyImporter.js';

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
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mobile TEXT,
      province TEXT,
      city_municipality TEXT,
      barangay TEXT,
      purok_street TEXT,
      household_size INTEGER,
      civil_status TEXT,
      sex TEXT,
      birth_date TEXT,
      occupation TEXT,
      beneficiary_category TEXT,
      valid_id_number TEXT,
      spouse_name TEXT,
      children_count INTEGER,
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
      last_verified_on TEXT,
      catalog_status TEXT NOT NULL DEFAULT 'CUSTOM'
        CHECK (catalog_status IN ('CUSTOM', 'ACTIVE_SEED', 'ARCHIVED_SEED'))
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
      application_name TEXT,
      applicant_name TEXT NOT NULL,
      applicant_age INTEGER,
      birth_date TEXT,
      sex TEXT,
      civil_status TEXT,
      contact_number TEXT,
      valid_id_type TEXT,
      valid_id_number TEXT,
      occupation TEXT,
      beneficiary_category TEXT,
      representative_name TEXT,
      representative_relationship TEXT,
      representative_contact TEXT,
      barangay_certificate_reference TEXT,
      spouse_name TEXT,
      children_count TEXT,
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
      rsbsa_number TEXT,
      agricultural_activity TEXT,
      farm_fishery_location TEXT,
      land_tenure TEXT,
      pcic_policy_number TEXT,
      sworn_attestation INTEGER DEFAULT 1,
      status TEXT DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS aid_ledger (
      aid_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES recovery_cases(case_id) ON DELETE CASCADE,
      aid_type TEXT NOT NULL CHECK (aid_type IN ('CASH', 'IN_KIND')),
      assistance_description TEXT NOT NULL DEFAULT '',
      amount_php REAL,
      quantity TEXT NOT NULL DEFAULT '',
      estimated_value_php REAL,
      source TEXT NOT NULL,
      received_on TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (
        (aid_type = 'CASH' AND amount_php > 0 AND estimated_value_php IS NULL)
        OR
        (aid_type = 'IN_KIND' AND amount_php IS NULL
          AND (estimated_value_php IS NULL OR estimated_value_php >= 0))
      )
    );

    CREATE INDEX IF NOT EXISTS idx_loss_records_case_id ON loss_records(case_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_plans_case_id ON recovery_plans(case_id);
    CREATE INDEX IF NOT EXISTS idx_aid_ledger_owner_case_date
      ON aid_ledger(user_id, case_id, received_on);

  `);

  const subsidyColumns = tableColumns('subsidies');
  if (!subsidyColumns.includes('source_url')) db.exec('ALTER TABLE subsidies ADD COLUMN source_url TEXT');
  if (!subsidyColumns.includes('last_verified_on')) db.exec('ALTER TABLE subsidies ADD COLUMN last_verified_on TEXT');
  ensureSubsidyCatalogStatusColumn(db);

  const userColumns = tableColumns('users');
  const userProfileColumns = [
    ['first_name', 'TEXT'],
    ['middle_name', 'TEXT'],
    ['last_name', 'TEXT'],
    ['mobile', 'TEXT'],
    ['province', 'TEXT'],
    ['city_municipality', 'TEXT'],
    ['barangay', 'TEXT'],
    ['purok_street', 'TEXT'],
    ['household_size', 'INTEGER'],
    ['civil_status', 'TEXT'],
    ['sex', 'TEXT'],
    ['birth_date', 'TEXT'],
    ['occupation', 'TEXT'],
    ['beneficiary_category', 'TEXT'],
    ['valid_id_number', 'TEXT'],
    ['spouse_name', 'TEXT'],
    ['children_count', 'INTEGER']
  ];
  for (const [columnName, columnDefinition] of userProfileColumns) {
    if (!userColumns.includes(columnName)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

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
  const applicationDetailColumns = [
    ['application_name', 'TEXT'],
    ['birth_date', 'TEXT'],
    ['sex', 'TEXT'],
    ['occupation', 'TEXT'],
    ['beneficiary_category', 'TEXT'],
    ['representative_name', 'TEXT'],
    ['representative_relationship', 'TEXT'],
    ['representative_contact', 'TEXT'],
    ['barangay_certificate_reference', 'TEXT'],
    ['spouse_name', 'TEXT'],
    ['children_count', 'TEXT'],
    ['rsbsa_number', 'TEXT'],
    ['agricultural_activity', 'TEXT'],
    ['farm_fishery_location', 'TEXT'],
    ['land_tenure', 'TEXT'],
    ['pcic_policy_number', 'TEXT']
  ];
  for (const [columnName, columnDefinition] of applicationDetailColumns) {
    if (!applicationColumns.includes(columnName)) {
      db.exec(`ALTER TABLE applications ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }
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

  migrateLegacyAssessments();

  // Version 1 is intentionally left untouched; its former blanket reset must never run again.
  const ownershipMigration = migrateOwnershipV2(db);
  if (ownershipMigration.applied) {
    if (ownershipMigration.repairedCases || ownershipMigration.repairedApplications) {
      console.warn(
        `[ownership migration v2] Cleared dangling user references: `
        + `${ownershipMigration.repairedCases} recovery case(s), `
        + `${ownershipMigration.repairedApplications} application(s).`
      );
    }
    if (ownershipMigration.conflictingOwnership || ownershipMigration.unresolvedOwnership) {
      console.warn(
        `[ownership migration v2] Preserved ownership values and case links for `
        + `${ownershipMigration.conflictingOwnership} application/case pair(s) with different owners `
        + `and ${ownershipMigration.unresolvedOwnership} pair(s) with one owner missing. `
        + 'No ownership was inferred or reconciled.'
      );
    }
  }

  importSubsidyCatalog(db, path.join(__dirname, 'data', 'subsidies.json'));
}

export default db;
