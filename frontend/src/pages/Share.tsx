import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { resolveShareToken } from '../api/shares'
import VideoPlayer from '../components/VideoPlayer'

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

  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      color: 'var(--text-muted)', fontSize: 14,
    }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid var(--border-subtle)',
        borderTop: '3px solid var(--accent-primary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
    </div>
  )

  if (error) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    }}>
      <div className="glass" style={{ maxWidth: 480, padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
        <div style={{ color: 'var(--danger)', fontSize: '0.9375rem', marginBottom: '1rem' }}>{error}</div>
        <button onClick={() => navigate('/')} className="btn btn-ghost">Go home</button>
      </div>
    </div>
  )

  if (data?.requires_auth) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      }}>
        <div className="glass" style={{ maxWidth: 480, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
            This file requires login to access.
          </div>
          <button onClick={() => navigate('/login')} className="btn btn-primary">Sign in</button>
        </div>
      </div>
    )
  }

  const isPlayable = data?.file_type === 'video' || data?.file_type === 'audio'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      padding: '2rem 1rem',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: '0.25rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          Shared via Files Hub
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '0.25rem' }}>
          {data?.filename}
        </h1>
        <div style={{
          display: 'flex', gap: '0.75rem', alignItems: 'center',
          marginBottom: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <span>{formatBytes(data?.size_bytes || 0)}</span>
          {data?.node_status && (
            <span className={`badge badge-${data.node_status === 'online' ? 'online' : 'offline'}`}>
              {data.node_status}
            </span>
          )}
        </div>

        {isPlayable ? (
          <VideoPlayer
            streamUrl={data.stream_url}
            filename={data.filename}
            mimeType={data.file_type === 'video' ? 'video/mp4' : 'audio/mpeg'}
            fileId={data.file_id}
          />
        ) : (
          <a
            href={data?.stream_url}
            download={data?.filename}
            className="btn btn-primary"
          >
            ↓ Download {data?.filename}
          </a>
        )}
      </div>
    </div>
  )
}
