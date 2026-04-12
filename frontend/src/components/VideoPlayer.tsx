import React, { useEffect, useRef, useState } from 'react'

interface Props {
  streamUrl: string
  filename: string
  mimeType: string
  isMediaLibrary: boolean
  fileId: string
}

// Jellyfin base URL — set this to your local Jellyfin instance
const JELLYFIN_BASE = import.meta.env.VITE_JELLYFIN_URL || ''

export default function VideoPlayer({ streamUrl, filename, mimeType, isMediaLibrary, fileId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [useJellyfin, setUseJellyfin] = useState(false)
  const [error, setError] = useState('')

  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')

  // offer Jellyfin for video files that live in a media library
  const jellyfinAvailable = isVideo && isMediaLibrary && !!JELLYFIN_BASE

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [streamUrl])

  const handleError = () => {
    if (!error) {
      setError('Playback failed. Try downloading the file instead.')
    }
  }

  if (useJellyfin && JELLYFIN_BASE) {
    // open Jellyfin deep link — Jellyfin handles its own auth
    window.open(`${JELLYFIN_BASE}/web/index.html#!/details?id=${fileId}`, '_blank')
    setUseJellyfin(false)
    return null
  }

  return (
    <div style={{ width: '100%', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      {(isVideo || isAudio) ? (
        <>
          <video
            ref={videoRef}
            controls
            style={{ width: '100%', maxHeight: '70vh', display: 'block' }}
            onError={handleError}
            preload="metadata"
          >
            <source src={streamUrl} type={mimeType} />
            Your browser does not support this format.
          </video>

          {jellyfinAvailable && (
            <div style={{ padding: '8px 12px', background: '#111', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setUseJellyfin(true)}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #444',
                  background: 'transparent',
                  color: '#aaa',
                  cursor: 'pointer',
                }}
              >
                Open in Jellyfin
              </button>
            </div>
          )}

          {error && (
            <div style={{ padding: 12, background: '#1a0000', color: '#f09595', fontSize: 13 }}>
              {error}
              <a
                href={streamUrl}
                download={filename}
                style={{ marginLeft: 12, color: '#85B7EB', textDecoration: 'underline' }}
              >
                Download instead
              </a>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: 24, color: '#aaa', fontSize: 14, textAlign: 'center' }}>
          Preview not available.{' '}
          <a href={streamUrl} download={filename} style={{ color: '#85B7EB', textDecoration: 'underline' }}>
            Download {filename}
          </a>
        </div>
      )}
    </div>
  )
}
