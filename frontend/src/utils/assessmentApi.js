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
