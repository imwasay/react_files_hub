import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { resolveShareToken } from '../api/shares'
import VideoPlayer from '../components/VideoPlayer'
import NodeBadge from '../components/NodeBadge'

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export default function Share() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    resolveShareToken(token)
      .then(setData)
      .catch(e => {
        if (e.response?.status === 410) setError('This share link has expired.')
        else if (e.response?.status === 404) setError('Share link not found.')
        else setError('Failed to load shared file.')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div style={{ padding: 32, fontSize: 14, color: '#888' }}>Loading...</div>

  if (error) return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: '#E24B4A', marginBottom: 16 }}>{error}</div>
      <button onClick={() => navigate('/')} style={{ fontSize: 13, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>
        Go home
      </button>
    </div>
  )

  if (data?.requires_auth) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 16 }}>This file requires login to access.</div>
        <button
          onClick={() => navigate('/login')}
          style={{ padding: '8px 20px', fontSize: 14, borderRadius: 6, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Sign in
        </button>
      </div>
    )
  }

  const isPlayable = data?.file_type === 'video' || data?.file_type === 'audio'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ marginBottom: 4, fontSize: 11, color: '#888' }}>Shared via ntrides</div>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{data?.filename}</h1>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, fontSize: 12, color: '#888' }}>
        <span>{formatBytes(data?.size_bytes || 0)}</span>
        <NodeBadge status={data?.node_status} />
      </div>

      {isPlayable ? (
        <VideoPlayer
          streamUrl={data.stream_url}
          filename={data.filename}
          mimeType={data.file_type === 'video' ? 'video/mp4' : 'audio/mpeg'}
          isMediaLibrary={false}
          fileId={data.file_id}
        />
      ) : (
        <a
          href={data?.stream_url}
          download={data?.filename}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            fontSize: 14,
            borderRadius: 6,
            background: '#534AB7',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          Download {data?.filename}
        </a>
      )}
    </div>
  )
}
