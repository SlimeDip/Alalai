import express from 'express';
import { getSubsidyCatalog } from '../services/subsidyCatalog.js';

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    res.json({
      success: true,
      subsidies: getSubsidyCatalog()
    });
  } catch (error) {
    next(error);
  }
});

export default router;
