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
  residents, with search, reload, delete, and reprint actions. Guest applications
  remain explicitly browser-only; legacy browser records are not silently
  assigned to an account.
- **Application tracker** for individual program applications, with
  self-reported status history, submission dates, and in-app reminders.
- **Aid received ledger** with separate PHP cash totals and in-kind item records.
- **Private document vault** for case photos and supporting files, with
  account-checked upload, preview, download, metadata editing, and deletion.
- **Combined PDF packet download** generated from saved application and recovery
  case data plus selected same-case supporting files. Packets are user-prepared
  and do not prove official submission or approval.
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

`backend/data/subsidies.json` is authoritative for seed-managed subsidy records.
On startup, valid seed entries are inserted or updated by stable ID; custom
database records are preserved. Seed-managed records removed from the JSON are
archived instead of silently deleted. A missing, unreadable, or invalid seed
file leaves catalog records unchanged. Follow the instructions in
[`backend/data/README.md`](backend/data/README.md) before adding or changing
subsidy records.

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
  SQLite. Vault uploads are stored outside public directories. The default private
  storage   path is `backend/private-documents`; set `PRIVATE_DOCUMENTS_DIR` to a
  private, persistent directory in deployments. Storage is provisioned explicitly
  once, not automatically at startup. For a first-time development setup:

  ```powershell
  $env:PRIVATE_DOCUMENTS_DIR = "C:\path\to\private-documents"
  node backend/scripts/provisionPrivateDocuments.js --confirm
  ```

  For the default development path, omit the environment assignment before the
  provisioning command. The command creates the storage directory and lifecycle
  lock database after validating existing parent permissions. Normal startup
  requires both to exist and validates them without creating replacements. If a
  persistent volume is missing or inaccessible, startup fails before schema
  migrations run; restore the intended volume and restart, or deliberately
  provision a new empty volume only after confirming that is intended. Existing
  application document metadata and pending lifecycle records are not deleted
  when storage validation fails.

  The application is designed to defend stored documents from remote clients
  and from other local users/processes that do not run as the backend service
  identity. It does not defend against the service identity itself, an
  administrator/root, kernel compromise, or a trusted operator replacing the
  volume concurrently. On POSIX, startup rejects group/world-writable storage
  directories and parents, except sticky world-writable ancestors such as
  `/tmp`; storage directories must be owned by the service UID or root. On Windows,
  startup examines directory ACLs with Windows PowerShell/.NET. The storage
  root is rejected if untrusted principals can create or modify entries there;
  parent directories are rejected if untrusted principals can delete/replace
  path components or change their permissions. The fixed drive root is
  excluded from that ACL test and cannot itself be used as the storage root.
  Storage directories must be owned by the service identity or a trusted
  system principal. If ACL or reparse inspection is
  unavailable, validation fails closed. ACL group nesting and domain policy
  should still be reviewed by deployment administrators.

  The vault is not
  suitable for ephemeral deployments without a persistent volume and appropriate
  server filesystem permissions. Upload and deletion operations are recorded in
  `document_lifecycle_operations` before filesystem changes. Upload states are
  `UPLOAD_PENDING`, `UPLOAD_FILE_WRITTEN`, and `UPLOAD_METADATA_INSERTED`;
  deletion states are `DELETE_REQUESTED`, `DELETE_TOMBSTONE_LINKED`, and
  `DELETE_ORIGINAL_REMOVED`. Deletion finalization removes document metadata
  and its operation record in one transaction. Upload metadata is inserted
  transactionally with its lifecycle state; operation cleanup follows and is
  recoverable if interrupted. Earlier `recovery_document_cleanup` rows are
  preserved and reported for manual review.

  Recovery is an explicit maintenance operation, not part of startup. Point both
  environment variables at the intended database and private storage volume.
  Recovery takes the exclusive lifecycle lock and refuses to proceed while a
  backend upload/deletion or another recovery process is active; stopping the
  backend is still recommended for maintenance. Inspect proposed actions without
  changing anything:

  ```sql
  SELECT operation_id, operation_type, state, stored_name, tombstone_name, updated_at
  FROM document_lifecycle_operations
  ORDER BY created_at;
  ```

  ```powershell
  $env:DISASTER_RELIEF_DB_PATH = "C:\path\to\database.sqlite"
  $env:PRIVATE_DOCUMENTS_DIR = "C:\path\to\private-documents"
  node backend/scripts/recoverDocuments.js --dry-run
  ```

  After reviewing the output and taking appropriate backups, apply safe recovery
  actions with `node backend/scripts/recoverDocuments.js --apply`. The recovery
  service validates generated paths and recorded file identities. It skips
  missing-both-file deletion states, unassociated files, collisions, unavailable
  storage, and other inconsistent states for manual investigation. These states
  are deliberately not repaired by guessing. Recovery is not automatic at
  startup to avoid file changes while deployments may have an unavailable or
  incorrectly mounted storage volume.

  Deletion tombstones use operation-specific hard links created with exclusive
  filesystem link semantics, so an existing destination is not overwritten.
  Filesystems that do not support hard links cannot complete deletion; the
  operation remains pending for review. A process stopping after the tombstone
  is physically removed but before SQLite finalization leaves the document row
  and operation record intact, but both file names are absent; recovery reports
  this inherently ambiguous state for manual intervention.
  At startup, the configured storage root must already exist and is validated by
  checking each path component and its canonical filesystem path. Symlink and
  Windows reparse-point components are rejected. Windows reparse detection uses
  `.NET File.GetAttributes` and its `ReparsePoint` flag through Windows
  PowerShell because Node's documented `fs.Stats` fields do not provide a
  general reparse-point attribute. PowerShell/.NET reports the reparse-point
  flag, not every reparse tag's semantics; all flagged types are rejected.
  The root's
  canonical path and filesystem identity are pinned for the lifetime of the
  storage service; disappearance, replacement, or an inaccessible component
  fails closed rather than recreating the directory during an upload.
  Document names are checked against the generated `DOC-<UUID>.<extension>`
  format. Reads reject symlink/reparse-point leaves and non-regular files,
  open with `O_NOFOLLOW` where Node exposes it, and compare the opened handle's
  identity with path metadata before and after reading. Downloads, previews,
  packet inputs, lifecycle cleanup, and recovery use the private-storage
  service; reads used for downloads, previews, and packets also hold a shared
  lifecycle lock while collecting file contents.

  These checks reduce path substitution risk but are not a fully race-free
  substitute for descriptor-relative operations such as Linux `openat2` or
  Windows handle-relative APIs. On platforms without `O_NOFOLLOW`, reads use
  `lstat`/`fstat` comparisons and revalidation, which still leaves a narrow
  path race if an attacker can modify the private directory concurrently.
  Linking and unlinking also use path-based Node APIs after identity checks.
  Keep the storage root and its parent directories writable only by the service
  account; Windows reparse-point behavior and other filesystems require
  deployment-specific validation.
  The backend also provisions `.document-lifecycle-lock.sqlite` in the private
  storage root. Uploads and deletions hold shared SQLite locks for their full
  lifecycle; both dry-run and apply recovery take an exclusive lock before
  inspecting operations. Lock acquisition fails closed if the backend or
  another recovery process holds a conflicting lock. SQLite's local-filesystem
  locks are released by the operating system when a process exits, so no PID
  checks, stale-lock deletion, or lock-file replacement is used. Keep the lock
  database with the configured storage volume and do not manually remove it
  while the service may be running. This protocol is intended for local
  filesystems on Windows, macOS, and Linux; network filesystems and shared
  volumes have filesystem-specific locking behavior and are not supported or
  claimed safe. The lock does not prevent unrelated tools or processes that do
  not participate in this protocol from modifying files.
- Ownership migrations preserve existing valid user ownership and leave unowned
  records unassigned. Migration version 2 clears only references to nonexistent
  users and logs aggregate counts for linked application/case ownership
  inconsistencies without reassigning or unlinking records. Ownership erased by an
  earlier migration cannot be reconstructed automatically.
- The backend API serves API routes only; deploy `frontend/dist` separately
  behind a static web server for production.

  Run isolated backend API and storage tests with:

  ```bash
  npm --prefix backend test
  ```

  These tests use temporary SQLite and private-file directories; they do not
  modify the development database or call Gemini.
