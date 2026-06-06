import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { useAuthStore } from '../store/auth'
import api, { getFallbackNodeUrls } from '../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const navigate = useNavigate()
  const setUser = useAuthStore(s => s.setUser)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(email, password)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      const { getMe } = await import('../api/auth')
      const user = await getMe()
      setUser(user)
      navigate('/browse')
    } catch (err: any) {
      const hasResponse = Boolean(err?.response)
      const status = err?.response?.status

      if (hasResponse && (status === 401 || status === 422)) {
        // Real auth failure — bad credentials
        triggerShake('Invalid email or password')
        return
      }

      // No response = network error = dir node is unreachable
      // Try each cached storage node as fallback
      const fallbacks = getFallbackNodeUrls()
      for (const nodeUrl of fallbacks) {
        try {
          const res = await fetch(`${nodeUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(5000),
          })
          if (!res.ok) {
            if (res.status === 401) {
              triggerShake('Invalid email or password')
              return
            }
            continue
          }
          const data = await res.json()
          // Switch API client to this fallback node for the session
          localStorage.setItem('dir_node_url', nodeUrl)
          api.defaults.baseURL = `${nodeUrl}/api/v1`
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          // Fetch user profile from fallback node
          const meRes = await fetch(`${nodeUrl}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          })
          if (meRes.ok) {
            const user = await meRes.json()
            setUser(user)
            navigate('/browse')
            return
          }
        } catch {
          continue  // try next fallback
        }
      }

      // All nodes failed
      triggerShake(
        fallbacks.length
          ? 'All servers unreachable. Check your connection.'
          : 'Server unreachable. Check your connection.'
      )
    } finally {
      setLoading(false)
    }
  }

  const triggerShake = (msg: string) => {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    }}>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '2.5rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          animation: shake ? 'shake 0.5s ease-out' : 'slideUp 0.5s var(--ease-out)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'var(--accent-gradient)',
        }} />

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📁</div>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 800,
          }}>
            <span className="accent-gradient-text">Files Hub</span>
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Sign in to access your files
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '0.625rem 0.875rem',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 'var(--radius-md)',
            color: '#f87171',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="input"
              style={{ width: '100%', padding: '0.625rem 0.875rem' }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem', display: 'block' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="input"
              style={{ width: '100%', padding: '0.625rem 0.875rem' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.9375rem',
              marginTop: '0.5rem',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  width: 16, height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block',
                }} />
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div style={{
          textAlign: 'center', marginTop: '1.5rem',
          fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          ntrides.com.au · Files Hub
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
