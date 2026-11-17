import pdfLib from 'pdf-lib';

const { PDFDocument, StandardFonts, rgb } = pdfLib;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const MAX_PAGES = 120;
const DISCLAIMER = 'USER-PREPARED DOCUMENT PACKET — NOT PROOF OF OFFICIAL SUBMISSION OR APPROVAL.';

function safeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/₱/g, 'PHP ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\n]/g, '?');
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function wrapText(text, font, size, maximumWidth) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maximumWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let fragment = '';
    for (const character of word) {
      const next = fragment + character;
      if (fragment && font.widthOfTextAtSize(next, size) > maximumWidth) {
        lines.push(fragment);
        fragment = character;
      } else {
        fragment = next;
      }
    }
    line = fragment;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function createWriter(pdf, regularFont, boldFont) {
  let page;
  let y;
  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensureSpace = (height) => {
    if (!page || y - height < 42) {
      if (pdf.getPageCount() >= MAX_PAGES - 1) {
        throw new RangeError('The saved application text exceeds the packet page limit.');
      }
      addPage();
    }
  };
  const paragraph = (value, { bold = false, size = 10, gap = 5 } = {}) => {
    const font = bold ? boldFont : regularFont;
    const paragraphs = safeText(value).split(/\r?\n/);
    for (const text of paragraphs) {
      for (const line of wrapText(text, font, size, PAGE_WIDTH - MARGIN * 2)) {
        ensureSpace(size + gap);
        page.drawText(line, {
          x: MARGIN,
          y,
          size,
          font,
          color: rgb(0.12, 0.16, 0.22)
        });
        y -= size + gap;
      }
      y -= 2;
    }
  };
  const heading = (value) => {
    ensureSpace(28);
    y -= 6;
    page.drawText(safeText(value), {
      x: MARGIN,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.08, 0.24, 0.38)
    });
    y -= 24;
  };
  addPage();
  return { addPage, paragraph, heading, get page() { return page; } };
}

function address(record) {
  return [
    record.purok_street,
    record.barangay,
    record.city_municipality,
    record.province
  ].filter(Boolean).join(', ');
}

function costRange(minimum, maximum) {
  if (minimum == null && maximum == null) return 'Not recorded';
  return `PHP ${Number(minimum || 0).toLocaleString()} - ${Number(maximum || 0).toLocaleString()}`;
}

function addApplicationAndCase(writer, application, recoveryCase, losses) {
  writer.paragraph('ALALAI — RECOVERY DOCUMENT PACKET', { bold: true, size: 18, gap: 8 });
  writer.paragraph(DISCLAIMER, { bold: true, size: 11, gap: 8 });
  writer.paragraph(`Saved application reference: ${application.reference_number}`, { bold: true });

  writer.heading('Completed application form');
  const applicationFields = [
    ['Applicant', application.applicant_name],
    ['Age / birth date / sex', [
      application.applicant_age,
      application.birth_date,
      application.sex
    ].filter(Boolean).join(' / ')],
    ['Civil status', application.civil_status],
    ['Contact', application.contact_number],
    ['Address', address(application)],
    ['Occupation / beneficiary category', [application.occupation, application.beneficiary_category].filter(Boolean).join(' / ')],
    ['Valid ID', [application.valid_id_type, application.valid_id_number].filter(Boolean).join(' — ')],
    ['Household members', application.household_members_count],
    ['Spouse / children', [application.spouse_name, application.children_count].filter(Boolean).join(' / ')],
    ['Representative', [
      application.representative_name,
      application.representative_relationship,
      application.representative_contact
    ].filter(Boolean).join(' / ')],
    ['Disaster / incident date', [application.disaster_type, application.incident_date].filter(Boolean).join(' / ')],
    ['Damage level', application.damage_level],
    ['Application damage narrative', application.damage_summary],
    ['Programs listed on saved form', parseArray(application.applied_subsidies).join(', ')],
    ['Estimated damage', application.estimated_damage_php == null
      ? 'Not recorded'
      : `PHP ${Number(application.estimated_damage_php).toLocaleString()}`],
    ['Requested amount', `PHP ${Number(application.requested_amount_php || 0).toLocaleString()}`],
    ['Declared needs', application.declared_needs],
    ['RSBSA / agricultural activity', [application.rsbsa_number, application.agricultural_activity].filter(Boolean).join(' / ')],
    ['Farm / fishery location', application.farm_fishery_location],
    ['Land tenure / PCIC policy', [application.land_tenure, application.pcic_policy_number].filter(Boolean).join(' / ')],
    ['Barangay certificate reference', application.barangay_certificate_reference],
    ['Sworn attestation recorded', application.sworn_attestation ? 'Yes' : 'No']
  ];
  for (const [label, value] of applicationFields) {
    if (value !== '' && value != null) writer.paragraph(`${label}: ${value}`);
  }
  const household = parseArray(application.household_members_detail);
  if (household.length) {
    writer.paragraph('Household member details:', { bold: true });
    household.forEach((member) => writer.paragraph([
      member.name,
      member.age ? `Age ${member.age}` : '',
      member.relationship
    ].filter(Boolean).join(' — ')));
  }

  writer.heading('Recovery case damage summary');
  writer.paragraph(`Disaster: ${recoveryCase.disaster_type || 'Not recorded'}`);
  writer.paragraph(`Incident date: ${recoveryCase.incident_date || 'Not recorded'}`);
  writer.paragraph(`Location: ${address(recoveryCase) || 'Not recorded'}`);
  writer.paragraph(`Assessment severity: ${recoveryCase.severity_level || 'Not recorded'}`);
  writer.paragraph(`Damage estimate: ${costRange(recoveryCase.estimated_cost_min, recoveryCase.estimated_cost_max)}`);
  const categories = parseArray(recoveryCase.damage_categories);
  if (categories.length) writer.paragraph(`Damage categories: ${categories.join(', ')}`);
  writer.paragraph(`Damage summary: ${recoveryCase.damage_summary || 'No damage summary recorded.'}`);
  const safety = parseArray(recoveryCase.safety_precautions);
  if (safety.length) writer.paragraph(`Safety information: ${safety.join('; ')}`);
  if (losses.length) {
    writer.heading('Recorded losses');
    for (const loss of losses) {
      writer.paragraph([
        loss.item_name,
        loss.condition ? `Condition: ${loss.condition}` : '',
        loss.estimated_loss_php != null ? `Estimated loss: PHP ${Number(loss.estimated_loss_php).toLocaleString()}` : '',
        loss.description
      ].filter(Boolean).join(' — '));
    }
  }
}

