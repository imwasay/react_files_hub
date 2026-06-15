import React, { useState, useCallback, useEffect, useRef } from 'react'
import { createShare } from '../api/shares'

type ExpiryPreset = '1h' | '24h' | '7d' | '30d' | 'never' | 'custom'

interface ShareTarget {
  id: string
  name: string
  type: 'file' | 'root'
}

interface Props {
  target: ShareTarget
  onClose: () => void
}

function addHours(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString()
}

function addDays(d: number): string {
  return addHours(d * 24)
}

const PRESETS: { key: ExpiryPreset; label: string; sub: string }[] = [
  { key: '1h',    label: '1 Hour',   sub: 'Expires in 60 min' },
  { key: '24h',   label: '24 Hours', sub: 'Expires tomorrow' },
  { key: '7d',    label: '7 Days',   sub: 'One week' },
  { key: '30d',   label: '30 Days',  sub: 'One month' },
  { key: 'never', label: 'Never',    sub: 'No expiry' },
  { key: 'custom',label: 'Custom',   sub: 'Pick a date' },
]

function expiryFromPreset(preset: ExpiryPreset, custom?: string): string | undefined {
  switch (preset) {
    case '1h':   return addHours(1)
    case '24h':  return addHours(24)
    case '7d':   return addDays(7)
    case '30d':  return addDays(30)
    case 'never':return undefined
    case 'custom':return custom ? new Date(custom).toISOString() : undefined
  }
}

// SVG icons
const IconLink = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconCopy = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const IconShare2 = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export default function ShareModal({ target, onClose }: Props) {
  const [preset, setPreset] = useState<ExpiryPreset>('7d')
  const [customDate, setCustomDate] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const expires_at = expiryFromPreset(preset, customDate)
      const res = await createShare({
        target_type: target.type,
        target_id: target.id,
        expires_at,
      })
      const url = `${window.location.origin}/s/${res.token}`
      setGeneratedUrl(url)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to generate link')
    } finally {
      setLoading(false)
    }
  }, [preset, customDate, target])

  const handleCopy = useCallback(() => {
    if (!generatedUrl) return
    navigator.clipboard.writeText(generatedUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [generatedUrl])

  const handleNativeShare = useCallback(() => {
    if (!generatedUrl) return
    if (navigator.share) {
      navigator.share({ title: target.name, url: generatedUrl }).catch(() => {})
    }
  }, [generatedUrl, target.name])

  const isFolder = target.type === 'root'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'linear-gradient(145deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.97) 100%)',
          border: '1px solid rgba(148,163,184,0.15)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
          overflow: 'hidden',
          animation: 'slideUp 0.2s var(--ease-spring)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem 1rem',
          borderBottom: '1px solid rgba(148,163,184,0.08)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(59,130,246,0.2) 100%)',
              border: '1px solid rgba(6,182,212,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent-primary)', flexShrink: 0,
            }}>
              <IconLink />
            </div>
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-heading)', lineHeight: 1.3 }}>
                Share {isFolder ? 'Folder' : 'File'}
              </div>
              <div style={{
                fontSize: '0.75rem', color: 'var(--text-muted)',
                marginTop: '0.15rem',
                maxWidth: 280,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {target.name}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '0.25rem',
              borderRadius: 6, display: 'flex', alignItems: 'center',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* Expiry section */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{
              fontSize: '0.6875rem', fontWeight: 600,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: '0.625rem',
            }}>
              Link Expiry
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem',
            }}>
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  style={{
                    padding: '0.5rem 0.375rem',
                    borderRadius: 8,
                    border: preset === p.key
                      ? '1px solid rgba(6,182,212,0.5)'
                      : '1px solid rgba(148,163,184,0.12)',
                    background: preset === p.key
                      ? 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(59,130,246,0.15) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                  onMouseOver={e => { if (preset !== p.key) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseOut={e => { if (preset !== p.key) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                >
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 600,
                    color: preset === p.key ? 'var(--accent-primary)' : 'var(--text-primary)',
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '0.6375rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {p.sub}
                  </div>
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div style={{ marginTop: '0.625rem' }}>
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="input"
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                />
              </div>
            )}
          </div>

          {/* Generate button */}
          {!generatedUrl && (
            <button
              onClick={handleGenerate}
              disabled={loading || (preset === 'custom' && !customDate)}
              className="btn btn-primary"
              style={{ width: '100%', gap: '0.5rem', fontSize: '0.875rem' }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Generating…
                </>
              ) : (
                <>
                  <IconLink />
                  Generate Share Link
                </>
              )}
            </button>
          )}

          {error && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.625rem 0.875rem',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8,
              fontSize: '0.8125rem',
              color: '#f87171',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Generated link */}
          {generatedUrl && (
            <div style={{ animation: 'slideUp 0.25s var(--ease-out)' }}>
              {/* URL field */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0',
                background: 'rgba(6,182,212,0.06)',
                border: '1px solid rgba(6,182,212,0.2)',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: '0.75rem',
              }}>
                <input
                  ref={inputRef}
                  readOnly
                  value={generatedUrl}
                  onClick={e => (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '0.625rem 0.875rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-primary)',
                    letterSpacing: '0.01em',
                    minWidth: 0,
                  }}
                />
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '0 1rem',
                    height: '100%',
                    minHeight: 40,
                    border: 'none',
                    borderLeft: '1px solid rgba(6,182,212,0.2)',
                    background: copied
                      ? 'rgba(16,185,129,0.15)'
                      : 'rgba(6,182,212,0.1)',
                    color: copied ? '#10b981' : 'var(--accent-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {copied ? <><IconCheck /> Copied!</> : <><IconCopy /> Copy</>}
                </button>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: '0.8125rem', textDecoration: 'none' }}
                >
                  Open Link ↗
                </a>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleNativeShare}
                    className="btn btn-ghost"
                    style={{ flex: 1, fontSize: '0.8125rem' }}
                  >
                    <IconShare2 /> Share via…
                  </button>
                )}
                <button
                  onClick={() => { setGeneratedUrl(null); setError(null) }}
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: '0.8125rem' }}
                >
                  New Link
                </button>
              </div>

              {/* Expiry note */}
              {preset !== 'never' && (
                <div style={{
                  marginTop: '0.75rem', fontSize: '0.6875rem',
                  color: 'var(--text-muted)', textAlign: 'center',
                }}>
                  {preset === 'custom'
                    ? `Expires ${new Date(customDate).toLocaleString()}`
                    : `Expires in ${PRESETS.find(p => p.key === preset)?.label.toLowerCase()}`
                  }
                  {' · '}Anyone with the link can access this {isFolder ? 'folder' : 'file'}
                </div>
              )}
              {preset === 'never' && (
                <div style={{
                  marginTop: '0.75rem', fontSize: '0.6875rem',
                  color: 'var(--text-muted)', textAlign: 'center',
                }}>
                  No expiry · Anyone with the link can access this {isFolder ? 'folder' : 'file'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
