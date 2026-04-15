import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth'
import { getMe } from './api/auth'
import Login from './pages/Login'
import Browse from './pages/Browse'
import Search from './pages/Search'
import Share from './pages/Share'
import Player from './pages/Player'
import Admin from './pages/Admin'
import OfflineBanner from './components/OfflineBanner'

const qc = new QueryClient()

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthStore(s => s.hydrated)

  // Don't make any routing decision until we've tried to restore the session.
  // Without this, React renders with user=null before getMe() resolves and
  // immediately redirects to /login — causing the "logout on refresh" bug.
  if (!hydrated) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: '#aaa', fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const setUser = useAuthStore(s => s.setUser)
  const setHydrated = useAuthStore(s => s.setHydrated)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      getMe()
        .then(user => {
          setUser(user)
          setHydrated()
        })
        .catch(() => {
          // Token expired or invalid — clear it and mark hydrated so
          // RequireAuth can redirect to /login cleanly.
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          setHydrated()
        })
    } else {
      // No token at all — nothing to restore, immediately unblock routing.
      setHydrated()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<Share />} />
          <Route path="/browse/*" element={<RequireAuth><Browse /></RequireAuth>} />
          <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
          <Route path="/play/:file_id" element={<RequireAuth><Player /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/" element={<Navigate to="/browse" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
