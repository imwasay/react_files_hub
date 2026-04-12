import React from 'react'

const STATUS_COLORS: Record<string, string> = {
  online: '#1D9E75',
  offline: '#E24B4A',
  degraded: '#BA7517',
}

interface Props {
  status: string
  cached?: boolean
}

export default function NodeBadge({ status, cached }: Props) {
  const color = STATUS_COLORS[status] || '#888'
  const label = cached && status === 'offline' ? 'cached' : status

  return (
    <span style={{
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 10,
      background: `${color}18`,
      color,
      fontWeight: 500,
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  )
}
