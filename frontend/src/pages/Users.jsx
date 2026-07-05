import { useState, useEffect } from 'react'
import { adminAPI } from '../services/api.js'
import { getUser } from '../utils/auth.js'
import { UserCheck, UserX, RefreshCw, Shield, Users as UsersIcon, UserCog, Clock3 } from 'lucide-react'
import toast from 'react-hot-toast'
import styles from './Users.module.css'

const ROLE_COLORS = { admin: '#dc2626', operator: '#0d9f6e', viewer: '#2563eb' }
const ROLE_LABEL  = { admin: 'Admin', operator: 'Operator', viewer: 'Viewer' }

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const user = getUser()

  if (user?.role !== 'admin') return (
    <div className={styles.forbidden}>
      <Shield size={40} strokeWidth={1.5} />
      <p>Admin access required.</p>
    </div>
  )

  const load = async () => {
    setLoading(true)
    try { const r = await adminAPI.listUsers(); setUsers(r.data) }
    catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const approve = async (id) => {
    try { await adminAPI.approveUser(id); toast.success('User approved'); load() }
    catch { toast.error('Failed') }
  }
  const deactivate = async (id) => {
    try { await adminAPI.deactivateUser(id); toast.success('User deactivated'); load() }
    catch { toast.error('Failed') }
  }
  const changeRole = async (id, role) => {
    try { await adminAPI.changeRole(id, role); toast.success('Role updated'); load() }
    catch { toast.error('Failed') }
  }

  const activeCount  = users.filter(u => u.is_active).length
  const pendingCount = users.filter(u => !u.is_active).length

  const STATS = [
    { label: 'Total Users',        value: users.length,  icon: UsersIcon, tone: 'blue' },
    { label: 'Active',             value: activeCount,   icon: UserCog,   tone: 'green' },
    { label: 'Pending Approval',   value: pendingCount,  icon: Clock3,    tone: 'orange' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>User Management</h1>
            <p className={styles.subtitle}>{users.length} team member{users.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {pendingCount} pending approval</p>
          </div>
          <button className={styles.refreshBtn} onClick={load}><RefreshCw size={14}/> Refresh</button>
        </div>

        <div className={styles.statsRow}>
          {STATS.map(s => (
            <div key={s.label} className={styles.statChip}>
              <div className={styles.statIcon + ' ' + styles['tone_' + s.tone]}><s.icon size={16} /></div>
              <div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} /> Loading users...</div>
        ) : users.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIconWrap}><UsersIcon size={26} strokeWidth={1.75} /></div>
            <div className={styles.emptyTitle}>No users yet</div>
            <div className={styles.emptySub}>New registrations will show up here for approval.</div>
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableHead}>
              <span>User</span><span>Role</span><span>Status</span><span>Actions</span>
            </div>
            {users.map(u => (
              <div className={styles.row} key={u.id}>
                <div className={styles.userCell}>
                  <div className={styles.avatar} style={{ background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role] }}>
                    {initialsOf(u.full_name)}
                  </div>
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>{u.full_name}</div>
                    <div className={styles.userEmail}>{u.email}</div>
                  </div>
                </div>

                <div>
                  <span className={styles.roleBadge} style={{ background: `${ROLE_COLORS[u.role]}14`, color: ROLE_COLORS[u.role] }}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </div>

                <div>
                  <span className={styles.statusPill + ' ' + (u.is_active ? styles.statusActive : styles.statusPending)}>
                    <span className={styles.statusDot} /> {u.is_active ? 'Active' : 'Pending'}
                  </span>
                </div>

                <div className={styles.actions}>
                  {!u.is_active && (
                    <button className={styles.approveBtn} onClick={() => approve(u.id)}><UserCheck size={13}/> Approve</button>
                  )}
                  <select className={styles.roleSelect}
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value)}
                    title="Change role">
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  {u.is_active && u.id !== user.id && (
                    <button className={styles.deactivateBtn} onClick={() => deactivate(u.id)}><UserX size={13}/> Deactivate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
