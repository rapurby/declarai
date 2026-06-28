import { useState, useEffect } from 'react'
import { adminAPI } from '../services/api.js'
import { getUser } from '../utils/auth.js'
import { UserCheck, UserX, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import styles from './Users.module.css'

const ROLE_COLORS = { admin: '#dc2626', operator: '#0d9f6e', viewer: '#2563eb' }

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>User Management</h1>
        <button className={styles.refreshBtn} onClick={load}><RefreshCw size={14}/> Refresh</button>
      </div>

      {loading ? <div className={styles.loading}>Loading users...</div> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className={styles.name}>{u.full_name}</td>
                  <td className={styles.email}>{u.email}</td>
                  <td>
                    <select className={styles.roleSelect}
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      style={{ color: ROLE_COLORS[u.role] }}>
                      <option value="operator">Operator</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <span className={u.is_active ? styles.active : styles.pending}>
                      {u.is_active ? 'Active' : 'Pending'}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    {!u.is_active && (
                      <button className={styles.approveBtn} onClick={() => approve(u.id)}><UserCheck size={13}/> Approve</button>
                    )}
                    {u.is_active && u.id !== user.id && (
                      <button className={styles.deactivateBtn} onClick={() => deactivate(u.id)}><UserX size={13}/> Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
