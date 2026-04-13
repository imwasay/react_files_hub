// import { create } from 'zustand'

// interface AuthState {
//   user: { user_id: string; username: string; email: string; role: string } | null
//   setUser: (user: AuthState['user']) => void
//   logout: () => void
// }

// export const useAuthStore = create<AuthState>((set) => ({
//   user: null,
//   setUser: (user) => set({ user }),
//   logout: () => {
//     localStorage.removeItem('access_token')
//     localStorage.removeItem('refresh_token')
//     set({ user: null })
//   },
// }))
import client from './client'

export const login = async (email: string, password: string) => {
  const res = await client.post('/auth/login', { email, password })
  return res.data
}

export const getMe = async () => {
  const res = await client.get('/auth/me')
  return res.data
} 