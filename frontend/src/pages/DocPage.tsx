import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFile, resolveStreamUrl } from '../api/files'
import { getDownloadUrl } from '../api/browse'
import UniversalViewer from '../components/UniversalViewer'

export default function DocPage() {
  const { file_id } = useParams<{ file_id: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<any>(null)
  const [streamUrl, setStreamUrl] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file_id) return
    Promise.all([getFile(file_id), resolveStreamUrl(file_id)])
      .then(([f, url]) => { 
        setFile(f)
        setStreamUrl(url)
        setDownloadUrl(getDownloadUrl(file_id))
      })
      .catch(e => setError(e.message || 'Failed to load document'))
      .finally(() => setLoading(false))
  }, [file_id])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)' }}>
      <div style={{ width: 40, height: 40, border: '3px solid var(--border-subtle)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (error || !file) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>
      <p>{error || 'File not found'}</p>
      <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ marginTop: '1rem' }}>← Go back</button>
    </div>
  )

  const handleClose = () => {
    if (file.logical_path) {
      const parts = file.logical_path.split('/')
      parts.pop()
      navigate(`/browse/${parts.join('/')}`)
    } else {
      navigate(-1)
    }
  }

  return (
    <UniversalViewer
      fileId={file_id!}
      filename={file.filename}
      streamUrl={streamUrl}
      downloadUrl={downloadUrl}
      onClose={handleClose}
    />
  )
}
