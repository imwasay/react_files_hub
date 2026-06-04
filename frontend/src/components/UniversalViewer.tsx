import React, { useEffect, useRef, useState, useCallback } from 'react'

interface Props {
  fileId: string
  filename: string
  streamUrl: string
  downloadUrl: string
  onClose: () => void
}

type RenderMode = 'pdf' | 'docx' | 'xlsx' | 'text' | 'image' | 'unsupported'

function getMode(filename: string): RenderMode {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['docx', 'doc'].includes(ext)) return 'docx'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx'
  if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log', 'ini', 'conf', 'sh', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css'].includes(ext)) return 'text'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff'].includes(ext)) return 'image'
  return 'unsupported'
}

// ── PDF Renderer (canvas via pdf.js CDN — works perfectly on mobile) ──────────
// ── PDF Page Component (renders a single page inside viewport) ────────────────
const PdfPage = React.memo(function PdfPage({ 
  pdfDoc, 
  pageNum, 
  zoom, 
  onVisible 
}: { 
  pdfDoc: any; 
  pageNum: number; 
  zoom: number; 
  onVisible: (num: number) => void 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(false)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const renderingRef = useRef(false)

  // Get viewport size to allocate space immediately (prevents layout jumping)
  useEffect(() => {
    let active = true
    pdfDoc.getPage(pageNum).then((page: any) => {
      if (!active) return
      const viewport = page.getViewport({ scale: zoom })
      setDimensions({ width: viewport.width, height: viewport.height })
    })
    return () => { active = false }
  }, [pdfDoc, pageNum, zoom])

  // IntersectionObserver to render lazily when page is near the viewport
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !rendered && !renderingRef.current) {
          renderingRef.current = true
          pdfDoc.getPage(pageNum).then((page: any) => {
            const canvas = canvasRef.current
            if (!canvas) return
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const viewport = page.getViewport({ scale: zoom })
            canvas.width = viewport.width
            canvas.height = viewport.height
            page.render({ canvasContext: ctx, viewport }).promise.then(() => {
              setRendered(true)
              renderingRef.current = false
            }).catch(() => {
              renderingRef.current = false
            })
          })
        }
      },
      { rootMargin: '600px 0px' } // Load page when it is 600px close to entering viewport
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [pdfDoc, pageNum, zoom, rendered])

  // Observer to track which page is currently most visible in viewport
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onVisible(pageNum)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [pageNum, onVisible])

  // Reset rendered state when zoom changes
  useEffect(() => {
    setRendered(false)
  }, [zoom])

  const width = dimensions?.width || 500
  const height = dimensions?.height || 700

  return (
    <div 
      ref={containerRef} 
      data-page-number={pageNum}
      style={{ 
        width: `${width}px`, 
        height: `${height}px`, 
        margin: '1rem auto', 
        background: '#fff', 
        borderRadius: 8, 
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        position: 'relative'
      }}
    >
      <canvas 
        ref={canvasRef} 
        style={{ 
          display: rendered ? 'block' : 'none', 
          width: '100%', 
          height: '100%',
          borderRadius: 8
        }} 
      />
      {!rendered && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          color: '#94a3b8',
          fontSize: '0.875rem'
        }}>
          <div className="vw-spinner" style={{ width: 24, height: 24 }} />
          <span>Page {pageNum}</span>
        </div>
      )}
    </div>
  )
})

