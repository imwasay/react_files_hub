import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFile, resolveStreamUrl } from '../api/files'
import VideoPlayer from '../components/VideoPlayer'

export default function Player() {
  const { file_id } = useParams<{ file_id: string }>()
  const navigate = useNavigate()
  const [file, setFile] = useState<any>(null)
  const [streamUrl, setStreamUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!file_id) return
    Promise.all([getFile(file_id), resolveStreamUrl(file_id)])
      .then(([f, url]) => {
        setFile(f)
        setStreamUrl(url)
      })
      .catch(e => setError(e.message || 'Failed to load file'))
      .finally(() => setLoading(false))
  }, [file_id])

  const handleNavigateToFile = (newFileId: string) => {
    navigate(`/play/${newFileId}`, { replace: true })
    // Reset state for the new file
    setLoading(true)
    setError('')
    setFile(null)
    setStreamUrl('')
    Promise.all([getFile(newFileId), resolveStreamUrl(newFileId)])
      .then(([f, url]) => {
        setFile(f)
        setStreamUrl(url)
      })
      .catch(e => setError(e.message || 'Failed to load file'))
      .finally(() => setLoading(false))
  }

  // Navigate back to the folder, not just browser history
  const handleBack = () => {
    if (file?.logical_path) {
      const parts = file.logical_path.split('/')
      parts.pop() // remove filename
      const folderPath = parts.join('/')
      navigate(`/browse/${folderPath}`)
    } else {
      navigate(-1)
    }
  }

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid var(--border-subtle)',
        borderTop: '3px solid var(--accent-primary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
    </div>
  )

  if (error) return (
    <div style={{
      maxWidth: 600, margin: '4rem auto', textAlign: 'center',
      padding: '2rem',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
      <div style={{ color: 'var(--danger)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>{error}</div>
      <button onClick={handleBack} className="btn btn-ghost">← Go back</button>
    </div>
  )

  if (!file) return null

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <button
          onClick={handleBack}
          className="btn-icon"
          style={{ marginTop: '0.125rem', color: 'var(--accent-primary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--text-heading)',
            wordBreak: 'break-word',
          }}>
            {file.filename}
          </h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.75rem', color: 'var(--text-muted)',
            marginTop: '0.25rem', flexWrap: 'wrap',
          }}>
            <span>{file.logical_path}</span>
            <span>·</span>
            {file.node && (
              <>
                <span className={`badge badge-${file.node.status === 'online' ? 'online' : 'offline'}`}>
                  {file.node.node_id} — {file.node.status}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Video player */}
      <VideoPlayer
        streamUrl={streamUrl}
        filename={file.filename}
        mimeType={file.mime_type || 'video/mp4'}
        fileId={file_id!}
        onNavigateToFile={handleNavigateToFile}
      />
    </div>
  )
}
