import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth'
import { getMe } from './api/auth'
import './store/preferences' // initialize theme from localStorage
import Login from './pages/Login'
import Browse from './pages/Browse'
import Search from './pages/Search'
import Share from './pages/Share'
import Player from './pages/Player'
import DocPage from './pages/DocPage'
import Admin from './pages/Admin'
import AppShell from './components/AppShell'
import OfflineBanner from './components/OfflineBanner'

const qc = new QueryClient()

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthStore(s => s.hydrated)

  if (!hydrated) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid var(--border-subtle)',
            borderTop: '3px solid var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  )
}

export default function App() {
  const setUser = useAuthStore(s => s.setUser)
  const setHydrated = useAuthStore(s => s.setHydrated)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      getMe()
        .then(user => { setUser(user); setHydrated() })
        .catch(() => {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          setHydrated()
        })
    } else {
      setHydrated()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          {/* Public routes (no AppShell) */}
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<Share />} />

          {/* Authenticated routes (with AppShell) */}
          <Route path="/browse/*" element={<AuthenticatedApp><Browse /></AuthenticatedApp>} />
          <Route path="/search" element={<AuthenticatedApp><Search /></AuthenticatedApp>} />
          <Route path="/play/:file_id" element={<AuthenticatedApp><Player /></AuthenticatedApp>} />
          <Route path="/doc/:file_id" element={<AuthenticatedApp><DocPage /></AuthenticatedApp>} />
          <Route path="/admin" element={<AuthenticatedApp><Admin /></AuthenticatedApp>} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/browse" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
