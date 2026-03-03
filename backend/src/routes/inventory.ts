import { Router } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/requireAuth";
import { body } from "express-validator";
import { validateRequest } from "../middleware/validateRequest";
import { fetchSheetRows } from "../services/google";
import { stringify as csvStringify } from 'csv-stringify/sync';
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
    // admins receive all events
    io.to?.('admin')?.emit?.(event, payload);
    // owners receive their events
    if (ownerId && ownerId !== 'system') {
      io.to?.(`user:${ownerId}`)?.emit?.(event, payload);
    }
  } catch (e) {
    console.error('Failed to emit socket event', e);
  }
}

// list with search, filter, pagination
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const { q, page = 1, limit = 50 } = req.query;
  const searchWhere = q
    ? {
        OR: [
          { title: { contains: String(q), mode: Prisma.QueryMode.insensitive } },
          { sku: { contains: String(q), mode: Prisma.QueryMode.insensitive } },
          { description: { contains: String(q), mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : {};

  const where = isAdmin(req)
    ? (Object.keys(searchWhere).length ? searchWhere : undefined)
    : {
        ownerId: ownerIdFromReq(req),
        ...searchWhere,
      };
  const take = Number(limit);
  const skip = (Number(page) - 1) * take;
  const items = await prisma.inventory.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } });
  res.json(items);
});

// create
router.post(
  '/',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  body('sku').isString().trim().notEmpty().withMessage('SKU is required'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('description').optional({ nullable: true }).isString(),
  body('quantity').optional().isInt({ min: 0 }).toInt(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const { sku, title, description, quantity = 0, price = null } = req.body;
    const ownerId = ownerIdFromReq(req);
  try {
    const item = await prisma.inventory.create({
      data: {
        ownerId,
        sku: String(sku).trim(),
        title: String(title).trim(),
        description: description ?? null,
        quantity: Number(quantity),
        price: price === null ? null : Number(price),
      },
    });
    const io = (req as any).app?.get?.('io');
    emitToOwnerAndAdmins(io, item.ownerId, 'inventory:created', item);

    await logAudit({
      userId: ownerId,
      action: 'create',
      entity: 'Inventory',
      entityId: String(item.id),
      newData: item,
    });
    res.json(item);
  } catch (err) {
    const code = (err as any)?.code;
    if (code === 'P2002') return res.status(409).json({ error: 'SKU already exists for this user' });
    res.status(500).json({ error: 'Server error' });
  }
  }
);

// update
router.put(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'TECHNICIAN']),
  body('sku').isString().trim().notEmpty().withMessage('SKU is required'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('description').optional({ nullable: true }).isString(),
  body('quantity').optional().isInt({ min: 0 }).toInt(),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validateRequest,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const ownerId = ownerIdFromReq(req);
    const data = {
      sku: String(req.body.sku).trim(),
      title: String(req.body.title).trim(),
      description: req.body.description ?? null,
      quantity: req.body.quantity !== undefined ? Number(req.body.quantity) : undefined,
      price: req.body.price !== undefined ? (req.body.price === null ? null : Number(req.body.price)) : undefined,
    } as any;
  try {
    const existing = isAdmin(req)
      ? await prisma.inventory.findUnique({ where: { id } })
      : await prisma.inventory.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.inventory.update({ where: { id }, data });
    const io = (req as any).app?.get?.('io');
    emitToOwnerAndAdmins(io, updated.ownerId, 'inventory:updated', updated);

    await logAudit({
      userId: ownerId,
      action: 'update',
      entity: 'Inventory',
      entityId: String(updated.id),
      oldData: existing,
      newData: updated,
    });
    res.json(updated);
  } catch (err) {
    const code = (err as any)?.code;
    if (code === 'P2002') return res.status(409).json({ error: 'SKU already exists for this user' });
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
      ? await prisma.inventory.findUnique({ where: { id } })
      : await prisma.inventory.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await prisma.inventory.delete({ where: { id } });
    const io = (req as any).app?.get?.('io');
    emitToOwnerAndAdmins(io, existing.ownerId, 'inventory:deleted', { id });

    await logAudit({
      userId: ownerId,
      action: 'delete',
      entity: 'Inventory',
      entityId: String(id),
      oldData: existing,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// manual import from Google Sheets (requires SPREADSHEET_ID env)
router.post('/import-google', requireAuth, requireRole(['ADMIN', 'TECHNICIAN']), async (req: AuthedRequest, res) => {
  try {
    const ownerId = isAdmin(req) ? 'system' : ownerIdFromReq(req);
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) return res.status(400).json({ error: 'GOOGLE_SPREADSHEET_ID not configured' });
    const rows = await fetchSheetRows(spreadsheetId, 'Inventory!A:Z');
    // expecting header row: sku,title,description,quantity,price
    const header = rows[0] || [];
    const dataRows = rows.slice(1);
    const created = [];
    for (const r of dataRows) {
      const row = Object.fromEntries(header.map((h, i) => [h, r[i]]));
      const sku = String(row.sku || '').trim();
      if (!sku) continue;
      const item = await prisma.inventory.upsert({
        where: { ownerId_sku: { ownerId, sku } },
        update: {
          title: row.title || '',
          description: row.description || '',
          quantity: Number(row.quantity || 0),
          price: row.price ? Number(row.price) : null,
        },
        create: {
          ownerId,
          sku,
          title: row.title || 'Untitled',
          description: row.description || '',
          quantity: Number(row.quantity || 0),
          price: row.price ? Number(row.price) : null,
        },
      });
      created.push(item);
    }
    res.json({ imported: created.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// export CSV
router.get('/export', requireAuth, async (req: AuthedRequest, res) => {
  const ownerId = ownerIdFromReq(req);
  const where = isAdmin(req) ? undefined : { ownerId };
  const items = await prisma.inventory.findMany({ where, orderBy: { updatedAt: 'desc' } });
  const records = items.map(i => ({ id: i.id, sku: i.sku, title: i.title, description: i.description, quantity: i.quantity, price: i.price }));
  const csv = csvStringify(records, { header: true });
  res.header('Content-Type', 'text/csv');
  res.attachment('inventory.csv').send(csv);
});

export default router;
