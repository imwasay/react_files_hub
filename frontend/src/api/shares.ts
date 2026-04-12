import api from './client'

// shares
export const createShare = (body: {
  target_type: 'file' | 'root'
  target_id: string
  granted_to?: string
  access_level?: string
  allow_reshare?: boolean
  expires_at?: string
}) => api.post('/shares', body).then(r => r.data)

export const listShares = () => api.get('/shares').then(r => r.data)

export const deleteShare = (share_id: string) => api.delete(`/shares/${share_id}`)

export const resolveShareToken = (token: string) =>
  api.get(`/shares/s/${token}`).then(r => r.data)

// search
export const search = (params: {
  q: string
  type?: 'semantic' | 'filename'
  file_type?: string
  node_id?: string
  page?: number
  limit?: number
}) => api.get('/search', { params }).then(r => r.data)

export const askLLM = (q: string, file_ids?: string[]) =>
  api.post('/search/ask', { q, file_ids }).then(r => r.data)
