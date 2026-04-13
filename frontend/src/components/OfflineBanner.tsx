import React, { useEffect, useState } from 'react'
import api from '../api/client'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const r = await api.get('/health')
        // directory node returns { status: 'ok' } with no dir_node_online field
        // vps-edge returns { dir_node_online: bool }
        // only show banner when dir_node_online is explicitly false
        // undefined (directory node responding directly) means we are online
        if (r.data.dir_node_online === false) {
          setOffline(true)
        } else {
          setOffline(false)
        }
      } catch {
        setOffline(true)
      }
    }

    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!offline) return null

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
      Directory node is offline — read-only mode. Uploads and permission changes are unavailable.
    </div>
  )
}