export async function generateAndDownloadPacket(applicationId, documentIds, csrfToken) {
  const response = await fetch('/api/packets', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({
      application_id: applicationId,
      document_ids: documentIds
    })
  });
  if (!response.ok) {
    let message = 'Unable to generate the saved recovery packet.';
    try {
      const result = await response.json();
      message = result.error || message;
    } catch {}
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/pdf')) {
    throw new Error('The server did not return a PDF packet.');
  }
  const filename = response.headers.get('content-disposition')
    ?.match(/filename="([^"]+)"/)?.[1] || 'Alalai-recovery-packet.pdf';
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
