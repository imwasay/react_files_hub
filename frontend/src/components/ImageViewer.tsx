import React, { useState, useEffect, useCallback, useRef } from 'react'

interface ImageInfo {
  fileId: string
  filename: string
  downloadUrl: string
  streamUrl: string
}

interface Props {
  images: ImageInfo[]
  startIndex: number
  onClose: () => void
}

export default function ImageViewer({ images, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })

  const img = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const goNext = useCallback(() => {
    if (hasNext) { setIndex(i => i + 1); resetTransform() }
  }, [hasNext])

  const goPrev = useCallback(() => {
    if (hasPrev) { setIndex(i => i - 1); resetTransform() }
  }, [hasPrev])

  const resetTransform = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5))
      else if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25))
      else if (e.key === '0') resetTransform()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, onClose])

  // Scroll zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom(z => Math.max(0.25, Math.min(z + delta, 5)))
  }, [])

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { ...pan }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    })
  }
  const handleMouseUp = () => setDragging(false)

  // Touch pan
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 || e.touches.length !== 1) return
    const t = e.touches[0]
    setDragging(true)
    dragStart.current = { x: t.clientX, y: t.clientY }
    panStart.current = { ...pan }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return
    const t = e.touches[0]
    setPan({
      x: panStart.current.x + (t.clientX - dragStart.current.x),
      y: panStart.current.y + (t.clientY - dragStart.current.y),
    })
  }
  const handleTouchEnd = () => setDragging(false)

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        zIndex: 10,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
      }}>
        <div style={{
          color: 'white', fontWeight: 600, fontSize: '0.875rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, marginRight: '1rem',
        }}>
          {img?.filename}
          <span style={{ marginLeft: '0.75rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
            {index + 1} / {images.length}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Zoom controls */}
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} className="iv-btn" title="Zoom out">−</button>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', minWidth: 40, textAlign: 'center', lineHeight: '32px' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} className="iv-btn" title="Zoom in">+</button>
          <button onClick={resetTransform} className="iv-btn" title="Reset zoom">⊙</button>

          {/* Download */}
          <a href={img?.downloadUrl} download className="iv-btn" title="Download" style={{ textDecoration: 'none' }}>
            ↓
          </a>

          {/* Close */}
          <button onClick={onClose} className="iv-btn" title="Close" style={{ color: '#ef4444' }}>✕</button>
        </div>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); goPrev() }}
          className="iv-nav-btn"
          style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}
          title="Previous"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); goNext() }}
          className="iv-nav-btn"
          style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}
          title="Next"
        >
          ›
        </button>
      )}

      {/* Image */}
      <div
        style={{
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'hidden',
          cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          key={img?.fileId}
          src={img?.streamUrl}
          alt={img?.filename}
          style={{
            maxWidth: '90vw',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
            userSelect: 'none',
          }}
          draggable={false}
        />
      </div>

      {/* Inline styles for image viewer buttons */}
      <style>{`
        .iv-btn {
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 6px;
          padding: 0.375rem 0.625rem;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          height: 32px;
        }
        .iv-btn:hover {
          background: rgba(255,255,255,0.2);
        }
        .iv-nav-btn {
          background: rgba(0,0,0,0.4);
          color: white;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 50%;
          width: 48px;
          height: 48px;
          cursor: pointer;
          font-size: 1.5rem;
          z-index: 10;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .iv-nav-btn:hover {
          background: rgba(6, 182, 212, 0.3);
          border-color: rgba(6, 182, 212, 0.5);
          transform: translateY(-50%) scale(1.1);
        }
      `}</style>
    </div>
  )
}
