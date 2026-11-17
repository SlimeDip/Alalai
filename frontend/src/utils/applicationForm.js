function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function parseSubsidies(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createApplicationFormData(initialData, user) {
  const record = initialData?.fullRecord || {};
  const applicant = initialData?.applicant || record;
  const assessment = initialData?.assessment || record.ai_response || {};
  const profile = (initialData?.fullRecord || user?.isGuest) ? {} : (user || {});
  const subsidy = initialData?.subsidy || {};
  const savedSubsidies = parseSubsidies(record.applied_subsidies);
  const selectedCaseId = firstValue(initialData?.caseId, record.case_id);

  return {
    id: firstValue(record.id, record.application_id, ''),
    reference_number: firstValue(record.reference_number, ''),
    case_id: typeof selectedCaseId === 'string' && selectedCaseId.startsWith('APP-')
      ? null
      : selectedCaseId ?? null,
    applicant_name: firstValue(
      applicant.applicantName,
      applicant.applicant_name,
      profile.name,
      ''
    ),
    applicant_age: firstValue(applicant.applicantAge, applicant.applicant_age, ''),
    birth_date: firstValue(applicant.birthDate, applicant.birth_date, ''),
    sex: firstValue(applicant.sex, profile.sex, ''),
    civil_status: firstValue(
      applicant.civilStatus,
      applicant.civil_status,
      profile.civilStatus,
      'Kasal (Married)'
    ),
    contact_number: firstValue(
      applicant.contactNumber,
      applicant.contact_number,
      profile.mobile,
      ''
    ),
    valid_id_type: firstValue(
      applicant.validIdType,
      applicant.valid_id_type,
      'Philippine National ID (PhilSys)'
    ),
    valid_id_number: firstValue(
      applicant.idNumber,
      applicant.valid_id_number,
      profile.idNumber,
      ''
    ),
    province: firstValue(applicant.province, profile.province, ''),
    city_municipality: firstValue(
      applicant.cityMunicipality,
      applicant.city_municipality,
      profile.cityMunicipality,
      ''
    ),
    barangay: firstValue(applicant.barangay, profile.barangay, ''),
    purok_street: firstValue(
      applicant.purokStreet,
      applicant.purok_street,
      profile.purokStreet,
      ''
    ),
    household_members_count: firstValue(
      applicant.householdSize,
      applicant.household_members_count,
      profile.householdSize,
      1
    ),
    occupation: firstValue(
      applicant.occupation,
      profile.occupation,
      record.occupation,
      ''
    ),
    beneficiary_category: firstValue(
      applicant.beneficiaryCategory,
      profile.beneficiaryCategory,
      record.beneficiary_category,
      ''
    ),
    representative_name: firstValue(record.representative_name, ''),
    representative_relationship: firstValue(record.representative_relationship, ''),
    representative_contact: firstValue(record.representative_contact, ''),
    barangay_certificate_reference: firstValue(record.barangay_certificate_reference, ''),
    spouse_name: firstValue(
      applicant.spouseName,
      applicant.spouse_name,
      profile.spouseName,
      'N/A'
    ),
    children_count: firstValue(
      applicant.childrenCount,
      applicant.children_count,
      profile.childrenCount,
      '0'
    ),
    disaster_type: firstValue(
      applicant.disasterType,
      applicant.disaster_type,
      assessment.disaster_type,
      ''
    ),
    incident_date: firstValue(
      applicant.incidentDate,
      applicant.incident_date,
      record.incident_date,
      new Date().toISOString().split('T')[0]
    ),
    damage_level: firstValue(
      assessment.severity_level,
      assessment.damage_level,
      record.damage_level,
      ''
    ),
    damage_summary: firstValue(
      assessment.damage_summary,
      applicant.damageDescription,
      record.damage_summary,
      ''
    ),
    applied_subsidies: subsidy.title
      ? [subsidy.title]
      : savedSubsidies,
    estimated_damage_php: firstValue(
      assessment.estimated_cost_max,
      record.estimated_damage_php,
      0
    ),
    requested_amount_php: firstValue(
      subsidy.max_amount_php,
      record.requested_amount_php,
      0
    ),
    declared_needs: firstValue(
      record.declared_needs,
      (assessment.recommended_aid_types || assessment.damage_categories || []).join(', '),
      ''
    ),
    rsbsa_number: firstValue(
      applicant.rsbsaNumber,
      applicant.rsbsa_number,
      record.rsbsa_number,
      ''
    ),
    agricultural_activity: firstValue(
      applicant.agriculturalActivity,
      applicant.agricultural_activity,
      record.agricultural_activity,
      ''
    ),
    farm_fishery_location: firstValue(
      applicant.farmFisheryLocation,
      applicant.farm_fishery_location,
      record.farm_fishery_location,
      ''
    ),
    land_tenure: firstValue(
      applicant.landTenure,
      applicant.land_tenure,
      record.land_tenure,
      ''
    ),
    pcic_policy_number: firstValue(
      applicant.pcicPolicyNumber,
      applicant.pcic_policy_number,
      record.pcic_policy_number,
      ''
    ),
    sworn_attestation: false,
    status: firstValue(record.status, 'DRAFT')
  };
}

export function getAttachmentChecklist(documents) {
  const caseDocuments = Array.isArray(documents) ? documents : [];

  return {
    identityFiles: caseDocuments.filter((document) => document.category === 'IDENTITY'),
    damagePhotoFiles: caseDocuments.filter((document) => document.category === 'DAMAGE_PHOTO'),
    otherFiles: caseDocuments.filter(
      (document) => !['IDENTITY', 'DAMAGE_PHOTO'].includes(document.category)
    )
  };
}

export function getApplicationDocuments(documents, applicationId) {
  const caseDocuments = Array.isArray(documents) ? documents : [];
  return caseDocuments.filter((document) => (
    !document.application_id || document.application_id === applicationId
  ));
}
