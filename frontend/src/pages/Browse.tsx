import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { browse, browseShare, getShareDownloadUrl, getShareStreamUrl, type BrowseItem, type BrowseResponse, getDownloadUrl, getStreamUrl } from '../api/browse'
import { usePreferences } from '../store/preferences'
import FolderCard from '../components/FolderCard'
import FileCard from '../components/FileCard'
import FileRow from '../components/FileRow'
import ImageViewer from '../components/ImageViewer'
import ShareModal from '../components/ShareModal'
import UniversalViewer from '../components/UniversalViewer'

export default function Browse({ shareToken }: { shareToken?: string }) {
  const navigate = useNavigate()
  const params = useParams()
  const routePath = params['*'] || ''
  const [localPath, setLocalPath] = useState('')
  const path = shareToken ? localPath : routePath
  const { viewMode, sortBy, sortOrder } = usePreferences()

  const [imageViewerOpen, setImageViewerOpen] = useState(false)
  const [imageViewerIndex, setImageViewerIndex] = useState(0)
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string; type: 'file' | 'root' } | null>(null)
  
  const [docViewerOpen, setDocViewerOpen] = useState(false)
  const [docViewerItem, setDocViewerItem] = useState<BrowseItem | null>(null)

  const { data, isLoading, error } = useQuery<BrowseResponse>({
    queryKey: ['browse', shareToken || 'local', path, sortBy, sortOrder],
    queryFn: () => shareToken
      ? browseShare(shareToken, { path: path || undefined, sort: sortBy, order: sortOrder })
      : browse({ path: path || undefined, sort: sortBy, order: sortOrder }),
  })

  const items = data?.items || []
  const folders = items.filter(i => i.type === 'folder')
  const files = items.filter(i => i.type === 'file')
  const imageFiles = files.filter(f => f.file_type === 'image')

  const handleFolderNav = useCallback((p: string) => {
    if (shareToken) {
      setLocalPath(p)
    } else {
      navigate(`/browse/${p}`)
    }
  }, [navigate, shareToken])

  const handleFileClick = useCallback((item: BrowseItem) => {
    if (!item.file_id) return

    if (item.file_type === 'video' || item.file_type === 'audio') {
      if (shareToken) {
        window.open(getShareStreamUrl(shareToken, item.file_id), '_blank')
      } else {
        navigate(`/play/${item.file_id}`)
      }
    } else if (item.file_type === 'image') {
      const idx = imageFiles.findIndex(f => f.file_id === item.file_id)
      if (idx >= 0) {
        setImageViewerIndex(idx)
        setImageViewerOpen(true)
      }
    } else if (item.file_type === 'document' || /\.(pdf|docx|doc|xlsx|xls|csv|pptx|md|txt|json|xml|yaml|yml|log|ini|conf|sh|py|js|ts|jsx|tsx|html|css)\s*$/i.test(item.name || '')) {
      if (shareToken) {
        setDocViewerItem(item)
        setDocViewerOpen(true)
      } else {
        navigate(`/doc/${item.file_id}`)
      }
    } else {
      window.open(shareToken ? getShareDownloadUrl(shareToken, item.file_id) : getDownloadUrl(item.file_id!), '_blank')
    }
  }, [navigate, imageFiles, shareToken])

  const handleShareFile = useCallback((fileId: string, filename: string) => {
    setShareTarget({ id: fileId, name: filename, type: 'file' })
  }, [])

  const handleShareFolder = useCallback((path: string, name: string, rootId?: string) => {
    // rootId is always from top-level folders, sub-folders share via the parent root + subpath
    const effectiveRootId = rootId || data?.root_id
    if (!effectiveRootId) return
    // Determine if this is a sub-folder share (path has more than one segment after root name)
    const rootName = data?.root_name || ''
    const rootNameClean = rootName.replace(/^\//, '')
    let subpath: string | undefined
    if (!rootId) {
      // This is a sub-folder — path is relative to the current browse context
      subpath = path
    }
    setShareTarget({ id: effectiveRootId, name, type: rootId ? 'root' : 'folder', subpath })
  }, [data])

  // ── Breadcrumbs ──────────────────────────────────────────────────────────
  const breadcrumbs = data?.breadcrumbs || []

  // ── Skeleton grid ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <BreadcrumbBar segments={[]} onNavigate={handleFolderNav} />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>⚠️</div>
        <div style={{ fontSize: '1rem' }}>Failed to load files</div>
      </div>
    )
  }

  const isEmpty = items.length === 0

  return (
    <div>
      <BreadcrumbBar segments={breadcrumbs} onNavigate={handleFolderNav} />

      {isEmpty ? (
        <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem', opacity: 0.4 }}>📭</div>
          <div style={{ fontSize: '1rem', fontWeight: 500 }}>This folder is empty</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Files added to mapped roots will appear here</div>
        </div>
      ) : (
        <>
          {/* Folders */}
          {folders.length > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              {files.length > 0 && (
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Folders
                </div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'list'
                  ? '1fr'
                  : 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: viewMode === 'list' ? '0.25rem' : '0.75rem',
              }}>
                {folders.map((f, i) => (
                  <FolderCard
                    key={f.path}
                    name={f.name}
                    path={f.path}
                    itemCount={f.item_count}
                    nodeStatus={f.node_status}
                    onNavigate={handleFolderNav}
                    onShare={!shareToken ? (path, name) => handleShareFolder(path, name, f.root_id) : undefined}
                    style={{ animationDelay: `${i * 30}ms` }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Files */}
          {files.length > 0 && (
            <section>
              {folders.length > 0 && (
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Files
                </div>
              )}

              {viewMode === 'list' ? (
                /* ── List view ────────────────────────────────────────── */
                <div style={{
                  background: 'var(--surface-glass)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                }}>
                  {/* Header row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    borderBottom: '1px solid var(--border-medium)',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    <div style={{ width: 36 }} />
                    <div style={{ flex: 1 }}>Name</div>
                    <div style={{ width: 80, textAlign: 'right' }}>Size</div>
                    <div style={{ width: 100, textAlign: 'right' }}>Modified</div>
                    <div style={{ width: 60, textAlign: 'center' }}>Type</div>
                    <div style={{ width: 50 }} />
                  </div>
                  {files.map(f => (
                    <FileRow
                      key={f.file_id || f.path}
                      fileId={f.file_id!}
                      filename={f.name}
                      fileType={f.file_type || 'other'}
                      mimeType={f.mime_type}
                      sizeBytes={f.size_bytes || 0}
                      modifiedAt={f.modified_at}
                      hasThumbnail={f.has_thumbnail}
                      nodeStatus={f.node_status}
                      nodeReachable={f.node_reachable}
                      isCached={f.is_cached}
                      indexStatus={f.index_status}
                      onClick={() => handleFileClick(f)}
                      onShare={(!shareToken && f.file_id) ? handleShareFile : undefined}
                    />
                  ))}
                </div>
              ) : (
                /* ── Grid / Gallery view ──────────────────────────────── */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: viewMode === 'gallery'
                    ? 'repeat(auto-fill, minmax(180px, 1fr))'
                    : 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: viewMode === 'gallery' ? '0.5rem' : '0.75rem',
                }}>
                  {files.map((f, i) => (
                    <FileCard
                      key={f.file_id || f.path}
                      fileId={f.file_id!}
                      filename={f.name}
                      fileType={f.file_type || 'other'}
                      mimeType={f.mime_type}
                      sizeBytes={f.size_bytes || 0}
                      modifiedAt={f.modified_at}
                      hasThumbnail={f.has_thumbnail}
                      nodeStatus={f.node_status}
                      nodeReachable={f.node_reachable}
                      isCached={f.is_cached}
                      indexStatus={f.index_status}
                      onClick={() => handleFileClick(f)}
                      onShare={(!shareToken && f.file_id) ? handleShareFile : undefined}
                      style={{ animationDelay: `${i * 30}ms` }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Image viewer modal */}
      {imageViewerOpen && imageFiles.length > 0 && (
        <ImageViewer
          images={imageFiles.map(f => ({
            fileId: f.file_id!,
            filename: f.name,
            downloadUrl: shareToken ? getShareDownloadUrl(shareToken, f.file_id!) : getDownloadUrl(f.file_id!),
            streamUrl: shareToken ? getShareStreamUrl(shareToken, f.file_id!) : getStreamUrl(f.file_id!),
          }))}
          startIndex={imageViewerIndex}
          onClose={() => setImageViewerOpen(false)}
        />
      )}

      {shareTarget && (
        <ShareModal
          target={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {docViewerOpen && docViewerItem && shareToken && (
        <UniversalViewer
          fileId={docViewerItem.file_id!}
          filename={docViewerItem.name}
          streamUrl={getShareStreamUrl(shareToken, docViewerItem.file_id!)}
          downloadUrl={getShareDownloadUrl(shareToken, docViewerItem.file_id!)}
          onClose={() => {
            setDocViewerOpen(false)
            setDocViewerItem(null)
          }}
        />
      )}
    </div>
  )
}

/* ── Breadcrumb bar ──────────────────────────────────────────────────────── */
function BreadcrumbBar({ segments, onNavigate }: {
  segments: { name: string; path: string }[]
  onNavigate: (path: string) => void
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem',
      fontSize: '0.8125rem',
      flexWrap: 'wrap',
      marginBottom: '1.25rem',
      padding: '0.5rem 0',
    }}>
      <span
        onClick={() => onNavigate('')}
        style={{
          cursor: 'pointer',
          color: segments.length > 0 ? 'var(--accent-primary)' : 'var(--text-primary)',
          fontWeight: segments.length > 0 ? 400 : 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          transition: 'color 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        Home
      </span>

      {segments.map((s, i) => {
        const isLast = i === segments.length - 1
        return (
          <React.Fragment key={s.path}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/</span>
            <span
              onClick={() => !isLast && onNavigate(s.path)}
              style={{
                cursor: isLast ? 'default' : 'pointer',
                color: isLast ? 'var(--text-primary)' : 'var(--accent-primary)',
                fontWeight: isLast ? 600 : 400,
                transition: 'color 0.15s',
              }}
            >
              {s.name}
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}
