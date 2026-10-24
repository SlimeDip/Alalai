import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.join(__dirname, '..', 'data', 'subsidies.json');

function parseCatalog() {
  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new TypeError('backend/data/subsidies.json must contain an array.');
  }

  return parsed.map((subsidy) => ({
    ...subsidy,
    amount_display: Number(subsidy.amount_display) || 0,
    max_amount_php: Number(subsidy.max_amount_php) || 0,
    disaster_categories: Array.isArray(subsidy.disaster_categories) ? subsidy.disaster_categories : [],
    damage_types: Array.isArray(subsidy.damage_types) ? subsidy.damage_types : [],
    requirements: Array.isArray(subsidy.requirements) ? subsidy.requirements : [],
    application_steps: Array.isArray(subsidy.application_steps) ? subsidy.application_steps : []
  }));
}

export function getSubsidyCatalog() {
  return parseCatalog();
}

export function findSubsidy(reference) {
  return getSubsidyCatalog().find((subsidy) => subsidy.id === reference || subsidy.title === reference);
}
