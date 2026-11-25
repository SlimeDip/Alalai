// Programs a person has applied to for one recovery case, used as the aid "source" choices.
export function getAppliedProgramSources(applications, caseId) {
  if (!caseId || !Array.isArray(applications)) return [];
  const programs = [];
  for (const application of applications) {
    if ((application?.case_id || application?.assessment_id) !== caseId) continue;
    for (const program of application.applied_subsidies || []) {
      const title = typeof program === 'string' ? program.trim() : '';
      if (title && !programs.includes(title)) programs.push(title);
    }
  }
  return programs;
}
