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

// attempt IPv6 direct fetch with timeout, fallback to proxy url
export const resolveStreamUrl = async (file_id: string): Promise<string> => {
  const strategy = await getServeStrategy(file_id)

  if (strategy.strategy === 'unavailable') {
    throw new Error(strategy.reason)
  }

  if (strategy.strategy === 'direct') {
    const directUrl = strategy.direct.url
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2500)
      await fetch(directUrl, { method: 'HEAD', signal: controller.signal })
      clearTimeout(timeout)
      return directUrl
    } catch {
      // fall through to proxy
    }
    return strategy.proxy_fallback
      ? withToken(`/api/v1/files/${file_id}/stream`)
      : directUrl
  }

  return withToken(`/api/v1/files/${file_id}/stream`)
}
