import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { search, askLLM } from '../api/shares'
import FileCard from '../components/FileCard'

export default function Search() {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [mode, setMode] = useState<'semantic' | 'filename'>('semantic')
  const [askMode, setAskMode] = useState(false)
  const [askAnswer, setAskAnswer] = useState<any>(null)
  const [asking, setAsking] = useState(false)

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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 16 }}>Search</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search your files..."
          style={{ flex: 1, padding: '8px 12px', fontSize: 14, borderRadius: 6, border: '1px solid #ccc' }}
        />
        <select
          value={mode}
          onChange={e => setMode(e.target.value as any)}
          style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc' }}
        >
          <option value="semantic">Semantic</option>
          <option value="filename">Filename</option>
        </select>
        <button type="submit" style={{ padding: '8px 16px', fontSize: 14, borderRadius: 6, background: '#534AB7', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Search
        </button>
      </form>

      {submitted && data?.llm_available && (
        <button
          onClick={handleAsk}
          disabled={asking}
          style={{ marginBottom: 16, fontSize: 13, padding: '6px 14px', borderRadius: 6, border: '1px solid #534AB7', color: '#534AB7', background: 'transparent', cursor: 'pointer' }}
        >
          {asking ? 'Asking...' : 'Ask AI about these files'}
        </button>
      )}

      {askAnswer && (
        <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14 }}>
          <p style={{ fontWeight: 500, marginBottom: 8 }}>AI Answer</p>
          <p style={{ lineHeight: 1.6 }}>{askAnswer.answer}</p>
          {askAnswer.sources?.length > 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              Sources: {askAnswer.sources.map((s: any) => s.filename).join(', ')}
            </p>
          )}
        </div>
      )}

      {isLoading && <p style={{ fontSize: 14, color: '#888' }}>Searching...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data?.results?.map((r: any) => (
          <div key={r.file_id} style={{ padding: 12, borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14 }}>
            <div style={{ fontWeight: 500 }}>{r.filename}</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{r.logical_path}</div>
            {r.snippet && <div style={{ marginTop: 6, fontSize: 13, color: '#555', fontStyle: 'italic' }}>"{r.snippet}..."</div>}
          </div>
        ))}
        {submitted && !isLoading && data?.results?.length === 0 && (
          <p style={{ fontSize: 14, color: '#888' }}>No results found.</p>
        )}
      </div>
    </div>
  )
}
