import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listFiles } from '../api/files'
import FileCard from '../components/FileCard'
import NodeBadge from '../components/NodeBadge'
import { useAuthStore } from '../store/auth'

export default function Browse() {
  const [path, setPath] = useState('')
  const [fileType, setFileType] = useState('')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  const { data, isLoading } = useQuery({
    queryKey: ['files', path, fileType, page],
    queryFn: () => listFiles({ path: path || undefined, file_type: fileType || undefined, page, limit: 50 }),
  })

  const breadcrumbs = path.split('/').filter(Boolean)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Files</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <button onClick={() => navigate('/admin')} style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>
              Admin
            </button>
          )}
          <select
            value={fileType}
            onChange={e => { setFileType(e.target.value); setPage(1) }}
            style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc' }}
          >
            <option value="">All types</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="image">Image</option>
            <option value="document">Document</option>
            <option value="archive">Archive</option>
          </select>
          <button onClick={() => navigate('/search')} style={{ fontSize: 13, padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}>
            Search
          </button>
        </div>
      </div>

      {/* breadcrumb */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, fontSize: 13, flexWrap: 'wrap' }}>
        <span style={{ cursor: 'pointer', color: '#534AB7' }} onClick={() => setPath('')}>Home</span>
        {breadcrumbs.map((seg, i) => (
          <React.Fragment key={i}>
            <span style={{ color: '#aaa' }}>/</span>
            <span
              style={{ cursor: 'pointer', color: '#534AB7' }}
              onClick={() => setPath(breadcrumbs.slice(0, i + 1).join('/'))}
            >
              {seg}
            </span>
          </React.Fragment>
        ))}
      </div>

      {isLoading && <p style={{ fontSize: 14, color: '#888' }}>Loading...</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {data?.files?.map((f: any) => (
          <FileCard key={f.file_id} file={f} onNavigate={setPath} />
        ))}
      </div>

      {data?.total > 50 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center' }}>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span style={{ fontSize: 13, lineHeight: '28px' }}>Page {page}</span>
          <button onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
