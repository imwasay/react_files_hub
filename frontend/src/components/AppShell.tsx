import React, { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { usePreferences } from '../store/preferences'

/* ── SVG Icons (inline to avoid dependency) ───────────────────────────────── */
const Icons = {
  menu: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  files: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  grid: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  list: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  gallery: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  chevDown: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  folder: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  x: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
}

const viewModes: { key: 'grid' | 'list' | 'gallery'; icon: JSX.Element; label: string }[] = [
  { key: 'grid', icon: Icons.grid, label: 'Grid' },
  { key: 'list', icon: Icons.list, label: 'List' },
  { key: 'gallery', icon: Icons.gallery, label: 'Gallery' },
]

const sortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date' },
  { value: 'type', label: 'Type' },
]

interface Props {
  children: React.ReactNode
}

export default function AppShell({ children }: Props) {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { viewMode, sortBy, sortOrder, sidebarOpen, theme, setViewMode, setSortBy, setSortOrder, toggleSidebar, setSidebarOpen, toggleTheme } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchQ, setSearchQ] = React.useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'owner'
  const isBrowse = location.pathname.startsWith('/browse') || location.pathname === '/'

  // Close mobile menu on nav
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  // Close sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    if (mq.matches) setSidebarOpen(false)
  }, [])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQ.trim()) navigate(`/search?q=${encodeURIComponent(searchQ.trim())}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Sidebar overlay (mobile) ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 40, display: 'none',
          }}
          className="sidebar-overlay"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: sidebarOpen || mobileMenuOpen ? 'var(--sidebar-width)' : 0,
          minWidth: sidebarOpen || mobileMenuOpen ? 'var(--sidebar-width)' : 0,
          height: '100vh',
          background: 'var(--surface-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'all 0.3s var(--ease-out)',
          zIndex: 50,
          position: mobileMenuOpen ? 'fixed' : 'relative',
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          minHeight: 'var(--topbar-height)',
        }}>
          <div
            onClick={() => navigate('/browse')}
            style={{
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1.125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>📁</span>
            <span className="accent-gradient-text">Files Hub</span>
          </div>

          {/* Close on mobile */}
          <button
            className="btn-icon"
            onClick={() => { setMobileMenuOpen(false); setSidebarOpen(false) }}
            style={{ display: 'none' }}
            id="sidebar-close-mobile"
          >
            {Icons.x}
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
          <SidebarLink to="/browse" icon={Icons.files} label="My Files" />
          <SidebarLink to="/search" icon={Icons.search} label="Search" />
          {isAdmin && <SidebarLink to="/admin" icon={Icons.shield} label="Admin" />}
        </nav>

        {/* User section */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accent-gradient)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '0.75rem', fontWeight: 700,
              flexShrink: 0,
            }}>
              {(user?.username || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user?.username}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                {user?.role}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button className="btn-icon" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? Icons.sun : Icons.moon}
            </button>
            <button className="btn-icon" onClick={handleLogout} title="Logout" style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
              {Icons.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: 'var(--topbar-height)',
          minHeight: 'var(--topbar-height)',
          background: 'var(--surface-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          gap: '0.75rem',
        }}>
          {/* Hamburger / sidebar toggle */}
          <button
            className="btn-icon"
            onClick={() => {
              if (window.innerWidth <= 768) {
                setMobileMenuOpen(true)
                setSidebarOpen(true)
              } else {
                toggleSidebar()
              }
            }}
            title="Toggle sidebar"
          >
            {Icons.menu}
          </button>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} style={{ flex: 1, maxWidth: 480, display: 'flex' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--surface-0)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '0.25rem 0.75rem',
              transition: 'all 0.2s',
            }}>
              <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{Icons.search}</span>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search files..."
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '0.875rem',
                  outline: 'none', fontFamily: 'var(--font-sans)',
                }}
              />
            </div>
          </form>

          {/* View mode toggles (only on browse pages) */}
          {isBrowse && (
            <div style={{ display: 'flex', gap: '2px', background: 'var(--surface-0)', borderRadius: 'var(--radius-sm)', padding: '2px' }}>
              {viewModes.map(vm => (
                <button
                  key={vm.key}
                  className="btn-icon"
                  onClick={() => setViewMode(vm.key)}
                  title={vm.label}
                  style={{
                    background: viewMode === vm.key ? 'var(--accent-primary)' : 'transparent',
                    color: viewMode === vm.key ? 'white' : 'var(--text-muted)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.375rem',
                  }}
                >
                  {vm.icon}
                </button>
              ))}
            </div>
          )}

          {/* Sort */}
          {isBrowse && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="input"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minWidth: 70 }}
              >
                {sortOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                className="btn-icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                style={{ fontSize: '0.75rem', fontWeight: 700 }}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem',
        }}>
          {children}
        </main>
      </div>

      {/* ── Mobile sidebar overlay style ─────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-overlay { display: block !important; }
          #sidebar-close-mobile { display: flex !important; }
        }
        @media (min-width: 769px) {
          .sidebar-overlay { display: none !important; }
        }
      `}</style>
    </div>
  )
}

/* ── Sidebar nav link ──────────────────────────────────────────────────────── */
function SidebarLink({ to, icon, label }: { to: string; icon: JSX.Element; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
        background: isActive ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
        transition: 'all 0.15s',
        textDecoration: 'none',
      })}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}
