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

  if (loading) return <div style={{ padding: 32, fontSize: 14, color: '#888' }}>Loading...</div>
  if (error) return <div style={{ padding: 32, fontSize: 14, color: '#E24B4A' }}>{error}</div>
  if (!file) return null

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ fontSize: 13, marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#534AB7' }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{file.filename}</h1>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        {file.logical_path} · {file.node.subdomain} · {file.node.status}
      </div>

      <VideoPlayer
        streamUrl={streamUrl}
        filename={file.filename}
        mimeType={file.mime_type}
        isMediaLibrary={file.is_media_library}
        fileId={file_id!}
      />
    </div>
  )
}
