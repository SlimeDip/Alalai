export async function runDamageAssessment(formPayload, csrfToken) {
  const body = new FormData();

  Object.entries(formPayload).forEach(([key, value]) => {
    if (key !== 'damageImage' && value !== undefined && value !== null) {
      body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
  });

  if (formPayload.damageImage) {
    body.append('damageImage', formPayload.damageImage);
  }

  let response;
  try {
    response = await fetch('/api/assessments', {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body
    });
  } catch (error) {
    const unavailable = new Error('The damage assessment service is unavailable.');
    unavailable.code = 'AI_UNAVAILABLE';
    unavailable.cause = error;
    throw unavailable;
  }

  const payload = await response.json().catch(() => ({}));
  if (response.ok && payload.success) {
    return payload.data;
  }

  const error = new Error(payload.error || 'The damage assessment could not be completed.');
  error.code = payload.code || 'ASSESSMENT_FAILED';
  error.isRelevanceError = error.code === 'IRRELEVANT_IMAGE';
  throw error;
}

export async function fetchOwnedRecoveryCases() {
  const cases = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const response = await fetch(`/api/assessments?limit=100&page=${page}`, {
      credentials: 'include'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to load recovery cases.');
    }
    cases.push(...(result.data || []));
    totalPages = result.pagination?.totalPages || 1;
    page += 1;
  }
  return cases;
}
