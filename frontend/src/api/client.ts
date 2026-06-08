import axios from 'axios'

// ── Decentralized API Client ────────────────────────────────────────────────
// Dynamically routes requests based on node topology discovered at startup.

const STORAGE_KEY = 'dir_node_url'
const TOPOLOGY_KEY = 'node_topology'

function getStoredDirUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

function getStoredTopology(): any[] {
  try {
    return JSON.parse(localStorage.getItem(TOPOLOGY_KEY) || '[]')
  } catch {
    return []
  }
}

function buildBaseUrl(origin?: string): string {
  const base = origin ?? getStoredDirUrl() ?? ''
  return base ? `${base}/api/v1` : '/api/v1'
}

const api = axios.create({
  baseURL: buildBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

// ── Bootstrap: discover dir node and topology ───────────────────────────────
export async function bootstrapApiClient(): Promise<void> {
  let configPayload: any = null

  // 1. Try local server first
  try {
    const res = await fetch('/api/v1/config', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      configPayload = await res.json()
    }
  } catch { /* ignore */ }

  // 2. If dir node is specified, verify it
  if (configPayload?.dir_node_url) {
    const dirUrl = configPayload.dir_node_url.replace(/\/$/, '')
    try {
      const probe = await fetch(`${dirUrl}/api/v1/config`, { signal: AbortSignal.timeout(3000) })
      if (probe.ok) {
        const probeCfg = await probe.json()
        if (probeCfg.node_mode === 'directory') {
          localStorage.setItem(STORAGE_KEY, dirUrl)
          api.defaults.baseURL = `${dirUrl}/api/v1`
          
          if (probeCfg.storage_nodes) {
            localStorage.setItem(TOPOLOGY_KEY, JSON.stringify(probeCfg.storage_nodes))
          }
          return
        }
      }
    } catch { /* dir node unreachable */ }
  } else if (configPayload?.node_mode === 'directory') {
    // We are on the dir node natively
    localStorage.removeItem(STORAGE_KEY)
    api.defaults.baseURL = '/api/v1'
    if (configPayload.storage_nodes) {
      localStorage.setItem(TOPOLOGY_KEY, JSON.stringify(configPayload.storage_nodes))
    }
    return
  }

  // 3. Fallbacks: The original local server is a storage node but dir node is dead.
  // The local storage node should serve us natively via its replicated DB.
  localStorage.removeItem(STORAGE_KEY)
  api.defaults.baseURL = '/api/v1'
  if (configPayload?.storage_nodes) {
    localStorage.setItem(TOPOLOGY_KEY, JSON.stringify(configPayload.storage_nodes))
  }
}

export function getFallbackNodeUrls(): string[] {
  const fromEnv: string[] = (import.meta.env.VITE_FALLBACK_NODE_URLS ?? '')
    .split(',')
    .map((u: string) => u.trim())
    .filter(Boolean)
  try {
    const fromStorage: string[] = JSON.parse(localStorage.getItem('fallback_node_urls') ?? '[]')
    return [...new Set([...fromEnv, ...fromStorage])]
  } catch {
    return fromEnv
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: graceful fallback on network failure ───────────────
let refreshing = false
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // Fallback logic for network errors / timeouts (not 4xx or 5xx application errors)
    if (!err.response && !original._retryFallback) {
      original._retryFallback = true
      
      // Try hitting the local page server instead of the directory node proxy
      if (original.baseURL !== '/api/v1') {
        try {
          // Probe local page server
          const probe = await fetch('/api/v1/health', { signal: AbortSignal.timeout(2000) })
          if (probe.ok) {
            original.baseURL = '/api/v1'
            return api(original)
          }
        } catch { /* ignore */ }
      }
    }

    if (err.response?.status === 421) {
      if (!document.getElementById('vps-handoff-overlay')) {
        const overlay = document.createElement('div')
        overlay.id = 'vps-handoff-overlay'
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999'
        overlay.innerHTML = `
          <h1 style="font-size:24px;margin-bottom:16px;">Main Server Online</h1>
          <p style="font-size:16px;color:#ccc;margin-bottom:24px;text-align:center;">The primary directory node is back online.<br>Refresh to reconnect.</p>
          <button onclick="window.location.reload()" style="padding:10px 20px;font-size:16px;cursor:pointer;background:#534AB7;color:white;border:none;border-radius:6px;">Refresh Page</button>
        `
        document.body.appendChild(overlay)
      }
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original._retryAuth && !refreshing) {
      original._retryAuth = true
      refreshing = true
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        if (!refresh_token) throw new Error('no refresh token')
        const dirUrl = getStoredDirUrl()
        const refreshUrl = dirUrl ? `${dirUrl}/api/v1/auth/refresh` : '/api/v1/auth/refresh'
        const { data } = await axios.post(refreshUrl, { refresh_token })
        localStorage.setItem('access_token', data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      } finally {
        refreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
