import api from './client'

function withToken(url: string): string {
  const token = localStorage.getItem('access_token')
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${token}`
}

export const listFiles = (params?: {
  root_id?: string
  node_id?: string
  path?: string
  file_type?: string
  page?: number
  limit?: number
}) => api.get('/files', { params }).then(r => r.data)

export const getFile = (file_id: string) =>
  api.get(`/files/${file_id}`).then(r => r.data)

export const getServeStrategy = (file_id: string) =>
  api.get(`/files/${file_id}/serve`).then(r => r.data)

export const deleteFile = (file_id: string) =>
  api.delete(`/files/${file_id}`)

// Resolve the best stream URL for a file:
//   1. Ask directory node for a serve strategy
//   2. If strategy is "direct", HEAD-test the storage node URL (2.5s timeout)
//   3. If reachable → stream directly from storage node (bypasses directory node)
//   4. If unreachable → fall back to directory node proxy
export const resolveStreamUrl = async (file_id: string): Promise<string> => {
  const strategy = await getServeStrategy(file_id)

  if (strategy.strategy === 'unavailable') {
    throw new Error(strategy.reason ?? 'File unavailable')
  }

  if (strategy.strategy === 'direct' && strategy.direct?.url) {
    const directUrl = strategy.direct.url
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2500)
      const res = await fetch(directUrl, { method: 'HEAD', signal: controller.signal })
      clearTimeout(timeout)
      if (res.ok || res.status === 206) return directUrl
    } catch {
      // storage node unreachable — fall through to proxy
    }
  }

  // Proxy fallback: directory node streams it
  return withToken(`/api/v1/files/${file_id}/stream`)
}
