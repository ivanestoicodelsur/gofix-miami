import React from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Services from './pages/Services'
import Inventory from './pages/Inventory'
import { getAccessToken, logout as apiLogout } from './api'

function useAuth() {
  const token = getAccessToken()
  return {
    token,
    signout: async () => {
      await apiLogout()
    }
  }
}

function Protected({ children }) {
  const auth = useAuth()
  if (!auth.token) return <Navigate to="/login" replace />
  return children
}

function NavLink({ to, children }) {
  const loc = useLocation()
  const active = loc.pathname === to
  return (
    <Link to={to} style={{ fontWeight: active ? 700 : 400, textDecoration: active ? 'underline' : 'none' }}>
      {children}
    </Link>
  )
}

export default function App() {
  const auth = useAuth()
  return (
    <div className="admin-root">
      <header className="admin-header">
        <h1>GoFix Admin</h1>
        <nav>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/services">Services</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          {auth.token ? <button onClick={async () => { await auth.signout(); window.location.assign('/login') }}>Logout</button> : null}
        </nav>
      </header>

      <main className="admin-main">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
          <Route path="/services" element={<Protected><Services /></Protected>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
