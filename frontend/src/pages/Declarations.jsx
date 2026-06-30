import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Filter, Trash2, ChevronRight, FileText, Upload } from 'lucide-react'
import { useDeclarations } from '../hooks/useDeclarations.js'
import { declarationAPI } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Declarations.module.css'

const STATUSES = ['', 'uploaded', 'processing', 'extracted', 'validated', 'flagged', 'submitted', 'accepted', 'rejected']

export default function Declarations() {
  const [searchParams] = useSearchParams()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const { data, loading, refetch }    = useDeclarations({ status: statusFilter || undefined })
  const user = getUser()
  const canUpload  = hasPermission(user?.role, 'upload')
  const canDelete  = hasPermission(user?.role, 'upload')

  const filtered = data.filter(d =>
    !search ||
    d.filename?.toLowerCase().includes(search.toLowerCase()) ||
    (d.hs_code || '').includes(search) ||
    (d.consignee || '').toLowerCase().includes(search.toLowerCase())
  )

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
            {STATUSES.map(s => <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Statuses'}</option>)}
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
              <span><span className={`badge badge-${d.status}`}>{d.status}</span></span>
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
