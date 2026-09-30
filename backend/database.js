import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'disaster_relief.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subsidies (
      id TEXT PRIMARY KEY,
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
      application_steps TEXT NOT NULL -- JSON array
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      applicant_name TEXT,
      contact_number TEXT,
      province TEXT,
      city_municipality TEXT,
      barangay TEXT,
      disaster_type TEXT NOT NULL,
      incident_date TEXT,
      raw_description TEXT NOT NULL,
      severity_level TEXT NOT NULL,
      severity_score INTEGER DEFAULT 0,
      damage_categories TEXT NOT NULL, -- JSON array
      estimated_cost_min REAL DEFAULT 0,
      estimated_cost_max REAL DEFAULT 0,
      recommended_subsidies TEXT NOT NULL, -- JSON array
      safety_precautions TEXT NOT NULL, -- JSON array
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      assessment_id TEXT,
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
  `);

  // Seed default Philippine government disaster subsidies if table is empty
  const countRow = db.prepare('SELECT COUNT(*) as count FROM subsidies').get();
  if (countRow.count === 0) {
    seedSubsidies();
  }
}

function seedSubsidies() {
  const insert = db.prepare(`
    INSERT INTO subsidies (
      id, agency, title, short_description, details, max_amount_php,
      amount_display, disaster_categories, damage_types, min_severity,
      requirements, contact_info, application_steps
    ) VALUES (
      @id, @agency, @title, @short_description, @details, @max_amount_php,
      @amount_display, @disaster_categories, @damage_types, @min_severity,
      @requirements, @contact_info, @application_steps
    )
  `);

  const initialSubsidies = [
    {
      id: 'dswd-esa-total',
      agency: 'DSWD',
      title: 'Emergency Shelter Assistance (ESA) - Totally Damaged',
      short_description: 'Direct financial assistance for families whose houses were completely collapsed or washed away by disaster.',
      details: 'DSWD shelter rebuilding subsidy granted to low-income household heads whose primary residential dwellings are confirmed completely uninhabitable or demolished due to typhoon winds, storm surges, flash floods, or seismic activity.',
      max_amount_php: 30000,
      amount_display: '₱30,000 one-time shelter reconstruction grant',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide, Fire',
      damage_types: 'structural,roofing,wall_collapse',
      min_severity: 'Severe',
      requirements: JSON.stringify([
        'Barangay Certificate of Disaster Damage / Indigency',
        'Valid Philippine National ID / Voter ID / Senior Citizen ID',
        'Geo-tagged photo of totally damaged residential house',
        'DSWD Disaster Assistance Family Access Card (DAFAC) or Intake Sheet',
        'Proof of house ownership or land occupancy permission'
      ]),
      contact_info: 'DSWD Disaster Response Operations: (+63 2) 8931-8101 / local MSWDO office',
      application_steps: JSON.stringify([
        'Present the printed intake application to your local Barangay Hall / Disaster Desk.',
        'Barangay Social Worker validates the structural damage on-site.',
        'Application endorsed to City/Municipal Social Welfare and Development Office (CSWDO/MSWDO).',
        'Disbursement schedule released through LGU payroll or LandBank payout.'
      ])
    },
    {
      id: 'dswd-esa-partial',
      agency: 'DSWD',
      title: 'Emergency Shelter Assistance (ESA) - Partially Damaged',
      short_description: 'Cash support to purchase corrugated roofing sheets, timber, and wall repair materials for partially damaged homes.',
      details: 'Assistance for households with repairable damages such as detached galvanized iron roofing, damaged walls, or flooded flooring that can be restored with emergency construction materials.',
      max_amount_php: 10000,
      amount_display: '₱10,000 shelter repair subsidy',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide',
      damage_types: 'structural,roofing,flooring',
      min_severity: 'Moderate',
      requirements: JSON.stringify([
        'Barangay Certification of Partial Calamity Damage',
        'Government-issued identification card (PhilSys, PhilHealth, Postal, or Senior ID)',
        'Printed intake form with itemized damage estimate',
        'Clear photographs showing partial roof or wall damage'
      ]),
      contact_info: 'Municipal Social Welfare & Development Office (MSWDO) Helpdesk',
      application_steps: JSON.stringify([
        'Complete this intake form and print copies for your records and the Barangay.',
        'Request validation signature from Barangay Captain or Disaster Focal Person.',
        'Submit to the MSWDO intake counter during designated distribution cycles.'
      ])
    },
    {
      id: 'dswd-aics',
      agency: 'DSWD',
      title: 'Assistance to Individuals in Crisis Situations (AICS)',
      short_description: 'Immediate cash assistance for basic necessities, food packs, medicine, and emergency transportation.',
      details: 'Social safety net aid provided to vulnerable families and individuals suddenly displaced, injured, or stripped of immediate survival funds following natural hazards.',
      max_amount_php: 10000,
      amount_display: '₱3,000 to ₱10,000 emergency cash aid',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide, Fire, Volcanic Eruption',
      damage_types: 'general,food,medical,displacement',
      min_severity: 'Low',
      requirements: JSON.stringify([
        'Valid Government ID or Barangay Certificate of Residency',
        'Medical certificate / prescription (if injured during calamity)',
        'Barangay Certificate of Indigency / Calamity Impact',
        'General Intake Sheet signed by social worker'
      ]),
      contact_info: 'DSWD Crisis Intervention Unit (CIU) Hotline: (02) 8951-2803',
      application_steps: JSON.stringify([
        'Visit nearest DSWD Field Office, Satellite Office, or LGU evacuation center.',
        'Submit this filled-out disaster form and valid ID for social worker interview.',
        'Claim cash aid via on-site payout counter.'
      ])
    },
    {
      id: 'da-sure-aid',
      agency: 'Department of Agriculture (DA)',
      title: 'Survival and Recovery (SURE) Calamity Aid & Loan',
      short_description: 'Emergency production loan and cash grants for smallholder farmers and municipal fisherfolk affected by typhoons or drought.',
      details: 'Zero-interest, non-collateral emergency credit and rehabilitation capital for registered small farmers and fisherfolk to replant submerged crops, repair damaged bancas, or restock lost poultry/livestock.',
      max_amount_php: 25000,
      amount_display: 'Up to ₱25,000 zero-interest recovery assistance',
      disaster_categories: 'Typhoon, Flood, Drought, Volcanic Eruption',
      damage_types: 'agricultural,crops,livestock,fisheries',
      min_severity: 'Moderate',
      requirements: JSON.stringify([
        'Registry System for Basic Sectors in Agriculture (RSBSA) registration proof',
        'Barangay certification proving crop flooding, boat loss, or livestock mortality',
        'Valid ID with signature',
        'Field inspection report by Municipal Agriculture Officer (MAO)'
      ]),
      contact_info: 'DA Agricultural Credit Policy Council (ACPC): info@acpc.gov.ph',
      application_steps: JSON.stringify([
        'File incident report with Municipal Agriculture Office (MAO).',
        'Attach this printed assessment to verify agricultural impact.',
        'Processing through accredited rural bank or DA lending conduit.'
      ])
    },
    {
      id: 'pagibig-calamity',
      agency: 'Pag-IBIG Fund',
      title: 'Pag-IBIG Calamity Loan Program',
      short_description: 'Low-interest calamity loan (5.95% per annum) for active Pag-IBIG members living in areas under State of Calamity.',
      details: 'Borrow up to 80% of total Pag-IBIG Regular Savings with a deferred 3-month grace period and up to 36 months repayment tenure for members affected by disasters.',
      max_amount_php: 50000,
      amount_display: 'Up to 80% of Accumulated Value (Est. ₱20,000 - ₱50,000)',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide, Fire',
      damage_types: 'structural,general,livelihood',
      min_severity: 'Low',
      requirements: JSON.stringify([
        'At least 24 monthly membership savings contributions',
        'Proof of income / payslip / certificate of employment or business permit',
        'One (1) valid government-issued ID',
        'Proof that residence or workplace is in a local government declared State of Calamity'
      ]),
      contact_info: 'Pag-IBIG Hotline: (02) 8724-4244 | contactus@pagibigfund.gov.ph',
      application_steps: JSON.stringify([
        'Fill out official Pag-IBIG Calamity Loan Application Form (HDF-040).',
        'Attach this damage assessment slip for verification.',
        'Submit online via Virtual Pag-IBIG portal or at any branch office.'
      ])
    },
    {
      id: 'sss-clap',
      agency: 'Social Security System (SSS)',
      title: 'SSS Calamity Loan Assistance Program (CLAP)',
      short_description: 'One-month salary loan equivalent for actively paying SSS members residing in calamity-declared provinces or cities.',
      details: 'Low interest rate of 10% per annum with 24 equal monthly installments for private sector employees, self-employed individuals, and voluntary members affected by declared calamities.',
      max_amount_php: 40000,
      amount_display: 'Up to 1-month equivalent salary loan',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide, Fire',
      damage_types: 'general,structural,livelihood',
      min_severity: 'Low',
      requirements: JSON.stringify([
        'At least 36 monthly contributions (6 posted within last 12 months)',
        'Registered My.SSS online account with linked disbursement account',
        'Barangay certification or NDRRMC State of Calamity declaration coverage'
      ]),
      contact_info: 'SSS Helpdesk: 1455 / member_relations@sss.gov.ph',
      application_steps: JSON.stringify([
        'Log in to your My.SSS online account portal.',
        'Select E-Services -> Apply for Calamity Loan.',
        'Keep this printed assessment as supporting reference for company HR / SSS branch.'
      ])
    },
    {
      id: 'lgu-barangay-relief',
      agency: 'Barangay & LGU Quick Response',
      title: 'Local Government Calamity Voucher & Emergency Food Supply',
      short_description: 'Immediate rice rations, hygiene kits, potable water, and local barangay reconstruction vouchers.',
      details: 'Immediate first-line assistance funded by the 5% Local Disaster Risk Reduction and Management Fund (LDRRMF) for all affected residents regardless of employment status.',
      max_amount_php: 5000,
      amount_display: '₱2,000 - ₱5,000 grocery pack & emergency material coupon',
      disaster_categories: 'Typhoon, Flood, Earthquake, Landslide, Fire, Volcanic Eruption',
      damage_types: 'general,food,immediate_relief',
      min_severity: 'Low',
      requirements: JSON.stringify([
        'Barangay residency record or presentation of any Philippine ID',
        'Physical presence at designated Barangay Evacuation / Relief Center'
      ]),
      contact_info: 'Local Barangay Captain / Purok Leader / BDRRMC Office',
      application_steps: JSON.stringify([
        'Bring this printed Disaster Intake Slip directly to your Purok or Barangay Disaster Desk.',
        'Receive immediate relief voucher and scheduled relief bundle.'
      ])
    },
    {
      id: 'ndrrmc-livelihood-grant',
      agency: 'NDRRMC / DTI Livelihood Seeding',
      title: 'Pangkabuhayan sa Pagbangon at Ginhawa (PPG) Micro-grant',
      short_description: 'Emergency livelihood seed kits and financial grants for micro-entrepreneurs whose sari-sari stores, workshops, or market stalls were damaged.',
      details: 'Support package providing goods, raw materials, or equipment worth ₱8,000 to ₱15,000 to assist calamity-affected sari-sari store owners, market vendors, and community service providers in restoring their livelihood.',
      max_amount_php: 15000,
      amount_display: '₱8,000 - ₱15,000 livelihood package / equipment kit',
      disaster_categories: 'Typhoon, Flood, Earthquake, Fire',
      damage_types: 'livelihood,business_inventory,equipment',
      min_severity: 'Moderate',
      requirements: JSON.stringify([
        'Barangay Micro-Business Enterprise (BMBE) or Barangay Business Permit',
        'Valid ID of store/business owner',
        'Photos of flooded/ruined inventory, damaged store counter or tools',
        'List of ruined business assets'
      ]),
      contact_info: 'DTI Negosyo Center / LGU Economic Enterprise Office',
      application_steps: JSON.stringify([
        'Submit this intake sheet detailing business loss to your municipal DTI Negosyo Center.',
        'Attend mandatory one-session Enterprise Rehabilitation Briefing.',
        'Claim business inventory voucher or equipment replenishment kit.'
      ])
    }
  ];

  const transaction = db.transaction((subsidies) => {
    for (const item of subsidies) {
      insert.run(item);
    }
  });

  transaction(initialSubsidies);
}

export default db;
