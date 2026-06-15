import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { search, askLLM } from '../api/shares'
import ShareModal from '../components/ShareModal'

export default function Search() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const [q, setQ] = useState(initialQ)
  const [submitted, setSubmitted] = useState(initialQ)
  const [mode, setMode] = useState<'semantic' | 'filename'>('semantic')
  const [askAnswer, setAskAnswer] = useState<any>(null)
  const [asking, setAsking] = useState(false)

  // Auto-submit from URL param
  useEffect(() => {
    if (initialQ) setSubmitted(initialQ)
  }, [initialQ])

  const { data, isLoading } = useQuery({
    queryKey: ['search', submitted, mode],
    queryFn: () => search({ q: submitted, type: mode }),
    enabled: !!submitted,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(q)
    setAskAnswer(null)
  }

  const handleAsk = async () => {
    setAsking(true)
    try {
      const result = await askLLM(q)
      setAskAnswer(result)
    } catch {
      setAskAnswer({ answer: 'LLM is currently unavailable.', sources: [] })
    } finally {
      setAsking(false)
    }
  }

  const handleResultClick = (r: any) => {
    if (r.file_type === 'video' || r.file_type === 'audio') {
      navigate(`/play/${r.file_id}`)
    } else if (r.path) {
      const parts = r.path.split('/')
      parts.pop()
      navigate(`/browse/${parts.join('/')}`)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{
        fontSize: '1.125rem',
        fontWeight: 700,
        marginBottom: '1rem',
        color: 'var(--text-heading)',
      }}>
        Search
      </h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--surface-0)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '0.25rem 0.75rem',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>🔍</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search your files..."
            autoFocus
            style={{
              flex: 1, border: 'none', background: 'transparent',
              color: 'var(--text-primary)', fontSize: '0.875rem',
              outline: 'none', fontFamily: 'var(--font-sans)',
              padding: '0.375rem 0',
            }}
          />
        </div>
        <select
          value={mode}
          onChange={e => setMode(e.target.value as any)}
          className="input"
          style={{ fontSize: '0.8125rem' }}
        >
          <option value="semantic">Semantic</option>
          <option value="filename">Filename</option>
        </select>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {submitted && data?.llm_available && (
        <button
          onClick={handleAsk}
          disabled={asking}
          className="btn btn-ghost"
          style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}
        >
          {asking ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{
                width: 14, height: 14,
                border: '2px solid var(--border-medium)',
                borderTop: '2px solid var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }} />
              Asking...
            </span>
          ) : (
            '✨ Ask AI about these files'
          )}
        </button>
      )}

      {askAnswer && (
        <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
            AI Answer
          </div>
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {askAnswer.answer}
          </div>
          {askAnswer.sources?.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              Sources: {askAnswer.sources.map((s: any) => s.filename).join(', ')}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data?.results?.map((r: any) => (
          <SearchResultRow
            key={r.file_id}
            result={r}
            onClick={() => handleResultClick(r)}
          />
        ))}
        {submitted && !isLoading && data?.results?.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '3rem',
            color: 'var(--text-muted)', fontSize: '0.875rem',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>🔍</div>
            No results found for "{submitted}"
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Search result row with inline share button ─────────────────────────── */
function SearchResultRow({ result, onClick }: { result: any; onClick: () => void }) {
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string; type: 'file' | 'root' } | null>(null)
  const [shareHovered, setShareHovered] = useState(false)

  return (
    <>
      <div
        className="glass-card"
        style={{
          padding: '0.75rem 1rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <div
          onClick={onClick}
          style={{ flex: 1, minWidth: 0 }}
        >
          <div style={{
            fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-heading)',
            marginBottom: '0.125rem',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {result.name}
          </div>
          <div style={{
            fontSize: '0.6875rem', color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {result.path}
          </div>
          {result.snippet && (
            <div style={{
              marginTop: '0.375rem',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              "{result.snippet}..."
            </div>
          )}
        </div>

        {result.file_id && (
          <button
            title="Share"
            onClick={e => { e.stopPropagation(); setShareTarget({ id: result.file_id, name: result.name, type: 'file' }) }}
            onMouseOver={() => setShareHovered(true)}
            onMouseOut={() => setShareHovered(false)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 7,
              border: '1px solid',
              borderColor: shareHovered ? 'rgba(6,182,212,0.4)' : 'rgba(148,163,184,0.15)',
              background: shareHovered ? 'rgba(6,182,212,0.12)' : 'transparent',
              color: shareHovered ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              transition: 'all 0.15s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        )}
      </div>

      {shareTarget && (
        <ShareModal
          target={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </>
  )
}
