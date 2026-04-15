import { create } from 'zustand'

type User = {
  user_id: string
  username: string
  email: string
  role: string
} | null

type AuthState = {
  user: User
  hydrated: boolean   // true once the initial getMe() attempt has completed
  setUser: (user: User) => void
  setHydrated: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  setUser: (user) => set({ user }),
  setHydrated: () => set({ hydrated: true }),
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null })
  },
}))
