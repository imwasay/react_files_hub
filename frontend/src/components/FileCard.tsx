import React from 'react'
import { useNavigate } from 'react-router-dom'
import NodeBadge from './NodeBadge'

const TYPE_ICONS: Record<string, string> = {
  video: '▶',
  audio: '♪',
  image: '◻',
  document: '≡',
  archive: '◈',
  other: '·',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface Props {
  file: {
    file_id: string
    filename: string
    logical_path: string
    file_type: string
    size_bytes: number
    node_status: string
    index_status: string
    is_cached: boolean
  }
  onNavigate: (path: string) => void
}

export default function FileCard({ file, onNavigate }: Props) {
  const navigate = useNavigate()
  const icon = TYPE_ICONS[file.file_type] || TYPE_ICONS.other
  const isPlayable = file.file_type === 'video' || file.file_type === 'audio'
  const isOffline = file.node_status === 'offline' && !file.is_cached

  const handleClick = () => {
    if (isOffline) return
    if (isPlayable) {
      navigate(`/play/${file.file_id}`)
    } else {
      // for non-playable, trigger download
      window.open(`/api/v1/files/${file.file_id}/download`, '_blank')
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        padding: 12,
        borderRadius: 8,
        border: '1px solid #e0ddd5',
        background: '#fff',
        cursor: isOffline ? 'not-allowed' : 'pointer',
        opacity: isOffline ? 0.5 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (!isOffline) (e.currentTarget as HTMLElement).style.borderColor = '#534AB7' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e0ddd5' }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.filename}
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>{formatBytes(file.size_bytes)}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <NodeBadge status={file.node_status} cached={file.is_cached} />
        {file.index_status === 'indexed' && (
          <span style={{ fontSize: 10, color: '#1D9E75' }}>AI indexed</span>
        )}
      </div>
    </div>
  )
}
