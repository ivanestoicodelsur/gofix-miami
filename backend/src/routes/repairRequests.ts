import { Router } from 'express';
import { PrismaClient, RepairRequestStatus } from '@prisma/client';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/requireAuth';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();
const prisma = new PrismaClient();

// Public: create repair request (from landing page)
router.post(
  '/',
  body('customerName').isString().trim().notEmpty(),
  body('customerEmail').isEmail().normalizeEmail(),
  body('customerPhone').isString().trim().notEmpty(),
  body('deviceBrand').optional({ nullable: true }).isString().trim(),
  body('deviceModel').optional({ nullable: true }).isString().trim(),
  body('serviceType').optional({ nullable: true }).isString().trim(),
  body('description').isString().trim().notEmpty(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validateRequest,
  async (req, res) => {
    const created = await prisma.repairRequest.create({
      data: {
        customerName: String(req.body.customerName).trim(),
        customerEmail: String(req.body.customerEmail).trim().toLowerCase(),
        customerPhone: String(req.body.customerPhone).trim(),
        deviceBrand: req.body.deviceBrand ? String(req.body.deviceBrand).trim() : null,
        deviceModel: req.body.deviceModel ? String(req.body.deviceModel).trim() : null,
        serviceType: req.body.serviceType ? String(req.body.serviceType).trim() : null,
        description: String(req.body.description).trim(),
        price: req.body.price === undefined || req.body.price === null ? null : Number(req.body.price),
      },
    });

    // Optionally notify admins/techs via Socket.IO (room: admin)
    try {
      const io = (req.app as any).get?.('io');
      io?.to?.('admin')?.emit?.('repair-requests:created', created);
    } catch {
      // ignore
    }

    res.status(201).json({
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
    });
  }
);

// Public: check status by email + id
router.get(
  '/status',
  query('email').isEmail().normalizeEmail(),
  query('id').isInt({ min: 1 }).toInt(),
  validateRequest,
  async (req, res) => {
    const email = String(req.query.email).trim().toLowerCase();
    const id = Number(req.query.id);
    const record = await prisma.repairRequest.findFirst({
      where: { id, customerEmail: email },
      select: { id: true, status: true, createdAt: true, updatedAt: true },
    });
    if (!record) return res.status(404).json({ error: 'Request not found' });
    res.json(record);
  }
);

// Protected: list all (ADMIN/TECHNICIAN)
router.get(
  '/',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('status').optional().isIn(Object.values(RepairRequestStatus)),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const skip = (page - 1) * limit;
    const status = req.query.status ? (String(req.query.status) as RepairRequestStatus) : undefined;

    const where = status ? { status } : {};
    const [total, items] = await Promise.all([
      prisma.repairRequest.count({ where }),
      prisma.repairRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: { technician: { select: { id: true, email: true, name: true, role: true } } },
      }),
    ]);
    res.json({ page, limit, total, items });
  }
);

// Protected: get by id (ADMIN/TECHNICIAN)
router.get(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  param('id').isInt({ min: 1 }).toInt(),
  validateRequest,
  async (_req, res) => {
    const id = Number(_req.params.id);
    const item = await prisma.repairRequest.findUnique({
      where: { id },
      include: { technician: { select: { id: true, email: true, name: true, role: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  }
);

// Protected: update status (ADMIN/TECHNICIAN)
router.patch(
  '/:id/status',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  param('id').isInt({ min: 1 }).toInt(),
  body('status').isIn(Object.values(RepairRequestStatus)),
  body('technicianId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const status = String(req.body.status) as RepairRequestStatus;
    const technicianId = req.body.technicianId === undefined ? undefined : (req.body.technicianId === null ? null : Number(req.body.technicianId));

    const updated = await prisma.repairRequest.update({
      where: { id },
      data: {
        status,
        technicianId,
      },
    });

    try {
      const io = (req.app as any).get?.('io');
      io?.to?.('admin')?.emit?.('repair-requests:updated', updated);
    } catch {
      // ignore
    }

    res.json(updated);
  }
);

// Protected: delete (ADMIN only)
router.delete(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  param('id').isInt({ min: 1 }).toInt(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    await prisma.repairRequest.delete({ where: { id } });
    try {
      const io = (req.app as any).get?.('io');
      io?.to?.('admin')?.emit?.('repair-requests:deleted', { id });
    } catch {
      // ignore
    }
    res.json({ ok: true });
  }
);

export default router;
