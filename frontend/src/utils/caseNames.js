// Custom display names for recovery cases, kept in this browser.
const KEY = 'alalai_case_names';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCaseNames() {
  return readAll();
}

export function saveCaseName(caseId, name) {
  const all = readAll();
  const trimmed = String(name || '').trim().slice(0, 80);
  if (trimmed) all[caseId] = trimmed;
  else delete all[caseId];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
  return all;
}

export function getCaseTitle(recoveryCase, names = readAll()) {
  return names[recoveryCase?.case_id] || recoveryCase?.disaster_type || 'Disaster type not recorded';
}
