import React, { useEffect, useRef, useState, useCallback } from 'react'

interface Props {
  fileId: string
  filename: string
  streamUrl: string
  onClose: () => void
}

export default function PDFViewer({ fileId, filename, streamUrl, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1.5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const renderingRef = useRef(false)
  const pendingRef = useRef<number | null>(null)

  // Load pdf.js from CDN
  useEffect(() => {
    const loadPdfJs = async () => {
      if ((window as any).pdfjsLib) return

      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })

      const pdfjsLib = (window as any).pdfjsLib
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }

    loadPdfJs()
      .then(() => loadPDF())
      .catch(() => setError('Failed to load PDF viewer'))
  }, [])

  const loadPDF = async () => {
    try {
      setLoading(true)
      const pdfjsLib = (window as any).pdfjsLib
      const doc = await pdfjsLib.getDocument(streamUrl).promise
      setPdfDoc(doc)
      setTotalPages(doc.numPages)
      setLoading(false)
    } catch (e: any) {
      setError(`Failed to load PDF: ${e.message || 'Unknown error'}`)
      setLoading(false)
    }
  }

  const renderPage = useCallback(async (num: number) => {
    if (!pdfDoc || !canvasRef.current) return
    if (renderingRef.current) {
      pendingRef.current = num
      return
    }

    renderingRef.current = true
    try {
      const p = await pdfDoc.getPage(num)
      const viewport = p.getViewport({ scale: zoom })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')!
      canvas.height = viewport.height
      canvas.width = viewport.width
      await p.render({ canvasContext: ctx, viewport }).promise
    } catch {
      // ignore render errors
    } finally {
      renderingRef.current = false
      if (pendingRef.current !== null) {
        const pending = pendingRef.current
        pendingRef.current = null
        renderPage(pending)
      }
    }
  }, [pdfDoc, zoom])

  useEffect(() => {
    if (pdfDoc) renderPage(page)
  }, [pdfDoc, page, zoom, renderPage])

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPage(p => Math.max(1, p - 1))
      else if (e.key === 'ArrowRight') setPage(p => Math.min(totalPages, p + 1))
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 4))
      else if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.5))
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [totalPages, onClose])

  const openInNewTab = () => {
    window.open(streamUrl, '_blank')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.95)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      {/* Toolbar */}
      <div style={{
        background: 'var(--accent-gradient)',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          fontSize: '0.9375rem', fontWeight: 600, color: 'white',
          flex: 1, minWidth: 100,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          📄 {filename}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
          {/* Page nav */}
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="pdf-btn"
          >
            ← Prev
          </button>
          <span style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '0.375rem 0.75rem',
            borderRadius: 6,
            fontSize: '0.8125rem',
            color: 'white',
            whiteSpace: 'nowrap',
          }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="pdf-btn"
          >
            Next →
          </button>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.125rem', background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '0.125rem' }}>
            <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="pdf-btn-sm">−</button>
            <span style={{ padding: '0 0.5rem', fontSize: '0.8125rem', color: 'white', minWidth: 50, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))} className="pdf-btn-sm">+</button>
          </div>

          {/* Actions */}
          <a href={streamUrl} download={filename} className="pdf-btn" style={{ textDecoration: 'none', color: 'white' }}>
            ↓ Download
          </a>
          <button onClick={openInNewTab} className="pdf-btn" title="Open in new tab">
            ⇱ New Tab
          </button>
          <button onClick={onClose} className="pdf-btn" style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.3)' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: '1rem',
        background: '#0a0a0a',
      }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: 'var(--text-muted)' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(6,182,212,0.3)',
              borderTop: '3px solid var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span>Loading PDF...</span>
            <button onClick={openInNewTab} className="pdf-btn" style={{ fontSize: '0.8125rem' }}>
              Open in new tab if loading takes too long
            </button>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--danger)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
            <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>
            <button onClick={openInNewTab} className="btn btn-primary">
              Open in new tab instead
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              background: 'white',
            }}
          />
        )}
      </div>

      <style>{`
        .pdf-btn {
          background: rgba(255,255,255,0.15);
          color: white;
          border: 1px solid rgba(255,255,255,0.25);
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .pdf-btn:hover { background: rgba(255,255,255,0.25); }
        .pdf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pdf-btn-sm {
          background: rgba(255,255,255,0.15);
          color: white;
          border: none;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          border-radius: 4px;
          transition: all 0.15s;
        }
        .pdf-btn-sm:hover { background: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  )
}
