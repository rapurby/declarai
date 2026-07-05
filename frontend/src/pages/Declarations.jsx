import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Trash2, ChevronRight, FileText, Upload, ChevronLeft } from 'lucide-react'
import { useDeclarations } from '../hooks/useDeclarations.js'
import { declarationAPI } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Declarations.module.css'

// Simplified status groups — maps user-facing filter to underlying DB values
const STATUS_GROUPS = {
  '':         null,                                          // All
  'processing': ['uploaded', 'processing', 'extracted'],    // In pipeline
  'review':     ['flagged'],                                 // Needs manual review
  'ready':      ['validated'],                               // Ready to submit
  'submitted':  ['submitted', 'accepted', 'rejected'],       // Done
}

// Human-readable display label per raw DB status
const STATUS_LABEL = {
  uploaded:   'Processing',
  processing: 'Processing',
  extracted:  'Processing',
  validated:  'Ready',
  flagged:    'Needs Review',
  submitted:  'Submitted',
  accepted:   'Accepted',
  rejected:   'Rejected',
}

// Presentational-only colour grouping for status badges (kept local to this
// page so global .badge-* colours used elsewhere, e.g. Dashboard, are untouched).
const STATUS_VARIANT = {
  uploaded:   'processing',
  processing: 'processing',
  extracted:  'processing',
  validated:  'ready',
  flagged:    'review',
  submitted:  'submitted',
  accepted:   'accepted',
  rejected:   'rejected',
}

const FILTER_OPTIONS = [
  { value: '',           label: 'All Statuses', tab: 'All' },
  { value: 'processing', label: 'Processing',   tab: 'Processing' },
  { value: 'review',     label: 'Needs Review',  tab: 'Needs Review' },
  { value: 'ready',      label: 'Ready to Submit', tab: 'Ready' },
  { value: 'submitted',  label: 'Submitted / Done', tab: 'Submitted' },
]

const PAGE_SIZE = 15

export default function Declarations() {
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]               = useState(1)
  // Fetch all declarations — filter client-side with grouped statuses
  const { data, loading, refetch }    = useDeclarations({})
  const user = getUser()
  const canUpload  = hasPermission(user?.role, 'upload')
  const canDelete  = hasPermission(user?.role, 'upload')

  const allowedStatuses = STATUS_GROUPS[statusFilter]
  const filtered = data.filter(d => {
    if (allowedStatuses && !allowedStatuses.includes(d.status)) return false
    if (search && !(
      d.filename?.toLowerCase().includes(search.toLowerCase()) ||
      (d.hs_code || '').includes(search) ||
      (d.consignee || '').toLowerCase().includes(search.toLowerCase())
    )) return false
    return true
  })

  // Purely presentational pagination over the already-fetched, already-filtered
  // list — no extra network calls, no change to useDeclarations/API params.
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleDelete = async (id, e) => {
    e.preventDefault()
    if (!confirm('Delete this declaration? This action cannot be undone.')) return
    try {
      await declarationAPI.delete(id)
      toast.success('Declaration deleted')
      refetch()
    } catch { toast.error('Failed to delete') }
  }

  const gridCols = user?.role !== 'operator' ? '1.8fr 1fr 1.7fr 1.2fr 1.3fr 1fr 0.7fr 80px' : undefined

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div>
              <h1 className={styles.title}>Declarations</h1>
              <p className={styles.subtitle}>{data.length} total declaration{data.length !== 1 ? 's' : ''}</p>
            </div>
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input className={styles.search} placeholder="Search by filename, HS code, consignee..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className={styles.filterTabs}>
            {FILTER_OPTIONS.map(o => (
              <button key={o.value} type="button"
                className={styles.filterTab + (statusFilter === o.value ? ' ' + styles.filterTabActive : '')}
                onClick={() => setStatusFilter(o.value)}>
                {o.tab}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIconWrap}><FileText size={26} strokeWidth={1.75} className={styles.emptyIcon} /></div>
            <div className={styles.emptyTitle}>No declarations found</div>
            <div className={styles.emptySub}>
              {search || statusFilter ? 'Try adjusting your search or filter.' : 'Upload a CIPL document to get started.'}
            </div>
            {canUpload && !search && !statusFilter && (
              <Link to="/upload" className={styles.uploadLink}><Upload size={13} /> Upload Document</Link>
            )}
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableHead} style={{ gridTemplateColumns: gridCols }}>
              <span>File</span><span>HS Code</span><span>Consignee</span>
              <span>Value</span>{user?.role !== 'operator' && <span>Uploaded By</span>}<span>Status</span><span>Time</span><span></span>
            </div>
            {pageItems.map(d => (
              <Link to={`/declarations/${d.id}`} key={d.id} className={styles.row}
                style={{ gridTemplateColumns: gridCols }}>
                <span className={styles.filename}>{d.filename}</span>
                <span className={styles.mono}>{d.hs_code || '—'}</span>
                <span className={styles.truncate}>{d.consignee || '—'}</span>
                <span className={styles.mono}>{d.currency} {d.declared_value?.toLocaleString() || '—'}</span>
                {user?.role !== 'operator' && <span className={styles.truncate}>{d.operator_name || '—'}</span>}
                <span>
                  <span className={styles.statusBadge + ' ' + styles['status_' + (STATUS_VARIANT[d.status] || 'processing')]}>
                    {STATUS_LABEL[d.status] || d.status}
                  </span>
                </span>
                <span className={styles.time}>{d.processing_time_ms ? `${(d.processing_time_ms/1000).toFixed(1)}s` : '—'}</span>
                <span className={styles.actions}>
                  {canDelete && (
                    <button className={styles.iconBtn} onClick={e => handleDelete(d.id, e)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  )}
                  <ChevronRight size={14} className={styles.chevron} />
                </span>
              </Link>
            ))}

            <div className={styles.pagination}>
              <span className={styles.paginationInfo}>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              {pageCount > 1 && (
                <div className={styles.paginationControls}>
                  <button className={styles.pageBtn} disabled={safePage === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={14}/></button>
                  <span className={styles.pageIndicator}>{safePage} / {pageCount}</span>
                  <button className={styles.pageBtn} disabled={safePage === pageCount}
                    onClick={() => setPage(p => Math.min(pageCount, p + 1))}><ChevronRight size={14}/></button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
