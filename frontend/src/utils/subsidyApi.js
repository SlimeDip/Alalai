export async function fetchSubsidyCatalog() {
  const response = await fetch('/api/subsidies');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success || !Array.isArray(payload.subsidies)) {
    throw new Error(payload.error || 'Unable to load the aid programs.');
  }
  return payload.subsidies;
}
