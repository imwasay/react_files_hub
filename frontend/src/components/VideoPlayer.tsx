/// <reference types="vite/client" />

import React, { useEffect, useRef, useState } from 'react'
import { getMediaInfo, getSubtitleUrl, type MediaInfo } from '../api/browse'

interface Props {
  streamUrl: string
  filename: string
  mimeType: string
  fileId: string
  onNavigateToFile?: (fileId: string) => void
}

const JELLYFIN_BASE = import.meta.env.VITE_JELLYFIN_URL || ''

export default function VideoPlayer({ streamUrl, filename, mimeType, fileId, onNavigateToFile }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState('')
  const [showSubMenu, setShowSubMenu] = useState(false)
  const [activeSubIndex, setActiveSubIndex] = useState<number | null>(null)
  const [activeSubSource, setActiveSubSource] = useState<string>('embedded')
  const [codecWarning, setCodecWarning] = useState('')

  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')
  const jellyfinAvailable = isVideo && !!JELLYFIN_BASE

  // Load media info
  useEffect(() => {
    getMediaInfo(fileId)
      .then(info => {
        setMediaInfo(info)
        // Check audio codec compatibility
        const primary = info.audio_tracks[0]
        if (primary && !primary.browser_compatible) {
          setCodecWarning(
            `Audio codec '${primary.codec}' may not play in this browser. Try downloading the file instead.`
          )
        }
        // Auto-load first available subtitle
        if (info.external_subtitles.length > 0) {
          loadSubtitle(info.external_subtitles[0].index, 'external')
        }
      })
      .catch(() => {}) // non-critical
  }, [fileId])

  useEffect(() => {
    if (videoRef.current) videoRef.current.load()
  }, [streamUrl])

  const handleError = () => {
    if (!error) setError('Playback failed. Try downloading the file instead.')
  }

  const loadSubtitle = (index: number, source: string) => {
    if (!videoRef.current) return
    const video = videoRef.current

    // Remove existing tracks
    while (video.textTracks.length > 0) {
      const track = video.querySelector('track')
      if (track) track.remove()
      else break
    }

    // Add new track
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = source === 'external' ? 'External' : `Track ${index}`
    track.srclang = 'en'
    track.src = getSubtitleUrl(fileId, index, source)
    track.default = true
    video.appendChild(track)

    // Enable the track
    setTimeout(() => {
      if (video.textTracks[0]) {
        video.textTracks[0].mode = 'showing'
      }
    }, 100)

    setActiveSubIndex(index)
    setActiveSubSource(source)
    setShowSubMenu(false)
  }

  const disableSubtitles = () => {
    if (!videoRef.current) return
    for (let i = 0; i < videoRef.current.textTracks.length; i++) {
      videoRef.current.textTracks[i].mode = 'hidden'
    }
    setActiveSubIndex(null)
    setShowSubMenu(false)
  }

  const handleNextEp = () => {
    if (mediaInfo?.next_episode && onNavigateToFile) {
      onNavigateToFile(mediaInfo.next_episode.file_id)
    }
  }

  const handlePrevEp = () => {
    if (mediaInfo?.prev_episode && onNavigateToFile) {
      onNavigateToFile(mediaInfo.prev_episode.file_id)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'N') handleNextEp()
      if (e.shiftKey && e.key === 'P') handlePrevEp()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mediaInfo])

  const allSubs = [
    ...(mediaInfo?.embedded_subtitles || []).map(s => ({ ...s, source: 'embedded' })),
    ...(mediaInfo?.external_subtitles || []).map(s => ({ ...s, source: 'external' })),
  ]

  return (
    <div style={{ width: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#000' }}>
      {/* Accent bar */}
      <div style={{ height: 3, background: 'var(--accent-gradient)' }} />

      {(isVideo || isAudio) ? (
        <>
          <video
            ref={videoRef}
            controls
            style={{ width: '100%', maxHeight: '75vh', display: 'block', background: '#000' }}
            onError={handleError}
            preload="metadata"
            crossOrigin="anonymous"
          >
            <source src={streamUrl} type={mimeType} />
            Your browser does not support this format.
          </video>

          {/* Control bar */}
          <div style={{
            background: '#111',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}>
            {/* Prev episode */}
            {mediaInfo?.prev_episode && (
              <button onClick={handlePrevEp} className="vp-ctrl-btn" title={`Previous: ${mediaInfo.prev_episode.filename}`}>
                ⏮ Prev
              </button>
            )}

            {/* Next episode */}
            {mediaInfo?.next_episode && (
              <button onClick={handleNextEp} className="vp-ctrl-btn" title={`Next: ${mediaInfo.next_episode.filename}`}>
                Next ⏭
              </button>
            )}

            {/* Subtitle toggle */}
            {allSubs.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowSubMenu(!showSubMenu)}
                  className="vp-ctrl-btn"
                  style={activeSubIndex !== null ? { color: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' } : {}}
                >
                  CC {activeSubIndex !== null ? '●' : '○'}
                </button>

                {showSubMenu && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0,
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.25rem',
                    minWidth: 160,
                    marginBottom: 4,
                    zIndex: 10,
                    boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
                  }}>
                    <button
                      onClick={disableSubtitles}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '0.375rem 0.625rem', background: activeSubIndex === null ? '#333' : 'transparent',
                        color: '#eee', border: 'none', cursor: 'pointer', borderRadius: 4,
                        fontSize: '0.8125rem',
                      }}
                    >
                      Off
                    </button>
                    {allSubs.map(s => (
                      <button
                        key={`${s.source}-${s.index}`}
                        onClick={() => loadSubtitle(s.index, s.source)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.375rem 0.625rem',
                          background: activeSubIndex === s.index && activeSubSource === s.source ? '#333' : 'transparent',
                          color: '#eee', border: 'none', cursor: 'pointer', borderRadius: 4,
                          fontSize: '0.8125rem',
                        }}
                      >
                        {s.title} ({s.language})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Audio tracks */}
            {mediaInfo && mediaInfo.audio_tracks.length > 1 && (
              <select
                onChange={e => {
                  // Note: switching HTML5 video audio tracks is not fully supported
                  // in all browsers. This is informational.
                  const track = mediaInfo.audio_tracks[parseInt(e.target.value)]
                  if (track && !track.browser_compatible) {
                    setCodecWarning(`Audio codec '${track.codec}' may not play in this browser.`)
                  } else {
                    setCodecWarning('')
                  }
                }}
                className="input"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: '#222', color: '#eee', borderColor: '#444' }}
              >
                {mediaInfo.audio_tracks.map((t, i) => (
                  <option key={t.index} value={i}>
                    🔊 {t.title} ({t.language}) — {t.codec}
                  </option>
                ))}
              </select>
            )}

            <div style={{ flex: 1 }} />

            {/* Jellyfin */}
            {jellyfinAvailable && (
              <button
                onClick={() => window.open(`${JELLYFIN_BASE}/web/index.html#!/details?id=${fileId}`, '_blank')}
                className="vp-ctrl-btn"
              >
                Open in Jellyfin
              </button>
            )}

            {/* Download */}
            <a href={streamUrl} download={filename} className="vp-ctrl-btn" style={{ textDecoration: 'none', color: '#aaa' }}>
              ↓ Download
            </a>
          </div>

          {/* Codec warning */}
          {codecWarning && (
            <div style={{
              padding: '0.5rem 0.75rem',
              background: 'rgba(245, 158, 11, 0.1)',
              borderTop: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#f59e0b',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              ⚠ {codecWarning}
            </div>
          )}

          {/* Playback error */}
          {error && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(239,68,68,0.1)',
              borderTop: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171',
              fontSize: '0.8125rem',
            }}>
              {error}
              <a href={streamUrl} download={filename} style={{ marginLeft: '0.75rem', color: 'var(--accent-primary)', textDecoration: 'underline' }}>
                Download instead
              </a>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '3rem', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
          Preview not available.{' '}
          <a href={streamUrl} download={filename} style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>
            Download {filename}
          </a>
        </div>
      )}

      <style>{`
        .vp-ctrl-btn {
          background: rgba(255,255,255,0.05);
          color: #aaa;
          border: 1px solid #333;
          border-radius: 6px;
          padding: 0.25rem 0.625rem;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .vp-ctrl-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #eee;
          border-color: #555;
        }
      `}</style>
    </div>
  )
}
