import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setTokens } from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const nav = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await login(email, password)
      if (res?.accessToken) {
        setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken })
        nav('/dashboard')
        return
      }
      // backward compatibility
      if (res?.token) {
        setTokens({ accessToken: res.token })
        nav('/dashboard')
        return
      }
      setError(res?.error || 'Login failed')
    } catch (e) {
      setError(e?.message || 'Login failed')
    }
  }

  return (
    <div className="login">
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" required />
        <button type="submit">Login</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  )
}