// ── DOCX Renderer ────────────────────────────────────────────────────────────
function DocxRenderer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled || !containerRef.current) return
        import('docx-preview').then(({ renderAsync }) => {
          if (cancelled || !containerRef.current) return
          containerRef.current.innerHTML = ''
          renderAsync(blob, containerRef.current, undefined, {
            className: 'docx-content',
            inWrapper: true,
            ignoreWidth: false,
            breakPages: true,
            useBase64URL: true,
          }).then(() => setLoading(false)).catch(e => { setErr(String(e)); setLoading(false) })
        })
      })
      .catch(e => { setErr(String(e)); setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  return (
    <>
      <style>{`
        .docx-content { font-family: 'Segoe UI', sans-serif; color: #111; }
        .docx-wrapper { background: #f3f4f6; padding: 2rem; min-height: 100%; }
        .docx-wrapper section { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12); margin-bottom: 1rem; }
      `}</style>
      <div style={{ flex: 1, overflow: 'auto', background: '#f3f4f6', position: 'relative' }}>
        {loading && !err && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: '#94a3b8' }}>
            <div className="vw-spinner" />
            <span>Rendering document…</span>
          </div>
        )}
        {err && <div style={{ padding: '2rem', color: '#ef4444' }}>Failed to render: {err}</div>}
        <div ref={containerRef} />
      </div>
    </>
  )
}

// ── Excel / CSV Renderer ─────────────────────────────────────────────────────
function ExcelRenderer({ url }: { url: string }) {
  const [html, setHtml] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        import('xlsx').then(XLSX => {
          const wb = XLSX.read(buf, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          setHtml(XLSX.utils.sheet_to_html(ws, { id: 'xlsx-table' }))
        })
      })
      .catch(e => setErr(String(e)))
  }, [url])

  return (
    <>
      <style>{`
        #xlsx-table { border-collapse: collapse; font-size: 0.8125rem; font-family: 'Segoe UI', sans-serif; min-width: 100%; }
        #xlsx-table td, #xlsx-table th { border: 1px solid #d1d5db; padding: 0.3rem 0.75rem; white-space: nowrap; }
        #xlsx-table tr:nth-child(even) td { background: #f9fafb; }
        #xlsx-table tr:first-child td { background: #e5e7eb; font-weight: 600; position: sticky; top: 0; }
      `}</style>
      <div style={{ flex: 1, overflow: 'auto', background: '#fff', padding: '1rem' }}>
        {err && <div style={{ color: '#ef4444', padding: '1rem' }}>Failed to render: {err}</div>}
        {!html && !err && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: '#94a3b8' }}>
            <div className="vw-spinner" />
            <span>Loading spreadsheet…</span>
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  )
}

