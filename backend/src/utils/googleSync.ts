import { PrismaClient } from '@prisma/client';
import { fetchSheetRows } from '../services/google';

const prisma = new PrismaClient();

type Row = { sku?: string; title?: string; description?: string; quantity?: string; price?: string };

export async function syncInventoryFromSheet(io: any) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.warn('GOOGLE_SPREADSHEET_ID not set — skipping sync');
    return;
  }

  try {
    const rows = await fetchSheetRows(spreadsheetId, 'Inventory!A:Z');
    if (!rows || rows.length < 2) return;

    const header = rows[0].map((h: string) => String(h).trim());
    const dataRows = rows.slice(1);

    const sheetMap = new Map<string, Row>();
    for (const r of dataRows) {
      const obj: any = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
      const sku = obj.sku?.toString().trim();
      if (!sku) continue;
      sheetMap.set(sku, obj);
    }

    const dbItems = await prisma.inventory.findMany();
    const dbMap = new Map(dbItems.map(i => [i.sku, i]));

    // Upsert / create / update
    for (const [sku, row] of sheetMap.entries()) {
      const existing = dbMap.get(sku);
      const data = {
        title: row.title || 'Untitled',
        description: row.description || '',
        quantity: Number(row.quantity || 0),
        price: row.price ? Number(row.price) : null
      };

      if (existing) {
        // check if different
        const changed = existing.title !== data.title || existing.description !== data.description || existing.quantity !== data.quantity || (existing.price || 0) !== (data.price || 0);
        if (changed) {
          const updated = await prisma.inventory.update({ where: { id: existing.id }, data });
          // Sync is global/system-owned; notify admins only
          if (io?.to) io.to('admin').emit('inventory:updated', updated);
          else io?.emit?.('inventory:updated', updated);
        }
      } else {
        const created = await prisma.inventory.create({ data: { sku, ...data } });
        if (io?.to) io.to('admin').emit('inventory:created', created);
        else io?.emit?.('inventory:created', created);
      }
    }

    // Optionally delete missing items from sheet
    const deleteMissing = process.env.GOOGLE_SYNC_DELETE_MISSING === 'true';
    if (deleteMissing) {
      for (const dbItem of dbItems) {
        if (!dbItem.sku) continue;
        if (!sheetMap.has(dbItem.sku)) {
          await prisma.inventory.delete({ where: { id: dbItem.id } });
          if (io?.to) io.to('admin').emit('inventory:deleted', { id: dbItem.id });
          else io?.emit?.('inventory:deleted', { id: dbItem.id });
        }
      }
    }

    // signal sync completion for dashboards
    if (io?.to) io.to('admin').emit('sync:completed', { entity: 'inventory', at: new Date().toISOString() });
    else io?.emit?.('sync:completed', { entity: 'inventory', at: new Date().toISOString() });
  } catch (err) {
    console.error('Google Sheets sync error', err);
  }
}

export function startGoogleSync(io: any) {
  const spreadsheetId = (process.env.GOOGLE_SPREADSHEET_ID || '').trim();
  if (!spreadsheetId) {
    console.warn('GOOGLE_SPREADSHEET_ID not set — Google Sheets sync disabled');
    return;
  }

  const intervalMs = Number(process.env.GOOGLE_SYNC_INTERVAL_MS || 60_000);
  // Run immediately once
  syncInventoryFromSheet(io).catch(e => console.error(e));
  // Schedule
  setInterval(() => syncInventoryFromSheet(io).catch(e => console.error(e)), intervalMs);
}
