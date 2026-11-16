export const readSavedApplications = () => {
  try {
    const saved = localStorage.getItem('alalai_applications');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const writeSavedApplications = (applications) => {
  localStorage.setItem('alalai_applications', JSON.stringify(applications));
};

export const saveBrowserApplication = (application) => {
  const id = application.id || `LOCAL-${Date.now().toString(36).toUpperCase()}`;
  const referenceNumber = application.reference_number
    || `AL-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const savedApplication = {
    ...application,
    id,
    reference_number: referenceNumber,
    saved_at: new Date().toISOString()
  };
  const existing = readSavedApplications().filter((item) => item.id !== id);
  writeSavedApplications([savedApplication, ...existing]);
  return savedApplication;
};

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
    throw new Error(result.error || 'Unable to access saved applications.');
  }
  return result;
}

export async function fetchAccountApplications() {
  const applications = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await request(`/api/applications?limit=100&page=${page}`);
    applications.push(...result.data);
    totalPages = result.pagination.totalPages;
    page += 1;
  }
  return applications;
}

export async function saveAccountApplication(application, csrfToken) {
  const existingId = application.id?.startsWith('APP-') ? application.id : null;
  const result = await request(
    existingId ? `/api/applications/${encodeURIComponent(existingId)}` : '/api/applications',
    {
      method: existingId ? 'PUT' : 'POST',
      csrfToken,
      body: JSON.stringify(application)
    }
  );
  return result.data;
}

export async function deleteAccountApplication(id, csrfToken) {
  await request(`/api/applications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    csrfToken
  });
}