// ── Text Renderer ─────────────────────────────────────────────────────────────
function TextRenderer({ url }: { url: string }) {
  const [text, setText] = useState('')
  useEffect(() => { fetch(url).then(r => r.text()).then(setText) }, [url])
  return (
    <pre style={{ flex: 1, overflow: 'auto', margin: 0, padding: '1.5rem', fontFamily: "'Fira Code', 'Cascadia Code', monospace", fontSize: '0.8125rem', lineHeight: 1.7, color: '#e2e8f0', background: '#0d1117', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text || 'Loading…'}
    </pre>
  )
}

// ── Image Renderer ────────────────────────────────────────────────────────────
function ImageRenderer({ url, filename }: { url: string; filename: string }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
      <img src={url} alt={filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    </div>
  )
}

// ── Unsupported ───────────────────────────────────────────────────────────────
function UnsupportedRenderer({ filename, downloadUrl }: { filename: string; downloadUrl: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#94a3b8' }}>
      <div style={{ fontSize: '3rem' }}>📎</div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#e2e8f0' }}>{filename}</div>
      <div style={{ fontSize: '0.8125rem' }}>This file type cannot be previewed.</div>
      <a href={downloadUrl} download={filename} style={{ marginTop: '0.5rem', padding: '0.5rem 1.25rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem' }}>
        ↓ Download File
      </a>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function UniversalViewer({ fileId, filename, streamUrl, downloadUrl, onClose }: Props) {
  const mode = getMode(filename)
  const isPdf = mode === 'pdf'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#0a0a0a', animation: 'fadeIn 0.15s ease-out' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--accent-gradient)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Filename */}
        <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'white', flex: 1, minWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {mode === 'pdf' ? '📄' : mode === 'docx' ? '📝' : mode === 'xlsx' ? '📊' : mode === 'image' ? '🖼' : mode === 'text' ? '📃' : '📎'} {filename}
        </span>

        {/* PDF page/zoom controls injected from PdfRenderer below via flex ordering */}
        {!isPdf && (
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <a href={downloadUrl} download={filename} className="vw-btn" style={{ textDecoration: 'none', color: 'white' }}>↓ Download</a>
            <button onClick={() => window.open(streamUrl, '_blank')} className="vw-btn">⇱ New Tab</button>
            <button onClick={onClose} className="vw-btn vw-btn-danger">✕ Close</button>
          </div>
        )}

        {/* PDF puts its controls inline via a flex row trick — see below */}
      </div>

      {/* ── Content (PDF has its own sub-toolbar row) ── */}
      {isPdf ? (
        // PDF: render toolbar row + canvas inside a flex column
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Secondary bar for PDF nav/zoom/actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 1rem', background: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', flexShrink: 0 }}>
            <PdfControls streamUrl={streamUrl} filename={filename} downloadUrl={downloadUrl} onClose={onClose} />
          </div>
          <PdfCanvas streamUrl={streamUrl} onClose={onClose} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {mode === 'docx'        && <DocxRenderer url={streamUrl} />}
          {mode === 'xlsx'        && <ExcelRenderer url={streamUrl} />}
          {mode === 'text'        && <TextRenderer url={streamUrl} />}
          {mode === 'image'       && <ImageRenderer url={streamUrl} filename={filename} />}
          {mode === 'unsupported' && <UnsupportedRenderer filename={filename} downloadUrl={downloadUrl} />}
        </div>
      )}

      <style>{`
        .vw-btn {
          background: rgba(255,255,255,0.15); color: white;
          border: 1px solid rgba(255,255,255,0.25);
          padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer;
          font-size: 0.8125rem; font-weight: 500; transition: background 0.15s;
          display: inline-flex; align-items: center; gap: 0.25rem; white-space: nowrap;
        }
        .vw-btn:hover { background: rgba(255,255,255,0.28); }
        .vw-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .vw-btn-danger { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.35); }
        .vw-btn-danger:hover { background: rgba(239,68,68,0.35); }
        .vw-btn-sm {
          background: rgba(255,255,255,0.15); color: white; border: none;
          padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;
          font-size: 0.875rem; transition: background 0.15s;
        }
        .vw-btn-sm:hover { background: rgba(255,255,255,0.3); }
        .vw-badge {
          background: rgba(255,255,255,0.1); padding: 0.35rem 0.75rem;
          border-radius: 6px; font-size: 0.8125rem; color: white; white-space: nowrap;
        }
        .vw-spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(99,102,241,0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.9s linear infinite;
        }
      `}</style>
    </div>
  )
}

// Split PDF into two pieces so controls go in the secondary bar
function PdfControls({ streamUrl, filename, downloadUrl, onClose }: { streamUrl: string; filename: string; downloadUrl: string; onClose: () => void }) {
  // Expose page/zoom via window events — PDF canvas listens
  const dispatch = (type: string) => window.dispatchEvent(new CustomEvent('pdf-ctrl', { detail: type }))
  return (
    <>
      <button onClick={() => dispatch('prev')} className="vw-btn">← Prev</button>
      <span className="vw-badge" id="pdf-page-label">— / —</span>
      <button onClick={() => dispatch('next')} className="vw-btn">Next →</button>
      <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '0.125rem', gap: '0.125rem' }}>
        <button onClick={() => dispatch('zoom-out')} className="vw-btn-sm">−</button>
        <span style={{ padding: '0 0.5rem', fontSize: '0.8125rem', color: 'white', minWidth: 44, textAlign: 'center' }} id="pdf-zoom-label">120%</span>
        <button onClick={() => dispatch('zoom-in')} className="vw-btn-sm">+</button>
      </div>
      <div style={{ flex: 1 }} />
      <a href={downloadUrl} download={filename} className="vw-btn" style={{ textDecoration: 'none', color: 'white' }}>↓ Download</a>
      <button onClick={() => window.open(streamUrl, '_blank')} className="vw-btn">⇱ New Tab</button>
      <button onClick={onClose} className="vw-btn vw-btn-danger">✕ Close</button>
    </>
  )
}

