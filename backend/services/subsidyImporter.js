import fs from 'node:fs';

const requiredTextFields = [
  'id',
  'agency',
  'title',
  'short_description',
  'details',
  'min_severity',
  'contact_info',
  'source_url',
  'last_verified_on'
];
const requiredArrayFields = [
  'disaster_categories',
  'damage_types',
  'requirements',
  'application_steps'
];
const allowedFields = new Set([
  ...requiredTextFields,
  ...requiredArrayFields,
  'amount_display',
  'max_amount_php',
  'application_channel'
]);

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateSubsidyCatalog(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('Catalog must contain an array.');
  }
  if (!records.length) {
    throw new TypeError('Catalog must contain at least one verified entry.');
  }

  const ids = new Set();
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`Catalog entry ${index + 1} must be an object.`);
    }
    if (Object.keys(record).some((field) => !allowedFields.has(field))) {
      throw new TypeError(`Catalog entry ${index + 1} contains an unsupported field.`);
    }
    for (const field of requiredTextFields) {
      if (typeof record[field] !== 'string' || !record[field].trim()) {
        throw new TypeError(`Catalog entry ${index + 1} has an invalid ${field}.`);
      }
    }
    if (
      record.id !== record.id.trim()
      || record.id === 'replace-with-stable-program-id'
      || ids.has(record.id)
    ) {
      throw new TypeError(`Catalog entry ${index + 1} has a duplicate or placeholder ID.`);
    }
    ids.add(record.id);

    for (const field of ['amount_display', 'max_amount_php']) {
      if (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || record[field] < 0) {
        throw new TypeError(`Catalog entry ${index + 1} has an invalid ${field}.`);
      }
    }
    let sourceUrl;
    try {
      sourceUrl = new URL(record.source_url);
    } catch {
      throw new TypeError(`Catalog entry ${index + 1} has an invalid source_url.`);
    }
    if (
      !['http:', 'https:'].includes(sourceUrl.protocol)
      || !sourceUrl.hostname
      || record.source_url.includes('.example')
    ) {
      throw new TypeError(`Catalog entry ${index + 1} has an invalid source_url.`);
    }
    if (!isValidDate(record.last_verified_on)) {
      throw new TypeError(`Catalog entry ${index + 1} has invalid verification metadata.`);
    }
    for (const field of requiredArrayFields) {
      if (
        !Array.isArray(record[field])
        || record[field].some((value) => typeof value !== 'string' || !value.trim())
      ) {
        throw new TypeError(`Catalog entry ${index + 1} has an invalid ${field}.`);
      }
    }
    if (
      record.application_channel !== undefined
      && (typeof record.application_channel !== 'string' || !record.application_channel.trim())
    ) {
      throw new TypeError(`Catalog entry ${index + 1} has an invalid application_channel.`);
    }
  }

  return records;
}

export function ensureSubsidyCatalogStatusColumn(db) {
  const columns = db.pragma('table_info(subsidies)').map((column) => column.name);
  if (!columns.includes('catalog_status')) {
    db.exec(`
      ALTER TABLE subsidies
      ADD COLUMN catalog_status TEXT NOT NULL DEFAULT 'CUSTOM'
      CHECK (catalog_status IN ('CUSTOM', 'ACTIVE_SEED', 'ARCHIVED_SEED'))
    `);
  }
}

export function synchronizeSubsidyCatalog(db, records) {
  const validatedRecords = validateSubsidyCatalog(records);

  return db.transaction((items) => {
    ensureSubsidyCatalogStatusColumn(db);
    const seedIds = new Set(items.map((item) => item.id));
    const currentSeedRows = db.prepare(`
      SELECT subsidy_id FROM subsidies WHERE catalog_status = 'ACTIVE_SEED'
    `).all();
    const archive = db.prepare(`
      UPDATE subsidies SET catalog_status = 'ARCHIVED_SEED'
      WHERE subsidy_id = ? AND catalog_status = 'ACTIVE_SEED'
    `);
    for (const row of currentSeedRows) {
      if (!seedIds.has(row.subsidy_id)) archive.run(row.subsidy_id);
    }

    const upsert = db.prepare(`
      INSERT INTO subsidies (
        subsidy_id, agency, title, short_description, details, max_amount_php,
        amount_display, disaster_categories, damage_types, min_severity,
        requirements, contact_info, application_steps, source_url,
        last_verified_on, catalog_status
      ) VALUES (
        @id, @agency, @title, @short_description, @details, @max_amount_php,
        @amount_display, @disaster_categories, @damage_types, @min_severity,
        @requirements, @contact_info, @application_steps, @source_url,
        @last_verified_on, 'ACTIVE_SEED'
      )
      ON CONFLICT(subsidy_id) DO UPDATE SET
        agency = excluded.agency,
        title = excluded.title,
        short_description = excluded.short_description,
        details = excluded.details,
        max_amount_php = excluded.max_amount_php,
        amount_display = excluded.amount_display,
        disaster_categories = excluded.disaster_categories,
        damage_types = excluded.damage_types,
        min_severity = excluded.min_severity,
        requirements = excluded.requirements,
        contact_info = excluded.contact_info,
        application_steps = excluded.application_steps,
        source_url = excluded.source_url,
        last_verified_on = excluded.last_verified_on,
        catalog_status = 'ACTIVE_SEED'
    `);

    for (const item of items) {
      upsert.run({
        ...item,
        max_amount_php: item.max_amount_php,
        amount_display: item.amount_display,
        disaster_categories: JSON.stringify(item.disaster_categories),
        damage_types: JSON.stringify(item.damage_types),
        requirements: JSON.stringify(item.requirements),
        application_steps: JSON.stringify(item.application_steps)
      });
    }
    return { imported: items.length, archived: currentSeedRows.filter((row) => !seedIds.has(row.subsidy_id)).length };
  })(validatedRecords);
}

export function importSubsidyCatalog(db, catalogPath, logger = console) {
  let records;
  try {
    records = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    validateSubsidyCatalog(records);
  } catch (error) {
    logger.error(`Unable to import subsidy catalog; existing records were left unchanged: ${error.message}`);
    return { success: false, error };
  }

  try {
    return { success: true, ...synchronizeSubsidyCatalog(db, records) };
  } catch (error) {
    logger.error(`Unable to import subsidy catalog; transaction rolled back: ${error.message}`);
    return { success: false, error };
  }
}
