import api from './client'

export interface BrowseItem {
  name: string
  type: 'folder' | 'file'
  path: string
  // folder fields
  item_count?: number
  total_size?: number
  node_id?: string
  node_status?: string
  root_id?: string
  // file fields
  file_id?: string
  file_type?: string
  mime_type?: string
  size_bytes?: number
  modified_at?: string
  index_status?: string
  is_cached?: boolean
  has_thumbnail?: boolean
}

export interface BrowseResponse {
  items: BrowseItem[]
  current_path: string
  parent_path: string | null
  breadcrumbs: { name: string; path: string }[]
  root_id?: string
  root_name?: string
  node_id?: string
  error?: string
}

export const browse = (params?: {
  path?: string
  sort?: string
  order?: string
}): Promise<BrowseResponse> =>
  api.get('/browse', { params }).then(r => r.data)

export interface MediaInfo {
  file_id: string
  filename: string
  file_type: string
  mime_type: string
  audio_tracks: {
    index: number
    display_index: number
    language: string
    title: string
    codec: string
    channels: number | null
    browser_compatible: boolean
  }[]
  embedded_subtitles: {
    index: number
    language: string
    title: string
    codec: string
  }[]
  external_subtitles: {
    index: number
    language: string
    title: string
    source: string
  }[]
  next_episode: { file_id: string; filename: string } | null
  prev_episode: { file_id: string; filename: string } | null
  duration_seconds: number | null
}

export const getMediaInfo = (fileId: string): Promise<MediaInfo> =>
  api.get(`/files/${fileId}/media-info`).then(r => r.data)

/**
 * Append the JWT token as a query parameter for direct-browser URLs.
 * <img src>, <video><source>, <a download> etc. can't set Authorization headers.
 */
function withToken(url: string): string {
  const token = localStorage.getItem('access_token')
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${token}`
}

export const getSubtitleUrl = (fileId: string, index: number, source: string = 'embedded') =>
  withToken(`/api/v1/files/${fileId}/subtitle/${index}?source=${source}`)

export const getThumbnailUrl = (fileId: string) =>
  withToken(`/api/v1/files/${fileId}/thumbnail`)

/** Authenticated URL for streaming (video/audio/pdf playback) */
export const getStreamUrl = (fileId: string) =>
  withToken(`/api/v1/files/${fileId}/stream`)

/** Authenticated URL for download */
export const getDownloadUrl = (fileId: string) =>
  withToken(`/api/v1/files/${fileId}/download`)

