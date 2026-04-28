import React, { useState } from 'react'
import { getThumbnailUrl } from '../api/browse'

const TYPE_ICONS: Record<string, string> = {
  video: '▶', audio: '♫', image: '🖼', document: '📄', archive: '📦', other: '📎',
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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Props {
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
}

export default function FileRow({
  fileId, filename, fileType, mimeType, sizeBytes, modifiedAt,
  hasThumbnail, nodeStatus, isCached, indexStatus, onClick,
}: Props) {
  const [thumbErr, setThumbErr] = useState(false)
  const isOffline = nodeStatus === 'offline' && !isCached

  return (
    <div
      onClick={() => !isOffline && onClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        borderRadius: 'var(--radius-sm)',
        transition: 'background 0.15s',
        cursor: isOffline ? 'not-allowed' : 'pointer',
        opacity: isOffline ? 0.5 : 1,
        borderBottom: '1px solid var(--border-subtle)',
      }}
      onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Thumbnail / icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {hasThumbnail && !thumbErr ? (
          <img
            src={getThumbnailUrl(fileId)}
            alt=""
            loading="lazy"
            onError={() => setThumbErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1rem' }}>{TYPE_ICONS[fileType] || TYPE_ICONS.other}</span>
        )}
      </div>

      {/* Filename */}
      <div style={{
        flex: 1, minWidth: 0,
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: 'var(--text-heading)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {filename}
      </div>

      {/* Size */}
      <div style={{ width: 80, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
        {formatBytes(sizeBytes)}
      </div>

      {/* Date */}
      <div style={{ width: 100, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, display: 'var(--show-date, block)' }}>
        {formatDate(modifiedAt || null)}
      </div>

      {/* Type */}
      <div style={{ width: 60, fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'center', flexShrink: 0 }}>
        <span style={{
          background: 'var(--surface-0)',
          padding: '0.125rem 0.375rem',
          borderRadius: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>
          {(fileType || '').slice(0, 5)}
        </span>
      </div>

      {/* Status badges */}
      <div style={{ width: 50, display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexShrink: 0 }}>
        {nodeStatus && (
          <span className={`badge badge-${nodeStatus === 'online' ? 'online' : isCached ? 'cached' : 'offline'}`}
            style={{ fontSize: '0.5625rem' }}>
            {isCached ? '⚡' : nodeStatus === 'online' ? '●' : '○'}
          </span>
        )}
      </div>
    </div>
  )
}
