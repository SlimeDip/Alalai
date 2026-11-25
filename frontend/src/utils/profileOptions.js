// Dropdown choices shared by the profile form. The values match the application form so a
// saved profile pre-selects the same option there.
export const CIVIL_STATUS_OPTIONS = [
  'Kasal (Married)',
  'Walang Asawa (Single)',
  'Biyudo/Biyuda (Widowed)',
  'Solo Parent'
];

export const SEX_OPTIONS = ['Female', 'Male', 'Intersex', 'Prefer not to say'];

export const BENEFICIARY_CATEGORY_OPTIONS = [
  'Disaster-affected household',
  'Farmer',
  'Fisherfolk',
  'Livelihood worker / microenterprise'
];

export const OCCUPATION_SUGGESTIONS = [
  'Farmer',
  'Fisherfolk',
  'Vendor / sari-sari store owner',
  'Construction worker',
  'Driver / tricycle operator',
  'Employee (private)',
  'Government employee',
  'Self-employed',
  'Unemployed',
  'Student',
  'Homemaker'
];

// Keeps a previously saved free-text value selectable even if it isn't in the standard list.
export function withCurrentValue(options, current) {
  return current && !options.includes(current) ? [current, ...options] : options;
}
