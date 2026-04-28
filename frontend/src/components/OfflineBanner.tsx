import React, { useEffect, useState } from 'react'
import api from '../api/client'

export default function OfflineBanner() {
  const [status, setStatus] = useState({ offline: false, mode: 'directory', nodeId: '' })

  useEffect(() => {
    const check = async () => {
      try {
        const r = await api.get('/health')
        const data = r.data
        // VPS edge returns { dir_node_online: bool }
        // Storage node returns { node_mode: 'storage', node_id: '...' }
        if (data.dir_node_online === false || data.node_mode === 'storage') {
          setStatus({ offline: true, mode: data.node_mode, nodeId: data.node_id || '' })
        } else {
          setStatus({ offline: false, mode: data.node_mode, nodeId: data.node_id || '' })
        }
      } catch {
        setStatus({ offline: true, mode: 'unknown', nodeId: '' })
      }
    }

    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!status.offline) return null

  let message = 'Directory node is offline — read-only mode. Uploads and permission changes are unavailable.'
  if (status.mode === 'storage') {
    message = `Directory node offline. Sub directory node ${status.nodeId ? `(${status.nodeId}) ` : ''}connected. Read-only mode until main node is back.`
  }

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#BA7517',
      color: '#fff',
      fontSize: 13,
      padding: '8px 16px',
      textAlign: 'center',
    }}>
      {message}
    </div>
  )
}