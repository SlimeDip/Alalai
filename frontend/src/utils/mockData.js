export const mockSubsidies = [
  {
    id: 'lgu-barangay-relief',
    title: 'Barangay Emergency Relief',
    short_description: 'Immediate food and essential-item assistance for families affected by a disaster.',
    details: 'Bring the printed intake form and a valid ID to your barangay or local relief desk.',
    amount_display: 'Food and essential goods',
    max_amount_php: 10000,
    damage_types: 'general,food'
  },
  {
    id: 'dswd-esa-partial',
    title: 'Emergency Shelter Assistance',
    short_description: 'Support for households with partial damage to roofs, walls, or other structures.',
    details: 'Local offices may request proof of residence, damage photos, and a barangay certificate.',
    amount_display: 'Up to ₱40,000',
    max_amount_php: 40000,
    damage_types: 'structural,food'
  },
  {
    id: 'dswd-esa-total',
    title: 'Emergency Shelter Assistance — Total Loss',
    short_description: 'Priority shelter support for households whose homes are no longer safe to occupy.',
    details: 'Eligibility and final assistance are determined by the receiving government or relief office.',
    amount_display: 'Up to ₱100,000',
    max_amount_php: 100000,
    damage_types: 'structural,general'
  },
  {
    id: 'da-sure-aid',
    title: 'Agriculture and Livelihood Recovery',
    short_description: 'Potential support for damaged crops, livestock, fishing equipment, or farm inputs.',
    details: 'Prepare proof of livelihood and photos or certification of agricultural damage.',
    amount_display: 'Assessment-based',
    max_amount_php: 25000,
    damage_types: 'agricultural,livelihood'
  },
  {
    id: 'ndrrmc-livelihood-grant',
    title: 'Small Business Livelihood Support',
    short_description: 'Recovery assistance for damaged stores, tools, and other livelihood assets.',
    details: 'The receiving office may ask for an inventory of damaged items and proof of livelihood.',
    amount_display: 'Assessment-based',
    max_amount_php: 30000,
    damage_types: 'livelihood,general'
  }
];

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