function PdfCanvas({ streamUrl, onClose }: { streamUrl: string; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1.0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pageRef = useRef(page)
  const totalRef = useRef(totalPages)
  pageRef.current = page; totalRef.current = totalPages

  useEffect(() => {
    const loadPdfJs = async () => {
      if ((window as any).pdfjsLib) return
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        script.onload = () => resolve(); script.onerror = reject
        document.head.appendChild(script)
      })
      ;(window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    loadPdfJs().then(async () => {
      try {
        const doc = await (window as any).pdfjsLib.getDocument(streamUrl).promise
        setPdfDoc(doc); setTotalPages(doc.numPages)

        // Calculate initial zoom to fit width of container
        const firstPage = await doc.getPage(1)
        const unscaledViewport = firstPage.getViewport({ scale: 1.0 })
        const width = containerRef.current ? containerRef.current.clientWidth : window.innerWidth
        const padding = 32 // 1rem padding on both sides
        const initialScale = Math.min(2.0, Math.max(0.5, (width - padding) / unscaledViewport.width))
        setZoom(initialScale)
        
        // Update label
        const el = document.getElementById('pdf-zoom-label')
        if (el) el.textContent = `${Math.round(initialScale * 100)}%`

        setLoading(false)
      } catch (e: any) { setError(e.message || 'Failed'); setLoading(false) }
    }).catch(() => setError('Failed to load pdf.js'))
  }, [])

  const handleVisible = useCallback((num: number) => {
    setPage(num)
    const el = document.getElementById('pdf-page-label')
    if (el) el.textContent = `${num} / ${totalRef.current}`
  }, [])

  const scrollToPage = useCallback((num: number) => {
    const pageEl = containerRef.current?.querySelector(`[data-page-number="${num}"]`)
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  useEffect(() => {
    const updateZoomLabel = (z: number) => {
      const el = document.getElementById('pdf-zoom-label')
      if (el) el.textContent = `${Math.round(z * 100)}%`
    }
    const handler = (e: Event) => {
      const type = (e as CustomEvent).detail
      if (type === 'prev') {
        const prev = Math.max(1, pageRef.current - 1)
        scrollToPage(prev)
      } else if (type === 'next') {
        const next = Math.min(totalRef.current, pageRef.current + 1)
        scrollToPage(next)
      } else if (type === 'zoom-in') {
        setZoom(z => { const nz = Math.min(z + 0.25, 4); updateZoomLabel(nz); return nz })
      } else if (type === 'zoom-out') {
        setZoom(z => { const nz = Math.max(z - 0.25, 0.5); updateZoomLabel(nz); return nz })
      }
    }
    const kb = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(1, pageRef.current - 1)
        scrollToPage(prev)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(totalRef.current, pageRef.current + 1)
        scrollToPage(next)
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('pdf-ctrl', handler as EventListener)
    window.addEventListener('keydown', kb)
    return () => { 
      window.removeEventListener('pdf-ctrl', handler as EventListener)
      window.removeEventListener('keydown', kb) 
    }
  }, [onClose, scrollToPage])

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', background: '#0a0a0a' }}>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem', color: '#94a3b8' }}>
          <div className="vw-spinner" />
          <span>Loading PDF…</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
          <div style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>
          <button onClick={() => window.open(streamUrl, '_blank')} className="vw-btn">Open in new tab</button>
        </div>
      ) : (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPage
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNum={pageNum}
              zoom={zoom}
              onVisible={handleVisible}
            />
          ))}
        </div>
      )}
    </div>
  )
}
