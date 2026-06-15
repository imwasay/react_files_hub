import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { resolveShareToken } from '../api/shares'
import VideoPlayer from '../components/VideoPlayer'
import Browse from './Browse'
import UniversalViewer from '../components/UniversalViewer'

const TYPE_ICONS: Record<string, { emoji: string; color: string }> = {
  video: { emoji: '▶', color: '#ef4444' },
  audio: { emoji: '♫', color: '#8b5cf6' },
  image: { emoji: '🖼', color: '#10b981' },
  document: { emoji: '📄', color: '#3b82f6' },
  archive: { emoji: '📦', color: '#f59e0b' },
  other: { emoji: '📎', color: '#64748b' },
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
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

  const bgStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 1rem',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  }

  if (loading) return (
    <div style={bgStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid rgba(148,163,184,0.15)',
          borderTop: '3px solid #06b6d4',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading shared content…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (error) return (
    <div style={bgStyle}>
      <div style={{
        maxWidth: 440, width: '100%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,163,184,0.12)',
        borderRadius: 20,
        padding: '2.5rem 2rem',
        textAlign: 'center',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          {error.includes('expired') ? '⏰' : '🔗'}
        </div>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          {error.includes('expired') ? 'Link Expired' : 'Link Not Found'}
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          {error}
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.625rem 1.5rem',
            borderRadius: 10,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: '#e2e8f0',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Go Home
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (data?.requires_auth) {
    return (
      <div style={bgStyle}>
        <div style={{
          maxWidth: 440, width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(148,163,184,0.12)',
          borderRadius: 20,
          padding: '2.5rem 2rem',
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
            Login Required
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            This file requires authentication to access.
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '0.625rem 1.5rem',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  const typeInfo = TYPE_ICONS[data?.file_type] || TYPE_ICONS.other
  const isPlayable = data?.file_type === 'video' || data?.file_type === 'audio'
  const isImage = data?.file_type === 'image'
  const isDocument = data?.file_type === 'document' || /\.(pdf|docx|doc|xlsx|xls|csv|pptx|md|txt|json|xml|yaml|yml|log|ini|conf|sh|py|js|ts|jsx|tsx|html|css)\s*$/i.test(data?.filename || '')

  // Shared folder — render full browse UI (works for both root and sub-folder shares)
  if (data?.target_type === 'root' || data?.target_type === 'folder') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-color, #0f172a)',
      }}>
        <div style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))',
          borderBottom: '1px solid rgba(148,163,184,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              color: '#06b6d4', fontSize: '0.75rem', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Shared Folder
            </div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#f8fafc', fontWeight: 700 }}>{data.filename}</h1>
          </div>
          <a
            href={data.download_url}
            className="share-download-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(6,182,212,0.25)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Folder
          </a>
        </div>
        <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
          <Browse shareToken={token} />
        </div>
        <style>{`
          .share-download-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(6,182,212,0.35) !important; }
        `}</style>
      </div>
    )
  }

  // ── Single-file share — go directly into preview ──────────────────────
  // Video / Audio → fullscreen VideoPlayer
  if (isPlayable) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: '1.25rem' }}>{typeInfo.emoji}</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9375rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data?.filename}
          </span>
          <a
            href={data?.download_url || data?.stream_url}
            download={data?.filename}
            style={{ padding: '0.35rem 0.75rem', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'white', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500 }}
          >
            ↓ Download
          </a>
        </div>
        <div style={{ flex: 1 }}>
          <VideoPlayer
            streamUrl={data.stream_url}
            filename={data.filename}
            mimeType={data.file_type === 'video' ? 'video/mp4' : 'audio/mpeg'}
            fileId={data.file_id}
          />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Image → fullscreen image view
  if (isImage) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.25rem' }}>🖼</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9375rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data?.filename}
          </span>
          <a
            href={data?.download_url || data?.stream_url}
            download={data?.filename}
            style={{ padding: '0.35rem 0.75rem', borderRadius: 6, background: 'rgba(255,255,255,0.12)', color: 'white', textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500 }}
          >
            ↓ Download
          </a>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflow: 'auto' }}>
          <img
            src={data.stream_url}
            alt={data.filename}
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          />
        </div>
      </div>
    )
  }

  // Document → UniversalViewer (open immediately)
  if (isDocument) {
    return (
      <UniversalViewer
        fileId={data.file_id}
        filename={data.filename}
        streamUrl={data.stream_url}
        downloadUrl={data.download_url || data.stream_url}
        onClose={() => navigate('/')}
      />
    )
  }

  // Unknown file type — show a clean download card
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .share-download-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(6,182,212,0.35) !important; }
      `}</style>

      <div style={{
        maxWidth: 440, width: '100%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,163,184,0.1)',
        borderRadius: 24,
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        animation: 'slideUp 0.35s ease both',
        boxShadow: '0 32px 64px rgba(0,0,0,0.3)',
      }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${typeInfo.color}, #3b82f6)` }} />
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 1rem',
            background: `rgba(${typeInfo.color.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',')}, 0.15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
          }}>
            {typeInfo.emoji}
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.375rem' }}>
            {data?.filename}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.5rem' }}>
            {formatBytes(data?.size_bytes || 0)} · Preview not available for this file type
          </div>
          <a
            href={data?.download_url || data?.stream_url}
            download={data?.filename}
            className="share-download-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 2rem', borderRadius: 12,
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
              color: 'white', fontWeight: 700, fontSize: '0.9375rem',
              textDecoration: 'none', transition: 'all 0.25s ease',
              boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download {data?.filename}
          </a>
          <div style={{ marginTop: '1.5rem', fontSize: '0.6875rem', color: '#334155' }}>
            Shared securely via Files Hub · {window.location.hostname}
          </div>
        </div>
      </div>
    </div>
  )
}
