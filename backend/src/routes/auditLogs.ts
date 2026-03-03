import { Router } from 'express';
import { query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { validateRequest } from '../middleware/validateRequest';
import { AuditLog } from '../models/AuditLog';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  validateRequest,
  async (req, res) => {
    const page = (req.query.page as any) ? Number(req.query.page) : 1;
    const limit = (req.query.limit as any) ? Number(req.query.limit) : 50;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      AuditLog.countDocuments({}),
      AuditLog.find({}).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
    ]);

    res.json({ page, limit, total, items });
  }
);

export default router;
