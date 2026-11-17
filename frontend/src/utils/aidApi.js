async function request(path, { csrfToken, ...options } = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers
    }
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Unable to access the aid ledger.');
  }
  return result;
}

export async function fetchAidLedger(caseId = '') {
  const query = caseId ? `?case_id=${encodeURIComponent(caseId)}` : '';
  return request(`/api/aid${query}`);
}

export async function createAidRecord(record, csrfToken) {
  return (await request('/api/aid', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(record)
  })).data;
}

export async function updateAidRecord(id, record, csrfToken) {
  return (await request(`/api/aid/${encodeURIComponent(id)}`, {
    method: 'PUT',
    csrfToken,
    body: JSON.stringify(record)
  })).data;
}

export async function deleteAidRecord(id, csrfToken) {
  await request(`/api/aid/${encodeURIComponent(id)}`, { method: 'DELETE', csrfToken });
}
