import axios from 'axios'

// ── API client with dynamic base URL discovery ────────────────────────────────
//
// On startup, we fetch /api/v1/config from whatever server is serving this
// page. If it's a storage node, the config includes `dir_node_url` pointing
// at the real directory node. We switch the Axios base URL there immediately.
//
// This means the same static build can be deployed to any server
// (Hassan's alphaservers.dns.army, a VPS, etc.) and it'll always
// route API calls to the correct directory node.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dir_node_url'

function getStoredDirUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

function buildBaseUrl(origin?: string): string {
  const base = origin ?? getStoredDirUrl() ?? ''
  return base ? `${base}/api/v1` : '/api/v1'
}

const api = axios.create({
  baseURL: buildBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
})

// ── Bootstrap: discover dir node URL on first load ───────────────────────────
export async function bootstrapApiClient(): Promise<void> {
  // Step 1: Try to reach the config endpoint of the server serving this page.
  // This gives us authoritative topology info.
  try {
    const res = await fetch('/api/v1/config', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const cfg = await res.json()

      if (cfg.dir_node_url) {
        // We're on a storage node — try to reach the dir node before committing.
        // We probe /config and verify node_mode === 'directory' to guard against
        // DNS round-robin resolving back to this same storage node (same domain,
        // multiple A records). A /health check alone would give a false positive.
        const dirUrl = cfg.dir_node_url.replace(/\/$/, '')
        try {
          const probe = await fetch(`${dirUrl}/api/v1/config`, { signal: AbortSignal.timeout(3000) })
          if (probe.ok) {
            const probeCfg = await probe.json()
            if (probeCfg.node_mode === 'directory') {
              // Confirmed real directory node — route to it
              localStorage.setItem(STORAGE_KEY, dirUrl)
              api.defaults.baseURL = `${dirUrl}/api/v1`
              return
            }
          }
        } catch { /* dir node unreachable */ }

        // Dir node is DOWN or we can't confirm it's directory mode.
        // Stay on this storage node — clear stale pointer so relative paths work.
        localStorage.removeItem(STORAGE_KEY)
        api.defaults.baseURL = '/api/v1'
      } else {
        // We're already on the directory node — use relative paths
        localStorage.removeItem(STORAGE_KEY)
        api.defaults.baseURL = '/api/v1'

        // Cache storage node URLs for future fallback use
        if (cfg.storage_nodes?.length) {
          const urls: string[] = cfg.storage_nodes
            .map((n: { node_ip?: string }) => {
              const ip = (n.node_ip ?? '').split(',')[0].trim()
              if (!ip) return null
              return ip.startsWith('http') ? ip : null
            })
            .filter(Boolean) as string[]
          if (urls.length) localStorage.setItem('fallback_node_urls', JSON.stringify(urls))
        }
      }
      return
    }
  } catch { /* page server unreachable or timeout */ }

  // Step 2: Page server unreachable. Try fallback nodes to find a live one.
  const fallbacks = getFallbackNodeUrls()
  for (const nodeUrl of fallbacks) {
    try {
      const probe = await fetch(`${nodeUrl}/api/v1/health`, { signal: AbortSignal.timeout(3000) })
      if (probe.ok) {
        // Found a live fallback — route to it and clear old dir node pointer
        localStorage.removeItem(STORAGE_KEY)
        api.defaults.baseURL = `${nodeUrl}/api/v1`
        return
      }
    } catch { continue }
  }

  // Step 3: Nothing found — fall back to whatever was last stored
  const stored = getStoredDirUrl()
  if (stored) api.defaults.baseURL = `${stored}/api/v1`
}

/** Storage node fallback URLs — merged from build-time env and cached localStorage.
 *  VITE_FALLBACK_NODE_URLS = comma-separated list e.g. "https://alphaservers.dns.army"
 *  This ensures fallbacks work even on a fresh browser session.
 */
export function getFallbackNodeUrls(): string[] {
  const fromEnv: string[] = (import.meta.env.VITE_FALLBACK_NODE_URLS ?? '')
    .split(',')
    .map((u: string) => u.trim())
    .filter(Boolean)
  try {
    const fromStorage: string[] = JSON.parse(localStorage.getItem('fallback_node_urls') ?? '[]')
    // Merge — env first (always available), then dynamic (may have more)
    const merged = [...new Set([...fromEnv, ...fromStorage])]
    return merged
  } catch {
    return fromEnv
  }
}

// ── Request interceptor: attach access token ─────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: token refresh + VPS handoff ────────────────────────
let refreshing = false
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // VPS Handoff: main server is back online
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

    // 401 → try token refresh once
    if (err.response?.status === 401 && !original._retry && !refreshing) {
      original._retry = true
      refreshing = true
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        if (!refresh_token) throw new Error('no refresh token')
        const dirUrl = getStoredDirUrl()
        const refreshUrl = dirUrl
          ? `${dirUrl}/api/v1/auth/refresh`
          : '/api/v1/auth/refresh'
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
