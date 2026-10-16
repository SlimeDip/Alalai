import express from 'express';
import db from '../database.js';

const router = express.Router();

const safeParse = (str) => {
  try {
    return JSON.parse(str);
  } catch {
    return [];
  }
};

const parseArrayOrCsv = (val) => {
  if (!val) return [];
  const parsed = safeParse(val);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed;
  }
  if (typeof val === 'string') {
    return val.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

function formatSubsidy(row) {
  return {
    ...row,
    requirements: safeParse(row.requirements),
    application_steps: safeParse(row.application_steps),
    disaster_categories: parseArrayOrCsv(row.disaster_categories),
    damage_types: parseArrayOrCsv(row.damage_types),
  };
}

// Get all subsidies
router.get('/', (req, res) => {
  try {
    const { category, agency } = req.query;
    let query = 'SELECT subsidy_id AS id, * FROM subsidies WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND damage_types LIKE ?';
      params.push(`%${category}%`);
    }

    if (agency) {
      query += ' AND agency LIKE ?';
      params.push(`%${agency}%`);
    }

    query += ' ORDER BY max_amount_php DESC';
    const rows = db.prepare(query).all(...params);

    const formatted = rows.map(formatSubsidy);

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching subsidies:', error);
    res.status(500).json({ success: false, error: 'Database error fetching subsidies.' });
  }
});

// Get single subsidy by ID
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT subsidy_id AS id, * FROM subsidies WHERE subsidy_id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Subsidy program not found.' });
    }

    const formatted = formatSubsidy(row);

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching subsidy:', error);
    res.status(500).json({ success: false, error: 'Database error fetching subsidy.' });
  }
});

export default router;
