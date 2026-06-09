import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import NodeBadge from '../components/NodeBadge'
import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

const TABS = ['System', 'Nodes', 'Mapped Roots', 'Access Control', 'Users', 'Files', 'Cache', 'Shares', 'Search Index'] as const
type Tab = typeof TABS[number]

// ── base components ────────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #e0ddd5', background: '#fff', ...style }}>
      {children}
    </div>
  )
}

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: color || '#222' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

function Btn({ onClick, children, danger, disabled, primary, small }: {
  onClick: () => void; children: React.ReactNode
  danger?: boolean; disabled?: boolean; primary?: boolean; small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: small ? 11 : 12,
        padding: small ? '3px 8px' : '5px 11px',
        borderRadius: 5,
        border: `1px solid ${danger ? '#E24B4A' : primary ? '#534AB7' : '#ccc'}`,
        color: danger ? '#E24B4A' : primary ? '#534AB7' : '#333',
        background: primary ? '#534AB715' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: primary ? 500 : 400,
      }}
    >{children}</button>
  )
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${color}18`, color, fontWeight: 500 }}>
      {text}
    </span>
  )
}

function FieldRow({ label, value, onChange, type, placeholder, width, required }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; width?: number; required?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 11, color: '#777' }}>{label}{required && <span style={{ color: '#E24B4A' }}> *</span>}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ padding: '6px 10px', fontSize: 13, borderRadius: 5, border: '1px solid #d0cdc6', width: width || 160, outline: 'none' }}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 11, color: '#777' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: '6px 10px', fontSize: 13, borderRadius: 5, border: '1px solid #d0cdc6' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function FormBox({ onSubmit, children, error, success }: {
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode; error?: string; success?: string
}) {
  return (
    <Card>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        {children}
      </form>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#E24B4A' }}>{error}</div>}
      {success && <div style={{ marginTop: 8, fontSize: 12, color: '#1D9E75' }}>{success}</div>}
    </Card>
  )
}

// ── tab: System ───────────────────────────────────────────────────────────────

function SystemTab() {
  const { data: sys, isLoading } = useQuery({
    queryKey: ['admin-system'],
    queryFn: () => api.get('/admin/system').then(r => r.data),
    refetchInterval: 30_000,
  })

  const INDEX_COLOR: Record<string, string> = {
    indexed: '#1D9E75', pending: '#BA7517', failed: '#E24B4A', skipped: '#888', processing: '#378ADD'
  }

  if (isLoading) return <div style={{ fontSize: 13, color: '#aaa' }}>Loading system info…</div>

  return (
    <>
      <Section title="Registry counts">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatBox label="Users" value={sys?.counts?.users ?? 0} />
          <StatBox label="Nodes" value={sys?.counts?.nodes ?? 0} />
          <StatBox label="Mapped roots" value={sys?.counts?.roots ?? 0} />
          <StatBox label="Files" value={sys?.counts?.files ?? 0} />
          <StatBox label="Shares" value={sys?.counts?.shares ?? 0} />
          <StatBox label="Registry DB" value={formatBytes(sys?.db_size_bytes ?? 0)} sub="SQLite" />
        </div>
      </Section>

      <Section title="Index status">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(sys?.index_status ?? {}).map(([status, count]) => (
            <StatBox key={status} label={status} value={count as number} color={INDEX_COLOR[status]} />
          ))}
          {Object.keys(sys?.index_status ?? {}).length === 0 && (
            <div style={{ fontSize: 13, color: '#aaa' }}>No files indexed yet.</div>
          )}
        </div>
      </Section>

      <Section title="Mapped root disk usage">
        {sys?.roots_disk?.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No mapped roots.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sys?.roots_disk?.map((r: any) => (
            <Card key={r.root_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.logical_name}</div>
                  <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{r.real_path}</div>
                </div>
                {r.accessible ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#555' }}>
                      {formatBytes(r.used_bytes)} used / {formatBytes(r.total_bytes)} total
                    </div>
                    <div style={{ marginTop: 4, height: 4, width: 160, borderRadius: 2, background: '#eee' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: (r.used_bytes / r.total_bytes) > 0.9 ? '#E24B4A' : '#534AB7',
                        width: `${Math.min(100, (r.used_bytes / r.total_bytes) * 100).toFixed(1)}%`,
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{formatBytes(r.free_bytes)} free</div>
                  </div>
                ) : (
                  <Badge text="not mounted" color="#E24B4A" />
                )}
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── tab: Nodes ────────────────────────────────────────────────────────────────

function NodesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [nId, setNId] = useState('')
  const [nWgIp, setNWgIp] = useState('')
  const [nOwner, setNOwner] = useState('')
  const [nOs, setNOs] = useState('linux')
  const [nError, setNError] = useState('')
  const [nToken, setNToken] = useState('')

  const { data: nodes, isLoading } = useQuery({
    queryKey: ['admin-nodes'],
    queryFn: () => api.get('/admin/nodes').then(r => r.data),
    refetchInterval: 15_000,
  })

  const evictCache = useMutation({
    mutationFn: (node_id: string) => api.post('/admin/cache/evict', { node_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-nodes'] }),
  })

  const deleteNode = useMutation({
    mutationFn: (node_id: string) => api.delete(`/admin/nodes/${node_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-nodes'] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Delete failed'),
  })

  const registerNode = async (e: React.FormEvent) => {
    e.preventDefault()
    setNError(''); setNToken('')
    try {
      const r = await api.post('/admin/nodes', {
        node_id: nId,
        node_ip: nWgIp || undefined, owner_username: nOwner, host_os: nOs,
      })
      setNToken(r.data.federation_token)
      qc.invalidateQueries({ queryKey: ['admin-nodes'] })
      setNId(''); setNWgIp(''); setNOwner('')
    } catch (e: any) {
      setNError(e.response?.data?.detail || 'Registration failed')
    }
  }

  const STATUS_COLOR: Record<string, string> = { online: '#1D9E75', offline: '#888', degraded: '#BA7517' }

  const fetchInviteToken = async () => {
    try {
      const { data } = await api.get('/nodes/invite-token')
      // Determine the best URL to embed. If the master node configured NODE_IP with multiple routes,
      // we embed ALL of them comma-separated so the joining node can try them all and fallback!
      let syncUrl = data.suggested_ips?.join(',')
      if (!syncUrl) {
        const host = window.location.origin
        syncUrl = host.startsWith('https') ? host : host.replace(/:[0-9]+$/, '') + ':8000'
      }
      const payload = {
        url: syncUrl,
        secret: data.jwt_secret
      }
      const token = btoa(JSON.stringify(payload))
      setNToken(`MESH_JOIN_TOKEN=${token}`)
    } catch (e: any) {
      alert('Failed to generate invite token')
    }
  }

  return (
    <>
      <Section
        title="Registered nodes"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={fetchInviteToken}>🔑 Get Invite Token</Btn>
            <Btn primary onClick={() => setShowForm(v => !v)}>{showForm ? 'Cancel' : '+ Register node manually'}</Btn>
          </div>
        }
      >
        {showForm && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>Register storage node</div>
            <form onSubmit={registerNode} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <FieldRow label="Node ID" value={nId} onChange={setNId} placeholder="alice-home" required width={160} />
              <FieldRow label="Node IP (Comma-separated routes)" value={nWgIp} onChange={setNWgIp} placeholder="10.72.0.x, example.com" width={230} />
              <FieldRow label="Owner username" value={nOwner} onChange={setNOwner} placeholder="admin" required width={140} />
              <SelectField label="OS" value={nOs} onChange={setNOs}
                options={[{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }]} />
              <button type="submit" style={{ padding: '7px 16px', fontSize: 13, borderRadius: 5, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Register
              </button>
            </form>
            {nError && <div style={{ marginTop: 8, fontSize: 12, color: '#E24B4A' }}>{nError}</div>}
          </Card>
        )}

        {nToken && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #86efac', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 4 }}>✓ Token Generated — Give this to the new node owner to paste during setup:</div>
              <code style={{ fontSize: 11, wordBreak: 'break-all', color: '#15803d' }}>{nToken}</code>
            </div>
            <Btn onClick={() => { navigator.clipboard.writeText(nToken); alert('Copied to clipboard!') }} small>Copy</Btn>
          </div>
        )}

        {isLoading && <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>}

        {nodes?.length === 0 && !showForm && (
          <Card>
            <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '16px 0' }}>
              No nodes yet. The self-node registers automatically on startup. Click "Register node" to add a friend's machine.
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nodes?.map((n: any) => (
            <Card key={n.node_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{n.node_id}</span>
                    <Badge text={n.status} color={STATUS_COLOR[n.status] || '#888'} />
                    {n.host_os && <Badge text={n.host_os} color="#555" />}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#777' }}>
                    {n.node_ip && <span>🔒 {n.node_ip}</span>}
                    <span>owner: {n.owner}</span>
                    <span>{n.root_count} roots · {n.file_count} files</span>
                    <span>Last seen: {timeAgo(n.last_seen)}</span>
                  </div>
                  {n.cache_budget > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>Cache: {formatBytes(n.cache_used)} / {formatBytes(n.cache_budget)}</div>
                      <div style={{ height: 4, width: 200, borderRadius: 2, background: '#eee' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: '#534AB7', width: `${Math.min(100, ((n.cache_used || 0) / Math.max(n.cache_budget, 1)) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn onClick={() => evictCache.mutate(n.node_id)} disabled={evictCache.isPending} small>Evict cache</Btn>
                  <Btn danger small onClick={() => { if (confirm(`Delete node ${n.node_id}?`)) deleteNode.mutate(n.node_id) }}>Delete</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── tab: Mapped Roots ─────────────────────────────────────────────────────────

function MappedRootsTab() {
  const qc = useQueryClient()
  const [nodeId, setNodeId] = useState('')
  const [logicalName, setLogicalName] = useState('')
  const [realPath, setRealPath] = useState('')
  const [isMedia, setIsMedia] = useState('no')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const { data: roots, isLoading } = useQuery({
    queryKey: ['admin-roots'],
    queryFn: () => api.get('/admin/roots').then(r => r.data),
  })
  const { data: nodes } = useQuery({
    queryKey: ['admin-nodes'],
    queryFn: () => api.get('/admin/nodes').then(r => r.data),
  })

  const addRoot = useMutation({
    mutationFn: (body: any) => api.post('/admin/roots', body),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['admin-roots'] })
      const msg = d.data.already_existed
        ? 'Root already exists — no duplicate created.'
        : 'Root added. Background scan started (may take a minute for large folders).'
      setFormSuccess(msg); setFormError('')
      setLogicalName(''); setRealPath(''); setIsMedia('no')
    },
    onError: (e: any) => { setFormError(e.response?.data?.detail || 'Failed'); setFormSuccess('') },
  })

  const deleteRoot = useMutation({
    mutationFn: (root_id: string) => api.delete(`/admin/roots/${root_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-roots'] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Delete failed'),
  })

  const rescan = useMutation({
    mutationFn: (root_id: string) => api.post(`/admin/roots/${root_id}/rescan`),
    onSuccess: () => alert('Rescan triggered — check Files tab in a minute'),
    onError: (e: any) => alert(e.response?.data?.detail || 'Rescan failed'),
  })

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setFormSuccess('')
    const node = nodeId || nodes?.[0]?.node_id
    if (!node) { setFormError('No node selected.'); return }
    if (!realPath.trim()) { setFormError('Real path required.'); return }
    addRoot.mutate({
      node_id: node,
      logical_name: logicalName.trim() || realPath.split('/').pop() || 'root',
      real_path: realPath.trim(),
      is_media_library: isMedia === 'yes',
    })
  }

  const PRESETS = [
    { label: 'WD2T', path: '/mnt/WD2T' },
    { label: 'WD2T/Movies', path: '/mnt/WD2T/Movies' },
    { label: 'WD2T/Studies', path: '/mnt/WD2T/Studies' },
    { label: 'Seagate500G', path: '/mnt/Seagate500G' },
    { label: 'WD1T ISOs', path: '/mnt/WD1T/Downloads/iso' },
  ]

  return (
    <>
      <Section title="Add mapped root">
        <Card>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 11, color: '#777' }}>Node</label>
                <select value={nodeId} onChange={e => setNodeId(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: 13, borderRadius: 5, border: '1px solid #d0cdc6', minWidth: 160 }}>
                  {nodes?.map((n: any) => <option key={n.node_id} value={n.node_id}>{n.node_id}</option>)}
                </select>
              </div>
              <FieldRow label="Logical name" value={logicalName} onChange={setLogicalName} placeholder="Movies" width={150} />
              <FieldRow label="Real path on disk" value={realPath} onChange={setRealPath} placeholder="/mnt/WD2T/Movies" width={260} />
              <SelectField label="Media library?" value={isMedia} onChange={setIsMedia}
                options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes (Jellyfin fallback)' }]} />
              <button type="submit" disabled={addRoot.isPending}
                style={{ padding: '7px 16px', fontSize: 13, borderRadius: 5, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer', opacity: addRoot.isPending ? 0.6 : 1 }}>
                {addRoot.isPending ? 'Adding…' : 'Add root'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#aaa' }}>Presets:</span>
              {PRESETS.map(p => (
                <button key={p.path} type="button" onClick={() => { setRealPath(p.path); setLogicalName(p.label) }}
                  style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd', background: realPath === p.path ? '#534AB715' : '#fafafa', color: '#555', cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {formError && <div style={{ fontSize: 12, color: '#E24B4A' }}>{formError}</div>}
            {formSuccess && <div style={{ fontSize: 12, color: '#1D9E75' }}>{formSuccess}</div>}
          </form>
        </Card>
      </Section>

      <Section title={`Mapped roots (${roots?.length ?? 0})`}>
        {isLoading && <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>}
        {roots?.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No mapped roots. Add one above.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {roots?.map((r: any) => (
            <Card key={r.root_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.logical_name}</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#666', marginTop: 2 }}>{r.real_path}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#aaa' }}>node: {r.node_id}</span>
                  <span style={{ fontSize: 11, color: '#aaa' }}>{r.file_count} files</span>
                  {r.is_media_library && <Badge text="media library" color="#378ADD" />}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <NodeBadge status={r.node_status} />
                <Btn primary small onClick={() => { if (confirm(`Rescan ${r.logical_name}?`)) rescan.mutate(r.root_id) }}>Rescan</Btn>
                <Btn danger small onClick={() => { if (confirm(`Remove "${r.logical_name}" and all its files from registry?`)) deleteRoot.mutate(r.root_id) }}>Remove</Btn>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── tab: Access Control ───────────────────────────────────────────────────────

function AccessControlTab() {
  const qc = useQueryClient()
  const [selectedRoot, setSelectedRoot] = useState('')
  const [selectedUser, setSelectedUser] = useState('')
  const [grantError, setGrantError] = useState('')
  const [grantSuccess, setGrantSuccess] = useState('')

  const { data: roots } = useQuery({ queryKey: ['admin-roots'], queryFn: () => api.get('/admin/roots').then(r => r.data) })
  const { data: users } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get('/admin/users').then(r => r.data) })
  const { data: grants, refetch: refetchGrants } = useQuery({
    queryKey: ['admin-grants', selectedRoot],
    queryFn: () => selectedRoot ? api.get(`/admin/roots/${selectedRoot}/grants`).then(r => r.data) : [],
    enabled: !!selectedRoot,
  })

  const grantAccess = useMutation({
    mutationFn: ({ root_id, user_id }: { root_id: string; user_id: string }) =>
      api.post(`/admin/roots/${root_id}/grants`, { user_id }),
    onSuccess: (d) => {
      refetchGrants()
      const msg = d.data.already_existed ? 'User already has access to this root.' : `Access granted to ${d.data.granted_to}.`
      setGrantSuccess(msg); setGrantError('')
    },
    onError: (e: any) => { setGrantError(e.response?.data?.detail || 'Grant failed'); setGrantSuccess('') },
  })

  const revokeGrant = useMutation({
    mutationFn: (grant_id: string) => api.delete(`/admin/grants/${grant_id}`),
    onSuccess: () => refetchGrants(),
    onError: (e: any) => alert(e.response?.data?.detail || 'Revoke failed'),
  })

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault(); setGrantError(''); setGrantSuccess('')
    if (!selectedRoot || !selectedUser) { setGrantError('Select both a root and a user.'); return }
    grantAccess.mutate({ root_id: selectedRoot, user_id: selectedUser })
  }

  return (
    <>
      <Section title="Grant root access to user">
        <Card>
          <p style={{ fontSize: 12, color: '#777', marginBottom: 12, lineHeight: 1.6 }}>
            By default only the node owner sees its files. Grant other users access to a mapped root so its files appear in their Browse view.
          </p>
          <form onSubmit={handleGrant} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: '#777' }}>Mapped root <span style={{ color: '#E24B4A' }}>*</span></label>
              <select value={selectedRoot} onChange={e => setSelectedRoot(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13, borderRadius: 5, border: '1px solid #d0cdc6', minWidth: 220 }}>
                <option value="">Select a root…</option>
                {roots?.map((r: any) => <option key={r.root_id} value={r.root_id}>{r.logical_name} ({r.node_id})</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: '#777' }}>User <span style={{ color: '#E24B4A' }}>*</span></label>
              <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 13, borderRadius: 5, border: '1px solid #d0cdc6', minWidth: 180 }}>
                <option value="">Select a user…</option>
                {users?.map((u: any) => <option key={u.user_id} value={u.user_id}>{u.username} ({u.role})</option>)}
              </select>
            </div>
            <button type="submit" disabled={grantAccess.isPending}
              style={{ padding: '7px 16px', fontSize: 13, borderRadius: 5, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Grant access
            </button>
          </form>
          {grantError && <div style={{ marginTop: 8, fontSize: 12, color: '#E24B4A' }}>{grantError}</div>}
          {grantSuccess && <div style={{ marginTop: 8, fontSize: 12, color: '#1D9E75' }}>{grantSuccess}</div>}
        </Card>
      </Section>

      {selectedRoot && (
        <Section title={`Current grants for: ${roots?.find((r: any) => r.root_id === selectedRoot)?.logical_name ?? selectedRoot}`}>
          {grants?.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No grants yet — only the node owner can see this root.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grants?.map((g: any) => (
              <Card key={g.grant_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{g.granted_to_username}</span>
                  <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>granted {timeAgo(g.created_at)}</span>
                </div>
                <Btn danger small onClick={() => { if (confirm(`Revoke access for ${g.granted_to_username}?`)) revokeGrant.mutate(g.grant_id) }}>
                  Revoke
                </Btn>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

// ── tab: Users ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient()
  const [uname, setUname] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [role, setRole] = useState('viewer')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const { data: users, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get('/admin/users').then(r => r.data) })

  const changeRole = useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: string }) => api.patch(`/admin/users/${user_id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const deactivate = useMutation({
    mutationFn: (uid: string) => api.patch(`/admin/users/${uid}`, { active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const deleteUser = useMutation({
    mutationFn: (uid: string) => api.delete(`/admin/users/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Delete failed'),
  })

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setOk('')
    try {
      await api.post('/admin/users', { username: uname, email, password: pass, role })
      setOk(`User "${uname}" created with role "${role}".`)
      setUname(''); setEmail(''); setPass(''); setRole('viewer')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (e: any) {
      setErr(e.response?.data?.detail || 'Failed to create user')
    }
  }

  const ROLE_COLORS: Record<string, string> = { owner: '#534AB7', admin: '#378ADD', viewer: '#5F5E5A', deactivated: '#E24B4A' }

  return (
    <>
      <Section title="Create user">
        <FormBox onSubmit={createUser} error={err} success={ok}>
          <FieldRow label="Username" value={uname} onChange={setUname} width={140} required />
          <FieldRow label="Email" value={email} onChange={setEmail} type="email" width={200} required />
          <FieldRow label="Password" value={pass} onChange={setPass} type="password" width={140} required />
          <SelectField label="Role" value={role} onChange={setRole} options={[
            { value: 'viewer', label: 'Viewer' },
            { value: 'admin', label: 'Admin' },
            { value: 'owner', label: 'Owner' },
          ]} />
          <button type="submit"
            style={{ padding: '7px 16px', fontSize: 13, borderRadius: 5, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Create
          </button>
        </FormBox>
      </Section>

      <Section title={`All users (${users?.length ?? 0})`}>
        {isLoading && <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users?.map((u: any) => (
            <Card key={u.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.username}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Joined {timeAgo(u.created_at)} · Last seen {timeAgo(u.last_seen)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge text={u.role} color={ROLE_COLORS[u.role] || '#888'} />
                <select defaultValue={u.role} onChange={e => changeRole.mutate({ user_id: u.user_id, role: e.target.value })}
                  style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #ccc' }}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <Btn small onClick={() => { if (confirm(`Deactivate ${u.username}?`)) deactivate.mutate(u.user_id) }}>Deactivate</Btn>
                <Btn danger small onClick={() => { if (confirm(`Permanently delete ${u.username}?`)) deleteUser.mutate(u.user_id) }}>Delete</Btn>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── tab: Files ────────────────────────────────────────────────────────────────

function FilesTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterNode, setFilterNode] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-files-all', page, filterType, filterNode, filterStatus],
    queryFn: () => api.get('/admin/files', {
      params: { page, limit: 30, file_type: filterType || undefined, node_id: filterNode || undefined, index_status: filterStatus || undefined }
    }).then(r => r.data),
  })

  const { data: nodes } = useQuery({ queryKey: ['admin-nodes'], queryFn: () => api.get('/admin/nodes').then(r => r.data) })

  const reindex = useMutation({ mutationFn: (fid: string) => api.patch(`/admin/files/${fid}/reindex`) })

  const reindexAll = useMutation({
    mutationFn: () => api.post('/admin/files/reindex-all'),
    onSuccess: (d) => { alert(`Queued ${d.data.queued} files for re-indexing.`); qc.invalidateQueries({ queryKey: ['admin-files-all'] }) },
  })

  const deleteFile = useMutation({
    mutationFn: (fid: string) => api.delete(`/files/${fid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-files-all'] }),
  })

  const INDEX_COLOR: Record<string, string> = { indexed: '#1D9E75', pending: '#BA7517', failed: '#E24B4A', skipped: '#888', processing: '#378ADD' }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}
          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 5, border: '1px solid #ccc' }}>
          <option value="">All types</option>
          {['video', 'audio', 'image', 'document', 'archive', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterNode} onChange={e => { setFilterNode(e.target.value); setPage(1) }}
          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 5, border: '1px solid #ccc' }}>
          <option value="">All nodes</option>
          {nodes?.map((n: any) => <option key={n.node_id} value={n.node_id}>{n.node_id}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 5, border: '1px solid #ccc' }}>
          <option value="">All statuses</option>
          {['pending', 'processing', 'indexed', 'failed', 'skipped'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#888' }}>{data?.total ?? 0} files</span>
          <Btn onClick={() => reindexAll.mutate()} disabled={reindexAll.isPending}>Reindex all failed/skipped</Btn>
        </div>
      </div>

      {isLoading && <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data?.files?.map((f: any) => (
          <Card key={f.file_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>
                {f.root_name && <span style={{ marginRight: 6 }}>📁 {f.root_name}</span>}
                {formatBytes(f.size_bytes)}
              </div>
              <div style={{ fontSize: 10, color: '#bbb', fontFamily: 'monospace', marginTop: 1 }}>{f.logical_path}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Badge text={f.index_status} color={INDEX_COLOR[f.index_status] || '#888'} />
              <NodeBadge status={f.node_status} />
              <Btn small onClick={() => reindex.mutate(f.file_id)}>Reindex</Btn>
              <Btn danger small onClick={() => { if (confirm(`Remove ${f.filename}?`)) deleteFile.mutate(f.file_id) }}>Remove</Btn>
            </div>
          </Card>
        ))}
      </div>

      {(data?.total ?? 0) > 30 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
          <Btn onClick={() => setPage(p => p - 1)} disabled={page === 1}>Prev</Btn>
          <span style={{ fontSize: 13, lineHeight: '28px', color: '#888' }}>Page {page} of {Math.ceil((data?.total ?? 0) / 30)}</span>
          <Btn onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil((data?.total ?? 0) / 30)}>Next</Btn>
        </div>
      )}
    </>
  )
}

// ── tab: Cache ────────────────────────────────────────────────────────────────

function CacheTab() {
  const qc = useQueryClient()
  const { data: nodes } = useQuery({ queryKey: ['admin-nodes'], queryFn: () => api.get('/admin/nodes').then(r => r.data) })

  const evictAll = useMutation({
    mutationFn: () => api.post('/admin/cache/evict', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-nodes'] }),
  })

  const evictNode = useMutation({
    mutationFn: (nid: string) => api.post('/admin/cache/evict', { node_id: nid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-nodes'] }),
  })

  const totalBudget = nodes?.reduce((s: number, n: any) => s + (n.cache_budget || 0), 0) ?? 0
  const totalUsed = nodes?.reduce((s: number, n: any) => s + (n.cache_used || 0), 0) ?? 0

  return (
    <>
      <Section title="Global cache">
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13 }}>Total: <strong>{formatBytes(totalUsed)}</strong> of <strong>{formatBytes(totalBudget)}</strong></div>
              <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: '#eee', width: 300 }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#534AB7', width: `${Math.min(100, (totalUsed / Math.max(totalBudget, 1)) * 100)}%` }} />
              </div>
            </div>
            <Btn danger onClick={() => { if (confirm('Evict ALL cached files?')) evictAll.mutate() }}>Evict all</Btn>
          </div>
        </Card>
      </Section>

      <Section title="Per-node cache">
        {nodes?.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No nodes.</div>}
        {nodes?.map((n: any) => (
          <Card key={n.node_id} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{n.node_id}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{formatBytes(n.cache_used)} / {formatBytes(n.cache_budget)}</div>
              <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#eee', width: 160 }}>
                <div style={{ height: '100%', borderRadius: 2, background: '#534AB7', width: `${Math.min(100, ((n.cache_used || 0) / Math.max(n.cache_budget, 1)) * 100)}%` }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <NodeBadge status={n.status} />
              <Btn danger small onClick={() => { if (confirm(`Evict cache on ${n.node_id}?`)) evictNode.mutate(n.node_id) }}>Evict</Btn>
            </div>
          </Card>
        ))}
      </Section>
    </>
  )
}

// ── tab: Shares ───────────────────────────────────────────────────────────────

function SharesTab() {
  const qc = useQueryClient()
  const { data: shares, isLoading } = useQuery({ queryKey: ['admin-shares'], queryFn: () => api.get('/admin/shares').then(r => r.data) })

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-shares'] }),
  })

  return (
    <Section title={`All shares (${shares?.length ?? 0})`}>
      {isLoading && <div style={{ fontSize: 13, color: '#aaa' }}>Loading…</div>}
      {shares?.length === 0 && <div style={{ fontSize: 13, color: '#aaa' }}>No shares.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shares?.map((s: any) => (
          <Card key={s.share_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{s.target_type === 'file' ? '📄 File share' : '📁 Root access grant'}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>
                by {s.granted_by} → {s.granted_to || 'public'}
                {s.expires_at ? ` · expires ${new Date(s.expires_at).toLocaleDateString()}` : ''}
              </div>
              {s.share_url && <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{s.share_url}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {s.is_public ? <Badge text="public" color="#378ADD" /> : <Badge text="private" color="#888" />}
              <Btn danger small onClick={() => revoke.mutate(s.share_id)}>Revoke</Btn>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

// ── tab: Search Index ─────────────────────────────────────────────────────────

function SearchIndexTab() {
  const qc = useQueryClient()
  const { data: sys } = useQuery({ queryKey: ['admin-system'], queryFn: () => api.get('/admin/system').then(r => r.data) })
  const { data: failed } = useQuery({
    queryKey: ['admin-files-failed'],
    queryFn: () => api.get('/admin/files', { params: { index_status: 'failed', limit: 50 } }).then(r => r.data),
  })
  const { data: pending } = useQuery({
    queryKey: ['admin-files-pending'],
    queryFn: () => api.get('/admin/files', { params: { index_status: 'pending', limit: 50 } }).then(r => r.data),
  })

  const reindexAll = useMutation({
    mutationFn: () => api.post('/admin/files/reindex-all'),
    onSuccess: (d) => { alert(`Queued ${d.data.queued} files.`); qc.invalidateQueries() },
  })

  const INDEX_COLOR: Record<string, string> = { indexed: '#1D9E75', pending: '#BA7517', failed: '#E24B4A', skipped: '#888', processing: '#378ADD' }

  return (
    <>
      <Section title="Index status" action={<Btn onClick={() => reindexAll.mutate()} disabled={reindexAll.isPending}>Reindex all failed/skipped</Btn>}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.entries(sys?.index_status ?? {}).map(([status, count]) => (
            <StatBox key={status} label={status} value={count as number} color={INDEX_COLOR[status]} />
          ))}
        </div>
      </Section>

      {(failed?.total ?? 0) > 0 && (
        <Section title={`Failed (${failed?.total})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {failed?.files?.map((f: any) => (
              <Card key={f.file_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{f.logical_path}</div>
                </div>
                <Badge text="failed" color="#E24B4A" />
              </Card>
            ))}
          </div>
        </Section>
      )}

      {(pending?.total ?? 0) > 0 && (
        <Section title={`Pending (${pending?.total})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending?.files?.map((f: any) => (
              <Card key={f.file_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.filename}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{f.root_name}</div>
                </div>
                <Badge text="pending" color="#BA7517" />
              </Card>
            ))}
          </div>
        </Section>
      )}

      {(failed?.total ?? 0) === 0 && (pending?.total ?? 0) === 0 && (
        <div style={{ fontSize: 13, color: '#aaa' }}>All indexed or skipped.</div>
      )}
    </>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Admin() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('System')

  if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
    return <div style={{ padding: 32, fontSize: 14 }}>Admin access required.</div>
  }

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Admin Panel</h1>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>files_hub directory node</div>
        </div>
        <button onClick={() => navigate('/browse')}
          style={{ fontSize: 13, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Browse
        </button>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e0ddd5', flexWrap: 'wrap', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            fontSize: 13, padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            color: activeTab === tab ? '#534AB7' : '#888',
            borderBottom: activeTab === tab ? '2px solid #534AB7' : '2px solid transparent',
            fontWeight: activeTab === tab ? 600 : 400,
            marginBottom: -1,
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'System' && <SystemTab />}
      {activeTab === 'Nodes' && <NodesTab />}
      {activeTab === 'Mapped Roots' && <MappedRootsTab />}
      {activeTab === 'Access Control' && <AccessControlTab />}
      {activeTab === 'Users' && <UsersTab />}
      {activeTab === 'Files' && <FilesTab />}
      {activeTab === 'Cache' && <CacheTab />}
      {activeTab === 'Shares' && <SharesTab />}
      {activeTab === 'Search Index' && <SearchIndexTab />}
    </div>
  )
}