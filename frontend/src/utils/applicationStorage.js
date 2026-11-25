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

export const APPLICATION_NAME_MAX_LENGTH = 80;

export function normalizeApplicationName(name) {
  return String(name ?? '').trim().slice(0, APPLICATION_NAME_MAX_LENGTH);
}

// A saved application is shown by its custom name when it has one, otherwise by its reference number.
export function getApplicationTitle(application) {
  return normalizeApplicationName(application?.application_name)
    || application?.reference_number
    || 'Untitled application';
}

// The aid program an application is for (applications are filed for one program).
export function getApplicationProgram(application) {
  const programs = Array.isArray(application?.applied_subsidies)
    ? application.applied_subsidies
    : [];
  return programs.find((program) => typeof program === 'string' && program.trim()) || '';
}

export function renameBrowserApplication(id, name) {
  const applicationName = normalizeApplicationName(name);
  const next = readSavedApplications().map((application) => {
    if (application.id !== id) return application;
    const { application_name: _previous, ...rest } = application;
    return applicationName ? { ...rest, application_name: applicationName } : rest;
  });
  writeSavedApplications(next);
  return next;
}

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

export async function renameAccountApplication(id, name, csrfToken) {
  const result = await request(`/api/applications/${encodeURIComponent(id)}/name`, {
    method: 'PATCH',
    csrfToken,
    body: JSON.stringify({ name: normalizeApplicationName(name) })
  });
  return result.data;
}
