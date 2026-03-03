import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Public pricing endpoint for the landing page quote widget
// Optional filters: brand/model (best-effort matching against title/description)
router.get('/services', async (req, res) => {
  const brand = (req.query.brand ? String(req.query.brand) : '').trim();
  const model = (req.query.model ? String(req.query.model) : '').trim();

  // NOTE: Service model doesn't have brand/model columns (by design).
  // We do a best-effort contains match.
  const terms = [brand, model].filter(Boolean);

  const items = await prisma.service.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  const filtered = terms.length
    ? items.filter((s) => {
        const hay = `${s.title || ''} ${s.description || ''}`.toLowerCase();
        return terms.every((t) => hay.includes(t.toLowerCase()));
      })
    : items;

  res.json(
    filtered.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      price: s.price,
      code: s.code,
    }))
  );
});

export default router;
