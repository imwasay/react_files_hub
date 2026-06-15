import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const FolderIcons = {
  closed: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
        fill="url(#foldergrad)" stroke="none"/>
      <defs><linearGradient id="foldergrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#3b82f6"/>
      </linearGradient></defs>
    </svg>
  ),
}

interface Props {
  name: string
  path: string
  itemCount?: number
  nodeStatus?: string
  onNavigate: (path: string) => void
  onShare?: (path: string, name: string) => void
  style?: React.CSSProperties
}

export default function FolderCard({ name, path, itemCount, nodeStatus, onNavigate, onShare, style }: Props) {
  const [shareHovered, setShareHovered] = useState(false)
  return (
    <div
      onClick={() => onNavigate(path)}
      className="glass-card"
      style={{
        padding: '1.25rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'var(--accent-gradient)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
      }} />

      {FolderIcons.closed}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: 'var(--text-heading)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginTop: '0.125rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {itemCount !== undefined && <span>{itemCount} items</span>}
          {nodeStatus && (
            <span className={`badge badge-${nodeStatus === 'online' ? 'online' : 'offline'}`}>
              {nodeStatus}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {onShare && (
          <button
            title="Share folder"
            onClick={e => { e.stopPropagation(); onShare(path, name) }}
            onMouseOver={() => setShareHovered(true)}
            onMouseOut={() => setShareHovered(false)}
            style={{
              padding: '0.2rem 0.45rem',
              borderRadius: 6,
              border: '1px solid',
              borderColor: shareHovered ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.15)',
              background: shareHovered ? 'rgba(6,182,212,0.12)' : 'transparent',
              color: shareHovered ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.6rem',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        )}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>
  )
}
