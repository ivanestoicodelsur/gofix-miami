import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/requireAuth";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validateRequest";
import { logAudit } from "../utils/audit";

const router = Router();
const prisma = new PrismaClient();

function ownerIdFromReq(req: AuthedRequest): string {
  return String(req.user?.userId ?? '');
}

function isAdmin(req: AuthedRequest): boolean {
  return req.user?.role === 'ADMIN';
}

function emitToOwnerAndAdmins(io: any, ownerId: string, event: string, payload: any) {
  if (!io) return;
  try {
    io.to?.('admin')?.emit?.(event, payload);
    if (ownerId && ownerId !== 'system') {
      io.to?.(`user:${ownerId}`)?.emit?.(event, payload);
    }
  } catch (e) {
    console.error('Failed to emit socket event', e);
  }
}

// list
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const ownerId = ownerIdFromReq(req);
  const where = isAdmin(req) ? undefined : { ownerId };
  const items = await prisma.service.findMany({ where, orderBy: { updatedAt: 'desc' } });
  res.json(items);
});

// create
router.post(
  '/',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  body('name').optional({ nullable: true }).isString().trim(),
  body('title').optional({ nullable: true }).isString().trim(),
  body().custom((value, { req }) => {
    const name = String((req as any).body?.name || '').trim();
    const title = String((req as any).body?.title || '').trim();
    if (!name && !title) throw new Error('name is required');
    return true;
  }),
  body('description').optional({ nullable: true }).isString(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('code').optional({ nullable: true }).isString().trim(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const { code, description, price } = req.body;
    const title = String((req.body.name || req.body.title) ?? '').trim();
    const ownerId = ownerIdFromReq(req);
  try {
    const item = await prisma.service.create({
      data: {
        ownerId,
        code: code ? String(code).trim() : null,
        title,
        description: description ?? null,
        price: price === undefined || price === null ? null : Number(price),
      },
    });
    const io = (req.app as any).get('io');
    emitToOwnerAndAdmins(io, item.ownerId, 'services:created', item);

    await logAudit({
      userId: ownerId,
      action: 'create',
      entity: 'Service',
      entityId: String(item.id),
      newData: item,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
  }
);

// update
router.put(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  body('name').optional({ nullable: true }).isString().trim(),
  body('title').optional({ nullable: true }).isString().trim(),
  body().custom((value, { req }) => {
    const name = String((req as any).body?.name || '').trim();
    const title = String((req as any).body?.title || '').trim();
    if (!name && !title) throw new Error('name is required');
    return true;
  }),
  body('description').optional({ nullable: true }).isString(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('code').optional({ nullable: true }).isString().trim(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const ownerId = ownerIdFromReq(req);
    const title = String((req.body.name || req.body.title) ?? '').trim();
    const data: any = {
      title,
      description: req.body.description ?? null,
      price: req.body.price === undefined ? undefined : (req.body.price === null ? null : Number(req.body.price)),
      code: req.body.code === undefined ? undefined : (req.body.code ? String(req.body.code).trim() : null),
    };
  try {
    const existing = isAdmin(req)
      ? await prisma.service.findUnique({ where: { id } })
      : await prisma.service.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.service.update({ where: { id }, data });
    const io = (req.app as any).get('io');
    emitToOwnerAndAdmins(io, updated.ownerId, 'services:updated', updated);

    await logAudit({
      userId: ownerId,
      action: 'update',
      entity: 'Service',
      entityId: String(updated.id),
      oldData: existing,
      newData: updated,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
  }
);

// delete
router.delete('/:id', requireAuth, requireRole(['ADMIN', 'TECHNICIAN']), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const ownerId = ownerIdFromReq(req);
  try {
    const existing = isAdmin(req)
      ? await prisma.service.findUnique({ where: { id } })
      : await prisma.service.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.service.delete({ where: { id } });
    const io = (req.app as any).get('io');
    emitToOwnerAndAdmins(io, existing.ownerId, 'services:deleted', { id });

    await logAudit({
      userId: ownerId,
      action: 'delete',
      entity: 'Service',
      entityId: String(id),
      oldData: existing,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
