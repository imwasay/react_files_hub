import { create } from 'zustand'

type ViewMode = 'grid' | 'list' | 'gallery'
type SortBy = 'name' | 'size' | 'date' | 'type'
type SortOrder = 'asc' | 'desc'
type Theme = 'dark' | 'light'

interface PreferencesState {
  viewMode: ViewMode
  sortBy: SortBy
  sortOrder: SortOrder
  sidebarOpen: boolean
  theme: Theme
  setViewMode: (m: ViewMode) => void
  setSortBy: (s: SortBy) => void
  setSortOrder: (o: SortOrder) => void
  toggleSidebar: () => void
  setSidebarOpen: (o: boolean) => void
  toggleTheme: () => void
}

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`fh_${key}`)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

function savePref(key: string, value: any) {
  try { localStorage.setItem(`fh_${key}`, JSON.stringify(value)) } catch {}
}

export const usePreferences = create<PreferencesState>((set) => ({
  viewMode: loadPref<ViewMode>('viewMode', 'grid'),
  sortBy: loadPref<SortBy>('sortBy', 'name'),
  sortOrder: loadPref<SortOrder>('sortOrder', 'asc'),
  sidebarOpen: loadPref<boolean>('sidebarOpen', true),
  theme: loadPref<Theme>('theme', 'dark'),

  setViewMode: (m) => { savePref('viewMode', m); set({ viewMode: m }) },
  setSortBy: (s) => { savePref('sortBy', s); set({ sortBy: s }) },
  setSortOrder: (o) => { savePref('sortOrder', o); set({ sortOrder: o }) },
  toggleSidebar: () => set((s) => {
    const v = !s.sidebarOpen
    savePref('sidebarOpen', v)
    return { sidebarOpen: v }
  }),
  setSidebarOpen: (o) => { savePref('sidebarOpen', o); set({ sidebarOpen: o }) },
  toggleTheme: () => set((s) => {
    const v = s.theme === 'dark' ? 'light' : 'dark'
    savePref('theme', v)
    document.documentElement.setAttribute('data-theme', v)
    return { theme: v }
  }),
}))

// Apply saved theme on load
const savedTheme = loadPref<Theme>('theme', 'dark')
document.documentElement.setAttribute('data-theme', savedTheme)
