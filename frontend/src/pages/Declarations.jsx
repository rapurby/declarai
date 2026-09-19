import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Trash2, ChevronRight, FileText, Upload } from 'lucide-react'
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

// Which board column a raw DB status belongs to. Submitted/Accepted/Rejected
// are still grouped together for the *filter tabs* (STATUS_GROUPS above —
// unchanged), but get their own columns on the board itself so a CEISA
// decision is visible at a glance instead of hiding inside "Submitted".
const COLUMN_FOR_STATUS = {
  uploaded:   'processing',
  processing: 'processing',
  extracted:  'processing',
  flagged:    'review',
  validated:  'ready',
  submitted:  'submitted',
  accepted:   'accepted',
  rejected:   'rejected',
}

// Left-to-right column order for the board view — mirrors the pipeline a
// declaration moves through: uploaded → reviewed → ready → sent to CEISA →
// CEISA's decision.
const BOARD_COLUMNS = [
  { key: 'processing', title: 'Processing',   variant: 'processing' },
  { key: 'review',     title: 'Needs Review', variant: 'review' },
  { key: 'ready',      title: 'Ready',        variant: 'ready' },
  { key: 'submitted',  title: 'Submitted',    variant: 'submitted' },
  { key: 'accepted',   title: 'Accepted by CEISA', variant: 'accepted' },
  { key: 'rejected',   title: 'Rejected by CEISA', variant: 'rejected' },
]

export default function Declarations() {
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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

  // Bucket the already-filtered list into board columns, preserving the
  // same order the flat list used to render in within each column.
  const columns = BOARD_COLUMNS.map(col => ({
    ...col,
    items: filtered.filter(d => COLUMN_FOR_STATUS[d.status] === col.key),
  }))

  // "DCLR-0001" etc — purely a frontend display number, computed from the
  // full (unfiltered) list ordered by created_at, so it reflects real
  // upload order and stays the same across every filter tab. Not stored
  // anywhere: if an earlier declaration is deleted, later numbers shift.
  const docCodeById = {}
  ;[...data]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((d, i) => { docCodeById[d.id] = `DCLR-${String(i + 1).padStart(4, '0')}` })

  const handleDelete = async (id, e) => {
    e.preventDefault()
    if (!confirm('Delete this declaration? This action cannot be undone.')) return
    try {
      await declarationAPI.delete(id)
      toast.success('Declaration deleted')
      refetch()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div>
              <h1 className={styles.title}>Declarations</h1>
              <p className={styles.subtitle}>{data.length} total declaration{data.length !== 1 ? 's' : ''}</p>
            </div>
            <div className={styles.headerActions}>
              <div className={styles.searchWrap}>
                <Search size={14} className={styles.searchIcon} />
                <input className={styles.search} placeholder="Search by filename, HS code, consignee..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {canUpload && (
                <Link to="/upload" className={styles.headerUploadBtn}>
                  <Upload size={14} /> Upload
                </Link>
              )}
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
        ) : data.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIconWrap}><FileText size={26} strokeWidth={1.75} className={styles.emptyIcon} /></div>
            <div className={styles.emptyTitle}>No declarations found</div>
            <div className={styles.emptySub}>Upload a CIPL document to get started.</div>
            {canUpload && (
              <Link to="/upload" className={styles.uploadLink}><Upload size={13} /> Upload Document</Link>
            )}
          </div>
        ) : (
          <div className={styles.board}>
            {columns.map(col => (
              <div className={styles.column} key={col.key}>
                <div className={styles.columnHead}>
                  <span className={styles.columnDot + ' ' + styles['dot_' + col.variant]} />
                  <span className={styles.columnTitle}>{col.title}</span>
                  <span className={styles.columnCount}>{col.items.length}</span>
                </div>

                <div className={styles.columnBody}>
                  {col.items.length === 0 ? (
                    <div className={styles.columnEmpty}>No declarations</div>
                  ) : col.items.map(d => (
                    <Link to={`/declarations/${d.id}`} key={d.id} className={styles.card}>
                      <span className={styles.docCode}>{docCodeById[d.id] || '—'}</span>
                      <span className={styles.filename}>{d.filename}</span>
                      <span className={styles.cardRow}><span>HS Code</span><span className={styles.mono}>{d.hs_code || '—'}</span></span>
                      <span className={styles.cardRow}><span>Value</span><span className={styles.mono}>{d.currency} {d.declared_value?.toLocaleString() || '—'}</span></span>
                      <span className={styles.truncate}>{d.consignee || '—'}</span>
                      {user?.role !== 'operator' && (
                        <span className={styles.cardUploader}>{d.operator_name || '—'}</span>
                      )}
                      <div className={styles.cardFoot}>
                        <span className={styles.statusBadge + ' ' + styles['status_' + (STATUS_VARIANT[d.status] || 'processing')]}>
                          {STATUS_LABEL[d.status] || d.status}
                        </span>
                        <span className={styles.time}>{d.processing_time_ms ? `${(d.processing_time_ms/1000).toFixed(1)}s` : '—'}</span>
                        <span className={styles.actions}>
                          {canDelete && (
                            <button className={styles.iconBtn} onClick={e => handleDelete(d.id, e)} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          )}
                          <ChevronRight size={13} className={styles.chevron} />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
