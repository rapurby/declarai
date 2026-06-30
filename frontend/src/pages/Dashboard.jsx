import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { FileCheck, CheckCircle, AlertTriangle, Clock, Upload, ArrowRight, Activity } from 'lucide-react'
import { declarationAPI } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import styles from './Dashboard.module.css'

const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{status}</span>

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [needsReview, setNeedsReview] = useState([])
  const [loading, setLoading] = useState(true)
  const user = getUser()
  const canUpload = hasPermission(user?.role, 'upload')

  useEffect(() => {
    Promise.all([
      declarationAPI.stats(),
      declarationAPI.list({ limit: 6 }),
      declarationAPI.list({ status: 'flagged', limit: 5 }),
    ])
      .then(([s, r, nr]) => { setStats(s.data); setRecent(r.data); setNeedsReview(nr.data) })
      .catch(() => {
        setStats({ total: 0, accepted: 0, flagged: 0, rejected: 0, avg_processing_ms: 0, success_rate: 0, by_status: {} })
        setRecent([])
        setNeedsReview([])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <span>Loading dashboard...</span>
    </div>
  )

  const STATUS_COLORS = {
    uploaded:   '#1a3a8f',
    processing: '#7c3aed',
    extracted:  '#7c3aed',
    validated:  '#2563eb',
    flagged:    '#d97706',
    submitted:  '#0d9f6e',
    accepted:   '#0d9f6e',
    rejected:   '#dc2626',
  }
  const pieData = Object.entries(stats?.by_status || {})
    .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: STATUS_COLORS[name] || '#94a3b8' }))
    .filter(d => d.value > 0)

  const cards = [
    { label: 'Total Documents',    value: stats?.total ?? 0,            sub: 'All time',                   icon: FileCheck,     accent: '#1a3a8f' },
    { label: 'Processing',         value: stats?.processing ?? 0,       sub: 'Currently in progress',      icon: Activity,      accent: '#7c3aed' },
    { label: 'Waiting Review',     value: stats?.waiting_review ?? 0,   sub: 'Flagged + validated',        icon: AlertTriangle, accent: '#d97706' },
    { label: 'Accepted',           value: stats?.accepted ?? 0,         sub: `${stats?.success_rate ?? 0}% success rate`, icon: CheckCircle, accent: '#0d9f6e' },
    { label: 'Rejected',           value: stats?.rejected ?? 0,         sub: 'Could not submit',           icon: AlertTriangle, accent: '#dc2626' },
    { label: 'Avg Process Time',   value: stats?.avg_processing_ms ? `${(stats.avg_processing_ms/1000).toFixed(1)}s` : '< 2s',
      sub: 'vs 30–40 min manual', icon: Clock, accent: '#0891b2' },
  ]

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{user?.role === 'operator' ? 'My Dashboard' : 'Dashboard'}</h1>
          <p className={styles.pageDesc}>
            Welcome back, <strong>{user?.name}</strong> &nbsp;·&nbsp; {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            {user?.role === 'operator' && <> &nbsp;·&nbsp; showing your own uploads</>}
          </p>
        </div>
        {canUpload && (
          <Link to="/upload" className={styles.primaryBtn}>
            <Upload size={14} /> Upload Document
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className={styles.cards}>
        {cards.map(c => (
          <div key={c.label} className={styles.card}>
            <div className={styles.cardLeft}>
              <div className={styles.cardLabel}>{c.label}</div>
              <div className={styles.cardValue}>{c.value}</div>
              <div className={styles.cardSub}>{c.sub}</div>
            </div>
            <div className={styles.cardIcon} style={{ background: `${c.accent}12`, color: c.accent }}>
              <c.icon size={20} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className={styles.chartsRow}>
        {/* Status pie */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><Activity size={15} /> Status Distribution</div>
          </div>
          {pieData.length > 0 ? (
            <div className={styles.pieWrap}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e6ed', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.pieLegend}>
                {pieData.map(d => (
                  <div key={d.name} className={styles.legendRow}>
                    <span className={styles.legendDot} style={{ background: d.color }} />
                    <span className={styles.legendName}>{d.name}</span>
                    <span className={styles.legendNum}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <FileCheck size={32} strokeWidth={1.5} />
              <span>No data yet</span>
              {canUpload && <Link to="/upload" className={styles.emptyLink}>Upload first document →</Link>}
            </div>
          )}
        </div>

        {/* Needs Review — real, actionable data instead of vanity metrics */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><AlertTriangle size={15} /> Needs Review</div>
            {needsReview.length > 0 && <Link to="/declarations?status=flagged" className={styles.viewAllLink}>View all</Link>}
          </div>
          {needsReview.length > 0 ? (
            <div className={styles.reviewList}>
              {needsReview.map(d => (
                <Link to={`/declarations/${d.id}`} key={d.id} className={styles.reviewItem}>
                  <div className={styles.reviewItemMain}>
                    <span className={styles.reviewItemFile}>{d.filename}</span>
                    <span className={styles.reviewItemSub}>{d.consignee || 'No consignee detected'}</span>
                  </div>
                  <span className={'badge badge-' + d.status}>{d.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <CheckCircle size={32} strokeWidth={1.5} />
              <span>Nothing needs review right now</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent declarations */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Recent Declarations</div>
          <Link to="/declarations" className={styles.viewAllLink}>View all <ArrowRight size={13} /></Link>
        </div>
        {recent.length === 0 ? (
          <div className={styles.emptyTable}>No declarations yet. {canUpload && <Link to="/upload">Upload a document to get started.</Link>}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>File</th><th>HS Code</th><th>Consignee</th><th>Value</th>
                {user?.role !== 'operator' && <th>Uploaded By</th>}
                <th>Status</th><th>Process Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(d => (
                <tr key={d.id} onClick={() => window.location.href=`/declarations/${d.id}`} className={styles.tableRow}>
                  <td className={styles.tdFile}>{d.filename}</td>
                  <td className={styles.tdMono}>{d.hs_code || '—'}</td>
                  <td className={styles.tdTrunc}>{d.consignee || '—'}</td>
                  <td className={styles.tdMono}>{d.currency} {d.declared_value?.toLocaleString() || '—'}</td>
                  {user?.role !== 'operator' && <td className={styles.tdTrunc}>{d.operator_name || '—'}</td>}
                  <td><StatusBadge status={d.status} /></td>
                  <td className={styles.tdMono}>{d.processing_time_ms ? `${(d.processing_time_ms/1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
