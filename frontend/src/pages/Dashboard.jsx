import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { FileCheck, CheckCircle, AlertTriangle, Clock, Upload, ArrowRight, Activity, Inbox } from 'lucide-react'
import { declarationAPI } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import styles from './Dashboard.module.css'

const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{status}</span>

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(typeof value === 'number' ? 0 : value)
  const raf = useRef(null)

  useEffect(() => {
    if (typeof value !== 'number' || prefersReducedMotion()) { setDisplay(value); return }
    let start = null
    const tick = (ts) => {
      if (start === null) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * value))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return <>{display}</>
}

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
      <span>Loading your dashboard...</span>
    </div>
  )

  const STATUS_COLORS = {
    uploaded:   '#0f4c81',
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
    { label: 'Total Documents',    value: stats?.total ?? 0,            sub: 'All time',                   icon: FileCheck,     accent: '#0f4c81' },
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

      {/* Stat cards — one row, hero numbers, watermark icon, accent border */}
      <div className={styles.cards}>
        {cards.map((c, i) => (
          <div key={c.label} className={styles.card}
            style={{ borderLeftColor: c.accent, animationDelay: `${i * 50}ms` }}>
            <c.icon className={styles.cardWatermark} style={{ color: c.accent }} strokeWidth={1.5} />
            <div className={styles.cardLabel}>{c.label}</div>
            <div className={styles.cardValue}><AnimatedNumber value={c.value} /></div>
            <div className={styles.cardSub}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Bottom section — chart + review, 50/50, full width */}
      <div className={styles.chartsRow}>
        {/* Status pie */}
        <div className={styles.chartCard} style={{ animationDelay: '320ms' }}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><Activity size={15} /> Status Distribution</div>
          </div>
          {pieData.length > 0 ? (
            <div className={styles.pieWrap}>
              <div className={styles.pieChartBox}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={78} outerRadius={112} dataKey="value"
                      paddingAngle={3} cornerRadius={8} stroke="var(--card)" strokeWidth={2}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e6ed', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(15,76,129,0.12)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.pieCenter}>
                  <div className={styles.pieCenterValue}>{stats?.total ?? 0}</div>
                  <div className={styles.pieCenterLabel}>documents</div>
                </div>
              </div>
              <div className={styles.pieLegend}>
                {pieData.map(d => (
                  <div key={d.name} className={styles.legendChip}>
                    <span className={styles.legendDot} style={{ background: d.color }} />
                    <span className={styles.legendName}>{d.name}</span>
                    <span className={styles.legendNum}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <div className={styles.emptyIcon}><FileCheck size={22} strokeWidth={1.75} /></div>
              <span>Nothing to chart yet</span>
              {canUpload && <Link to="/upload" className={styles.emptyLink}>Upload your first document →</Link>}
            </div>
          )}
        </div>

        {/* Needs Review — real, actionable data instead of vanity metrics */}
        <div className={styles.chartCard} style={{ animationDelay: '370ms' }}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><AlertTriangle size={15} /> Needs Review</div>
            {needsReview.length > 0 && <Link to="/declarations?status=flagged" className={styles.viewAllLink}>View all</Link>}
          </div>
          {needsReview.length > 0 ? (
            <div className={styles.reviewList}>
              {needsReview.map(d => (
                <Link to={`/declarations/${d.id}`} key={d.id} className={styles.reviewItem}
                  style={{ borderLeftColor: STATUS_COLORS[d.status] || 'var(--dash-primary)' }}>
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
              <div className={`${styles.emptyIcon} ${styles.emptyIconSuccess}`}><CheckCircle size={22} strokeWidth={1.75} /></div>
              <span>All caught up — nothing needs review right now.</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent declarations */}
      <div className={styles.tableCard} style={{ animationDelay: '420ms' }}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>Recent Declarations</div>
          <Link to="/declarations" className={styles.viewAllLink}>View all <ArrowRight size={13} /></Link>
        </div>
        {recent.length === 0 ? (
          <div className={styles.emptyTable}>
            <div className={styles.emptyIcon}><Inbox size={22} strokeWidth={1.75} /></div>
            <span>No declarations yet.</span>
            {canUpload && <Link to="/upload" className={styles.emptyLink}>Upload a document to get started →</Link>}
          </div>
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
