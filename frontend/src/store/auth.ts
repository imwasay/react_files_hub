import { create } from 'zustand'

type User = {
  user_id: string
  username: string
  email: string
  role: string
} | null

type AuthState = {
  user: User
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    return { user: null }
  }),
}))
