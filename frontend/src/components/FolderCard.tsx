import React from 'react'
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
  style?: React.CSSProperties
}

export default function FolderCard({ name, path, itemCount, nodeStatus, onNavigate, style }: Props) {
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

      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  )
}
