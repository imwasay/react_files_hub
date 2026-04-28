import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// attach access token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// on 401 — try refresh, retry once, else logout
let refreshing = false
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    
    // VPS Handoff logic: If VPS proxy says main server is back online
    if (err.response?.status === 421) {
      if (!document.getElementById('vps-handoff-overlay')) {
        const overlay = document.createElement('div')
        overlay.id = 'vps-handoff-overlay'
        overlay.style.position = 'fixed'
        overlay.style.top = '0'
        overlay.style.left = '0'
        overlay.style.width = '100vw'
        overlay.style.height = '100vh'
        overlay.style.backgroundColor = 'rgba(0,0,0,0.9)'
        overlay.style.color = 'white'
        overlay.style.display = 'flex'
        overlay.style.flexDirection = 'column'
        overlay.style.alignItems = 'center'
        overlay.style.justifyContent = 'center'
        overlay.style.zIndex = '99999'
        overlay.innerHTML = `
          <h1 style="font-size:24px;margin-bottom:16px;">Main Server Online</h1>
          <p style="font-size:16px;color:#ccc;margin-bottom:24px;text-align:center;">The primary directory node is back online.<br>Please wait for DNS propagation or refresh to reconnect.</p>
          <button onclick="window.location.reload()" style="padding:10px 20px;font-size:16px;cursor:pointer;background:#534AB7;color:white;border:none;border-radius:6px;">Refresh Page</button>
        `
        document.body.appendChild(overlay)
      }
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original._retry && !refreshing) {
      original._retry = true
      refreshing = true
      try {
        const refresh_token = localStorage.getItem('refresh_token')
        if (!refresh_token) throw new Error('no refresh token')
        const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token })
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
