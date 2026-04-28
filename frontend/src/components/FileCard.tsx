import React, { useState } from 'react'
import { getThumbnailUrl } from '../api/browse'

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
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

interface FileCardProps {
  fileId: string
  filename: string
  fileType: string
  mimeType?: string
  sizeBytes: number
  modifiedAt?: string | null
  hasThumbnail?: boolean
  nodeStatus?: string
  isCached?: boolean
  indexStatus?: string
  onClick: () => void
  style?: React.CSSProperties
}

export default function FileCard({
  fileId, filename, fileType, mimeType, sizeBytes, modifiedAt,
  hasThumbnail, nodeStatus, isCached, indexStatus, onClick, style,
}: FileCardProps) {
  const [thumbErr, setThumbErr] = useState(false)
  const typeInfo = TYPE_ICONS[fileType] || TYPE_ICONS.other
  const isOffline = nodeStatus === 'offline' && !isCached

  return (
    <div
      onClick={() => !isOffline && onClick()}
      className="glass-card"
      style={{
        cursor: isOffline ? 'not-allowed' : 'pointer',
        opacity: isOffline ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${typeInfo.color}, var(--accent-secondary))`,
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      }} />

      {/* Thumbnail area */}
      <div style={{
        width: '100%',
        aspectRatio: '16/10',
        background: 'rgba(15, 23, 42, 0.5)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {hasThumbnail && !thumbErr ? (
          <img
            src={getThumbnailUrl(fileId)}
            alt=""
            loading="lazy"
            onError={() => setThumbErr(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transition: 'transform 0.3s var(--ease-out)',
            }}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ) : (
          <span style={{ fontSize: '2rem', opacity: 0.6 }}>{typeInfo.emoji}</span>
        )}

        {/* File type badge overlay */}
        <span style={{
          position: 'absolute', bottom: 6, right: 6,
          background: 'rgba(0,0,0,0.6)',
          color: 'white',
          fontSize: '0.625rem',
          fontWeight: 600,
          padding: '0.125rem 0.375rem',
          borderRadius: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {(mimeType?.split('/')[1] || fileType || '').slice(0, 6)}
        </span>
      </div>

      {/* Info */}
      <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div
          title={filename}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-heading)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.4,
          }}
        >
          {filename}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          gap: '0.5rem',
        }}>
          <span>{formatBytes(sizeBytes)}</span>
          <span>{formatDate(modifiedAt || null)}</span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          marginTop: '0.125rem',
        }}>
          {nodeStatus && (
            <span className={`badge badge-${nodeStatus === 'online' ? 'online' : isCached ? 'cached' : 'offline'}`}>
              {isCached ? 'cached' : nodeStatus}
            </span>
          )}
          {indexStatus === 'indexed' && (
            <span className="badge badge-indexed">AI</span>
          )}
        </div>
      </div>
    </div>
  )
}
