async function request(path, { csrfToken, ...options } = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
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
    throw new Error(result.error || 'Unable to access the document vault.');
  }
  return result;
}

export async function fetchCaseDocuments(caseId) {
  return (await request(`/api/documents?case_id=${encodeURIComponent(caseId)}`)).data;
}

export function uploadCaseDocument({
  caseId,
  applicationId,
  category,
  description,
  file,
  csrfToken,
  onProgress
}) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('case_id', caseId);
    if (applicationId) formData.append('application_id', applicationId);
    formData.append('category', category);
    formData.append('description', description);
    formData.append('document', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.withCredentials = true;
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      let result;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('The server returned an invalid response.'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !result.success) {
        reject(new Error(result.error || 'Unable to upload the document.'));
        return;
      }
      resolve(result.data);
    });
    xhr.addEventListener('error', () => reject(new Error('Network error while uploading the document.')));
    xhr.addEventListener('abort', () => reject(new Error('Document upload was cancelled.')));
    xhr.send(formData);
  });
}

export async function updateDocumentMetadata(id, metadata, csrfToken) {
  return (await request(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    csrfToken,
    body: JSON.stringify(metadata)
  })).data;
}

export async function deleteDocument(id, csrfToken) {
  await request(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    csrfToken
  });
}

export function documentPreviewUrl(id) {
  return `/api/documents/${encodeURIComponent(id)}/preview`;
}

export async function downloadDocument(id, filename) {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}/download`, {
    credentials: 'include'
  });
  if (!response.ok) {
    let error = 'Unable to download the document.';
    try {
      error = (await response.json()).error || error;
    } catch {}
    throw new Error(error);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