function pageCountFor(pdf) {
  return pdf.getPageCount();
}

function addImagePage(pdf, image, filename, regularFont, boldFont) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText('Supporting photograph', {
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN,
    size: 14,
    font: boldFont,
    color: rgb(0.08, 0.24, 0.38)
  });
  let filenameY = PAGE_HEIGHT - MARGIN - 20;
  for (const line of wrapText(filename, regularFont, 9, PAGE_WIDTH - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y: filenameY, size: 9, font: regularFont });
    filenameY -= 12;
  }
  const maximumWidth = PAGE_WIDTH - MARGIN * 2;
  const maximumHeight = PAGE_HEIGHT - MARGIN * 2 - 48;
  const scale = Math.min(maximumWidth / image.width, maximumHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: 36 + (maximumHeight - height) / 2,
    width,
    height
  });
}

async function addSelectedDocuments(pdf, documents, regularFont, boldFont) {
  const omissions = [];
  for (const document of documents) {
    if (!document.buffer) {
      omissions.push(`${document.original_filename}: file is missing from private storage.`);
      continue;
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(document.media_type)) {
      omissions.push(`${document.original_filename}: ${document.media_type} is not supported in PDF packets.`);
      continue;
    }
    try {
      if (document.media_type === 'image/jpeg' || document.media_type === 'image/png') {
        const image = document.media_type === 'image/jpeg'
          ? await pdf.embedJpg(document.buffer)
          : await pdf.embedPng(document.buffer);
        if (
          !image.width
          || !image.height
          || image.width > 8000
          || image.height > 8000
          || image.width * image.height > 16000000
        ) {
          omissions.push(`${document.original_filename}: image dimensions exceed packet limits.`);
          continue;
        }
        if (pageCountFor(pdf) >= MAX_PAGES - 1) {
          omissions.push(`${document.original_filename}: packet page limit reached.`);
          continue;
        }
        addImagePage(pdf, image, document.original_filename, regularFont, boldFont);
        continue;
      }

      const source = await PDFDocument.load(document.buffer);
      const sourcePages = source.getPageCount();
      const sourcePageSizes = source.getPages().map((page) => page.getSize());
      const hasOversizedPage = sourcePageSizes.some(({ width, height }) => (
        width <= 0 || height <= 0 || width > 12000 || height > 12000
      ));
      if (
        !sourcePages
        || sourcePages > 50
        || hasOversizedPage
        || pageCountFor(pdf) + sourcePages + 1 > MAX_PAGES - 1
      ) {
        omissions.push(`${document.original_filename}: PDF page limit exceeded.`);
        continue;
      }
      const titlePage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      titlePage.drawText('Supporting document', {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN,
        size: 14,
        font: boldFont,
        color: rgb(0.08, 0.24, 0.38)
      });
      let filenameY = PAGE_HEIGHT - MARGIN - 24;
      for (const line of wrapText(document.original_filename, regularFont, 10, PAGE_WIDTH - MARGIN * 2)) {
        titlePage.drawText(line, {
          x: MARGIN,
          y: filenameY,
          size: 10,
          font: regularFont
        });
        filenameY -= 13;
      }
      const copiedPages = await pdf.copyPages(source, source.getPageIndices());
      copiedPages.forEach((page) => pdf.addPage(page));
    } catch (error) {
      omissions.push(`${document.original_filename}: file could not be read as a supported document.`);
    }
  }
  return omissions;
}

function addOmissions(writer, omissions) {
  if (!omissions.length) return;
  writer.addPage();
  writer.heading('Selected files not included');
  omissions.forEach((omission) => writer.paragraph(omission));
}

function addPageNumbers(pdf, regularFont) {
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const text = `Page ${index + 1} of ${pages.length}`;
    const textWidth = regularFont.widthOfTextAtSize(text, 8);
    page.drawText(DISCLAIMER, {
      x: MARGIN,
      y: 18,
      size: 6,
      font: regularFont,
      color: rgb(0.35, 0.39, 0.44)
    });
    page.drawText(text, {
      x: width - textWidth - MARGIN,
      y: 18,
      size: 8,
      font: regularFont,
      color: rgb(0.35, 0.39, 0.44)
    });
  });
}

export async function generateRecoveryPacket({ application, recoveryCase, losses, documents }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Alalai recovery packet ${application.reference_number}`);
  pdf.setSubject('User-prepared disaster recovery application and supporting documents');
  pdf.setCreator('Alalai');
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const writer = createWriter(pdf, regularFont, boldFont);
  addApplicationAndCase(writer, application, recoveryCase, losses);
  const omissions = await addSelectedDocuments(pdf, documents, regularFont, boldFont);
  addOmissions(writer, omissions);
  addPageNumbers(pdf, regularFont);
  return pdf.save();
}
