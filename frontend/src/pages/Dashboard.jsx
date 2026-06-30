import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { FileCheck, CheckCircle, AlertTriangle, Clock, Upload, ArrowRight, TrendingUp, Activity } from 'lucide-react'
import { declarationAPI } from '../services/api.js'
import { getUser, hasPermission } from '../utils/auth.js'
import styles from './Dashboard.module.css'

const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{status}</span>

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const user = getUser()
  const canUpload = hasPermission(user?.role, 'upload')

  useEffect(() => {
    Promise.all([declarationAPI.stats(), declarationAPI.list({ limit: 6 })])
      .then(([s, r]) => { setStats(s.data); setRecent(r.data) })
      .catch(() => {
        setStats({ total: 0, accepted: 0, flagged: 0, rejected: 0, avg_processing_ms: 0, success_rate: 0 })
        setRecent([])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
      <span>Loading dashboard...</span>
    </div>
  )

  const pieData = [
    { name: 'Accepted', value: stats?.accepted || 0, color: '#0d9f6e' },
    { name: 'Flagged',  value: stats?.flagged  || 0, color: '#d97706' },
    { name: 'Rejected', value: stats?.rejected || 0, color: '#dc2626' },
  ].filter(d => d.value > 0)

  const barData = [
    { name: 'Manual Process', value: 35, fill: '#cbd5e1' },
    { name: 'DeclarAI',       value: 2,  fill: '#1a3a8f' },
  ]

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
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageDesc}>
            Welcome back, <strong>{user?.name}</strong> &nbsp;·&nbsp; {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
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

        {/* Time comparison */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><Clock size={15} /> Processing Time (minutes)</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barSize={52} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8496b0', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8496b0', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e6ed', borderRadius: 8, fontSize: 12 }} formatter={v => [`${v} min`]} />
              <Bar dataKey="value" radius={[5,5,0,0]}>
                {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className={styles.chartNote}>DeclarAI reduces processing time by <strong style={{color:'#0d9f6e'}}>94%</strong></div>
        </div>

        {/* Impact */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div className={styles.chartTitle}><TrendingUp size={15} /> Key Impact Metrics</div>
          </div>
          <div className={styles.impactList}>
            {[
              { label: 'Time saved per declaration', value: '~38 min', color: '#1a3a8f' },
              { label: 'Throughput increase',         value: '15–20×',  color: '#0d9f6e' },
              { label: 'Error rate reduction',        value: '~95%',    color: '#d97706' },
              { label: 'Cost saved per shipment',     value: '$2,000+', color: '#7c3aed' },
            ].map(m => (
              <div key={m.label} className={styles.impactRow}>
                <span className={styles.impactLabel}>{m.label}</span>
                <span className={styles.impactValue} style={{ color: m.color }}>{m.value}</span>
              </div>
            ))}
          </div>
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
                <th>File</th><th>HS Code</th><th>Consignee</th><th>Value</th><th>Status</th><th>Process Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(d => (
                <tr key={d.id} onClick={() => window.location.href=`/declarations/${d.id}`} className={styles.tableRow}>
                  <td className={styles.tdFile}>{d.filename}</td>
                  <td className={styles.tdMono}>{d.hs_code || '—'}</td>
                  <td className={styles.tdTrunc}>{d.consignee || '—'}</td>
                  <td className={styles.tdMono}>{d.currency} {d.declared_value?.toLocaleString() || '—'}</td>
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
