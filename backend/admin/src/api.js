// prefer explicit VITE_API_URL, fall back to VITE_API_BASE (older name), then localhost
// In production behind nginx, you can set VITE_API_URL to an empty string and proxy /api to the backend.
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:4000'

const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'
const LEGACY_KEY = 'token'

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY) || localStorage.getItem(LEGACY_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) {
    localStorage.setItem(ACCESS_KEY, accessToken)
    // legacy key for older code paths
    localStorage.setItem(LEGACY_KEY, accessToken)
  }
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(LEGACY_KEY)
}

async function parseJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { error: text || 'Invalid JSON response' };
  }
}

async function refreshSession() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  })
  const data = await parseJson(res)
  if (!res.ok) return null
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  return data
}

async function request(path, { method = 'GET', token, json, retry = true } = {}) {
  const headers = {};
  const effectiveToken = token || getAccessToken()
  if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined
  });

  // auto-refresh on 401 once
  if (res.status === 401 && retry) {
    const refreshed = await refreshSession()
    if (refreshed?.accessToken) {
      return request(path, { method, token: refreshed.accessToken, json, retry: false })
    }
  }

  const data = await parseJson(res);
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function requestBlob(path, { method = 'GET', token, retry = true } = {}) {
  const headers = {};
  const effectiveToken = token || getAccessToken()
  if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshSession()
    if (refreshed?.accessToken) {
      return requestBlob(path, { method, token: refreshed.accessToken, retry: false })
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(text || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }

  return res.blob()
}

export async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', json: { email, password } })
}

export async function logout() {
  const refreshToken = getRefreshToken()
  if (refreshToken) {
    try {
      await request('/api/auth/logout', { method: 'POST', json: { refreshToken }, retry: false })
    } catch {
      // ignore
    }
  }
  clearTokens()
}

export async function fetchServices(token) {
  return request('/api/services', { token })
}

export async function createService(token, data) {
  return request('/api/services', { method: 'POST', token, json: data })
}

export async function updateService(token, id, data) {
  return request(`/api/services/${id}`, { method: 'PUT', token, json: data })
}

export async function deleteService(token, id) {
  return request(`/api/services/${id}`, { method: 'DELETE', token })
}

export async function fetchInventory(token, q = '', page = 1, limit = 50) {
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  return request(`/api/inventory?${params.toString()}`, { token });
}

export async function createInventoryItem(token, data) {
  return request('/api/inventory', { method: 'POST', token, json: data });
}

export async function updateInventoryItem(token, id, data) {
  return request(`/api/inventory/${id}`, { method: 'PUT', token, json: data });
}

export async function deleteInventoryItem(token, id) {
  return request(`/api/inventory/${id}`, { method: 'DELETE', token });
}

export async function importFromGoogle(token) {
  return request('/api/inventory/import-google', { method: 'POST', token });
}

export function exportInventoryUrl() {
  return `${API_BASE}/api/inventory/export`;
}

export async function exportInventoryCsv(token) {
  return requestBlob('/api/inventory/export', { token })
}

export function apiBaseUrl() {
  return API_BASE;
}
