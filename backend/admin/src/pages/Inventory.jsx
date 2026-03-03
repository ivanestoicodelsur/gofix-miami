import React, { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { DataGrid } from '@mui/x-data-grid'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { apiBaseUrl, createInventoryItem, deleteInventoryItem, exportInventoryCsv, fetchInventory, getAccessToken, importFromGoogle, updateInventoryItem } from '../api'

function InventoryForm({ open, onClose, onSave, initial }) {
  const [sku, setSku] = useState(initial?.sku || '')
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [quantity, setQuantity] = useState(initial?.quantity ?? 0)
  const [price, setPrice] = useState(initial?.price ?? '')

  useEffect(() => {
    setSku(initial?.sku || '')
    setTitle(initial?.title || '')
    setDescription(initial?.description || '')
    setQuantity(initial?.quantity ?? 0)
    setPrice(initial?.price ?? '')
  }, [initial])

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>{initial ? 'Editar item' : 'Nuevo item'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="SKU" value={sku} onChange={e => setSku(e.target.value)} fullWidth />
          <TextField label="Título" value={title} onChange={e => setTitle(e.target.value)} fullWidth />
          <TextField label="Descripción" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={3} />
          <TextField label="Cantidad" type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
          <TextField label="Precio" type="number" value={price} onChange={e => setPrice(e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ sku: sku || null, title, description, quantity, price: price === '' ? null : Number(price) })} variant="contained">Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}

async function exportCsvWithAuth() {
  const blob = await exportInventoryCsv(null)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventory.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function Inventory() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState(null)

  async function load(query = q) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchInventory(null, query)
      setItems(res || [])
    } catch (e) {
      setError(e?.message || 'No se pudo cargar inventario')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load('')
    const socket = io(apiBaseUrl(), {
      transports: ['websocket'],
      auth: { token: getAccessToken() }
    })
    socket.on('inventory:created', (item) => setItems(prev => [item, ...prev]))
    socket.on('inventory:updated', (item) => setItems(prev => prev.map(p => p.id === item.id ? item : p)))
    socket.on('inventory:deleted', ({ id }) => setItems(prev => prev.filter(p => p.id !== id)))
    return () => socket.disconnect()
  }, [])

  const rows = useMemo(
    () => items.map(it => ({
      id: it.id,
      sku: it.sku,
      title: it.title,
      description: it.description,
      quantity: it.quantity,
      price: it.price,
    })),
    [items]
  )

  const columns = [
    { field: 'sku', headerName: 'SKU', width: 160 },
    { field: 'title', headerName: 'Título', flex: 1 },
    { field: 'description', headerName: 'Descripción', flex: 2 },
    { field: 'quantity', headerName: 'Qty', width: 100 },
    { field: 'price', headerName: 'Precio', width: 120 },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 220,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => { setEditing(params.row); setOpenForm(true) }}>Editar</Button>
          <Button size="small" color="error" onClick={async () => {
            setError(null)
            try {
              await deleteInventoryItem(null, params.row.id)
            } catch (e) {
              setError(e?.message || 'No se pudo borrar item')
            }
          }}>Borrar</Button>
        </Box>
      )
    }
  ]

  async function handleSave(data) {
    setError(null)
    try {
      if (editing) {
        await updateInventoryItem(null, editing.id, data)
      } else {
        await createInventoryItem(null, data)
      }
      setEditing(null)
      setOpenForm(false)
    } catch (e) {
      setError(e?.message || 'No se pudo guardar item')
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <h2>Inventario</h2>
        <Button variant="contained" onClick={() => { setEditing(null); setOpenForm(true) }}>Nuevo item</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Buscar (SKU/Título)" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="outlined" onClick={() => load(q)}>Buscar</Button>
        <Button variant="outlined" onClick={async () => {
          setError(null)
          try {
            await importFromGoogle(null)
            await load(q)
          } catch (e) {
            setError(e?.message || 'Import Google Sheets falló')
          }
        }}>Importar Google Sheets</Button>
        <Button variant="outlined" onClick={async () => {
          setError(null)
          try {
            await exportCsvWithAuth()
          } catch (e) {
            setError(e?.message || 'Export CSV falló')
          }
        }}>Exportar CSV</Button>
      </Box>

      {error ? <Box sx={{ mb: 2, color: 'error.main' }}>{error}</Box> : null}

      {loading ? <CircularProgress /> : (
        <div style={{ height: 520, width: '100%' }}>
          <DataGrid rows={rows} columns={columns} pageSize={10} rowsPerPageOptions={[10, 25, 50]} disableSelectionOnClick />
        </div>
      )}

      <InventoryForm
        open={openForm}
        onClose={() => { setOpenForm(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
      />
    </Box>
  )
}
