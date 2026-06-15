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
  nodeReachable?: boolean
  isCached?: boolean
  indexStatus?: string
  onClick: () => void
  onShare?: (fileId: string, filename: string) => void
}

export default function FileRow({
  fileId, filename, fileType, mimeType, sizeBytes, modifiedAt,
  hasThumbnail, nodeStatus, nodeReachable, isCached, indexStatus, onClick, onShare,
}: Props) {
  const [thumbErr, setThumbErr] = useState(false)
  const [shareHovered, setShareHovered] = useState(false)
  const isOffline = nodeReachable === false && !isCached

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
        opacity: isOffline ? 0.4 : 1,
        filter: isOffline ? 'grayscale(100%)' : 'none',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative',
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
      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
        {isOffline ? (
          <span style={{
            background: '#ef4444',
            color: 'white',
            fontSize: '0.625rem',
            fontWeight: 700,
            padding: '0.125rem 0.375rem',
            borderRadius: 'var(--radius-sm)',
            textTransform: 'uppercase',
          }}>
            Offline
          </span>
        ) : nodeStatus && (
          <span className={`badge badge-${nodeStatus === 'online' ? 'online' : isCached ? 'cached' : 'offline'}`}
            style={{ fontSize: '0.5625rem' }}>
            {isCached ? '⚡' : nodeStatus === 'online' ? '●' : '○'}
          </span>
        )}
        {onShare && !isOffline && (
          <button
            title="Share"
            onClick={e => { e.stopPropagation(); onShare(fileId, filename) }}
            onMouseOver={() => setShareHovered(true)}
            onMouseOut={() => setShareHovered(false)}
            style={{
              padding: '0.2rem 0.45rem',
              borderRadius: 6,
              border: '1px solid',
              borderColor: shareHovered ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.12)',
              background: shareHovered ? 'rgba(6,182,212,0.12)' : 'transparent',
              color: shareHovered ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.6rem',
              fontWeight: 600,
              transition: 'all 0.15s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        )}
      </div>
    </div>
  )
}
