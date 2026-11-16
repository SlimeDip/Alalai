import path from 'node:path';
import { pathToFileURL } from 'node:url';

function isWithin(root, candidate) {
  const relative = path.relative(root, path.resolve(candidate));
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

export async function load(url, context, nextLoad) {
  const backendDirectory = process.env.ALALAI_E2E_BACKEND_DIR;
  const targetUrl = backendDirectory
    ? pathToFileURL(path.join(backendDirectory, 'services', 'aiService.js')).href
    : '';
  if (url !== targetUrl) return nextLoad(url, context);

  const testRoot = process.env.ALALAI_E2E_TEST_ROOT;
  const databasePath = process.env.DISASTER_RELIEF_DB_PATH;
  const storagePath = process.env.PRIVATE_DOCUMENTS_DIR;
  if (
    process.env.NODE_ENV !== 'test'
    || process.env.ALALAI_TEST_ASSESSMENT_MOCK !== '1'
    || !testRoot
    || !databasePath
    || !storagePath
    || !isWithin(path.resolve(testRoot), databasePath)
    || !isWithin(path.resolve(testRoot), storagePath)
  ) {
    throw new Error('Synthetic assessment mock requires an isolated test database and document directory.');
  }

  const matcherUrl = pathToFileURL(path.join(backendDirectory, 'services', 'subsidyMatcher.js')).href;
  const catalogUrl = pathToFileURL(path.join(backendDirectory, 'services', 'subsidyCatalog.js')).href;
  return {
    format: 'module',
    shortCircuit: true,
    source: `
      import { attachSubsidyEligibility } from ${JSON.stringify(matcherUrl)};
      import { getSubsidyCatalog } from ${JSON.stringify(catalogUrl)};

      export function isGeminiConfigured() {
        return false;
      }

      export async function analyzeDisasterDamage({ disasterType }) {
        const analysis = {
          severity_level: 'Moderate',
          severity_score: 60,
          damage_summary: 'Synthetic test-only assessment: moderate typhoon roof damage.',
          damage_categories: ['structural_roofing'],
          estimated_cost_min: 6000,
          estimated_cost_max: 12000,
          urgency: 'Standard',
          recommended_aid_types: ['structural'],
          safety_precautions: ['Synthetic test response: avoid the damaged roof area.'],
          suggested_actions: ['Synthetic test response: review local assistance options.']
        };
        return attachSubsidyEligibility(analysis, disasterType, getSubsidyCatalog());
      }
    `
  };
}
