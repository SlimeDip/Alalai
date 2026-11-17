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
    throw new Error(result.error || 'Unable to access the application tracker.');
  }
  return result;
}

export async function fetchTrackedApplications() {
  return (await request('/api/tracker')).data;
}

export async function createTrackedApplication(application, csrfToken) {
  return (await request('/api/tracker', {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(application)
  })).data;
}

export async function updateTrackedStatus(id, update, csrfToken) {
  return (await request(`/api/tracker/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify(update)
  })).data;
}

export async function createFollowUpReminder(id, reminder, csrfToken) {
  return (await request(`/api/tracker/${encodeURIComponent(id)}/reminders`, {
    method: 'POST',
    csrfToken,
    body: JSON.stringify(reminder)
  })).data;
}

export async function updateFollowUpReminder(id, update, csrfToken) {
  return (await request(`/api/tracker/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify(update)
  })).data;
}

export async function fetchOwnedRecoveryCases() {
  const cases = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await request(`/api/assessments?limit=100&page=${page}`);
    cases.push(...result.data);
    totalPages = result.pagination.totalPages;
    page += 1;
  }
  return cases;
}
