import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Filter, Trash2, ChevronRight, FileText, Upload } from 'lucide-react'
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

const FILTER_OPTIONS = [
  { value: '',           label: 'All Statuses' },
  { value: 'processing', label: 'Processing' },
  { value: 'review',     label: 'Needs Review' },
  { value: 'ready',      label: 'Ready to Submit' },
  { value: 'submitted',  label: 'Submitted / Done' },
]

export default function Declarations() {
  const [searchParams] = useSearchParams()
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
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Declarations</h1>
          <p className={styles.subtitle}>{data.length} total declaration{data.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input className={styles.search} placeholder="Search by filename, HS code, consignee..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className={styles.filterWrap}>
          <Filter size={14} className={styles.filterIcon} />
          <select className={styles.filter} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={40} strokeWidth={1.5} className={styles.emptyIcon} />
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
          <div className={styles.tableHead} style={{ gridTemplateColumns: user?.role !== 'operator'
            ? '1.8fr 1fr 1.7fr 1.2fr 1.3fr 1fr 0.7fr 80px' : undefined }}>
            <span>File</span><span>HS Code</span><span>Consignee</span>
            <span>Value</span>{user?.role !== 'operator' && <span>Uploaded By</span>}<span>Status</span><span>Time</span><span></span>
          </div>
          {filtered.map(d => (
            <Link to={`/declarations/${d.id}`} key={d.id} className={styles.row}
              style={{ gridTemplateColumns: user?.role !== 'operator'
                ? '1.8fr 1fr 1.7fr 1.2fr 1.3fr 1fr 0.7fr 80px' : undefined }}>
              <span className={styles.filename}>{d.filename}</span>
              <span className={styles.mono}>{d.hs_code || '—'}</span>
              <span className={styles.truncate}>{d.consignee || '—'}</span>
              <span className={styles.mono}>{d.currency} {d.declared_value?.toLocaleString() || '—'}</span>
              {user?.role !== 'operator' && <span className={styles.truncate}>{d.operator_name || '—'}</span>}
              <span><span className={`badge badge-${d.status}`}>{STATUS_LABEL[d.status] || d.status}</span></span>
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
        </div>
      )}
    </div>
  )
}
