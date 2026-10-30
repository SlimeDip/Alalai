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
