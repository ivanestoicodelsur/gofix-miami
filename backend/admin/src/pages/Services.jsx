import React, { useEffect, useState, useMemo } from 'react'
import { apiBaseUrl, fetchServices, createService, updateService, deleteService, getAccessToken } from '../api'
import { io } from 'socket.io-client'
import { DataGrid } from '@mui/x-data-grid'
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Box, CircularProgress } from '@mui/material'

function ServiceForm({ open, onClose, onSave, initial }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')

  useEffect(() => {
    setTitle(initial?.title || '')
    setDescription(initial?.description || '')
  }, [initial])

  return (
    <Dialog open={open} onClose={onClose} fullWidth>
      <DialogTitle>{initial ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Título" value={title} onChange={e => setTitle(e.target.value)} fullWidth />
          <TextField label="Descripción" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={3} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ title, description })} variant="contained">Guardar</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()

    const socket = io(apiBaseUrl(), {
      transports: ['websocket'],
      auth: { token: getAccessToken() }
    })

    socket.on('services:created', (newService) => setServices(prev => [newService, ...prev]))
    socket.on('services:updated', (updated) => setServices(prev => prev.map(p => p.id === updated.id ? updated : p)))
    socket.on('services:deleted', ({ id }) => setServices(prev => prev.filter(p => p.id !== id)))

    return () => socket.disconnect()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchServices()
      setServices(res || [])
    } catch (e) {
      setError(e?.message || 'No se pudo cargar servicios')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(data) {
    setError(null)
    try {
      await createService(null, data)
      setOpenForm(false)
    } catch (e) {
      setError(e?.message || 'No se pudo crear servicio')
    }
    // optimistic UI: added via socket
  }

  async function handleSaveEdit(data) {
    setError(null)
    try {
      await updateService(null, editing.id, data)
      setEditing(null)
      setOpenForm(false)
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar servicio')
    }
  }

  async function handleDelete(id) {
    setError(null)
    try {
      await deleteService(null, id)
    } catch (e) {
      setError(e?.message || 'No se pudo borrar servicio')
    }
  }

  const rows = useMemo(() => services.map(s => ({ id: s.id, title: s.title, description: s.description, price: s.price })), [services])

  const columns = [
    { field: 'title', headerName: 'Título', flex: 1 },
    { field: 'description', headerName: 'Descripción', flex: 2 },
    { field: 'price', headerName: 'Precio', width: 120 },
    {
      field: 'actions', headerName: 'Acciones', width: 220, sortable: false, renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => { setEditing(params.row); setOpenForm(true) }}>Editar</Button>
          <Button size="small" color="error" onClick={() => handleDelete(params.row.id)}>Borrar</Button>
        </Box>
      )
    }
  ]

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <h2>Servicios</h2>
        <Button variant="contained" onClick={() => { setEditing(null); setOpenForm(true) }}>Nuevo servicio</Button>
      </Box>

      {error ? <Box sx={{ mb: 2, color: 'error.main' }}>{error}</Box> : null}

      {loading ? <CircularProgress /> : (
        <div style={{ height: 500, width: '100%' }}>
          <DataGrid rows={rows} columns={columns} pageSize={10} rowsPerPageOptions={[10, 25, 50]} disableSelectionOnClick />
        </div>
      )}

      <ServiceForm open={openForm} onClose={() => setOpenForm(false)} onSave={editing ? handleSaveEdit : handleCreate} initial={editing} />
    </Box>
  )
}
