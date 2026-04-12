import React from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import NodeBadge from '../components/NodeBadge'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export default function Admin() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  if (user?.role !== 'admin') {
    return <div style={{ padding: 32, fontSize: 14 }}>Admin access required.</div>
  }

  const { data: nodes } = useQuery({
    queryKey: ['admin-nodes'],
    queryFn: () => api.get('/admin/nodes').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  })

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Admin</h1>
        <button onClick={() => navigate('/browse')} style={{ fontSize: 13, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Browse
        </button>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Nodes</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        {nodes?.map((n: any) => (
          <div key={n.node_id} style={{ padding: 12, borderRadius: 8, border: '1px solid #e0ddd5', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{n.node_id}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Last seen: {n.last_seen ? new Date(n.last_seen).toLocaleString() : 'never'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>
                <div>Cache: {formatBytes(n.cache_used)} / {formatBytes(n.cache_budget)}</div>
                <div style={{ marginTop: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, background: '#eee', width: 100, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: '#534AB7', width: `${Math.min(100, (n.cache_used / n.cache_budget) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <NodeBadge status={n.status} />
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>Users</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users?.map((u: any) => (
          <div key={u.user_id} style={{ padding: 12, borderRadius: 8, border: '1px solid #e0ddd5', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{u.username}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#888' }}>
                Last seen: {u.last_seen ? new Date(u.last_seen).toLocaleString() : 'never'}
              </span>
              <span style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                background: u.role === 'admin' ? '#EEEDFE' : '#F1EFE8',
                color: u.role === 'admin' ? '#534AB7' : '#5F5E5A',
                fontWeight: 500,
              }}>
                {u.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
