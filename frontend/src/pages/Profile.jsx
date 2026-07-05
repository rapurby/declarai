import { useState } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { authAPI } from '../services/api.js'
import { getUser } from '../utils/auth.js'
import toast from 'react-hot-toast'

export default function Profile() {
  const user = getUser()

  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [showCur,    setShowCur]    = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [showCon,    setShowCon]    = useState(false)
  const [loading,    setLoading]    = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPw !== confirmPw) { toast.error('New passwords do not match'); return }
    if (newPw.length < 6)    { toast.error('New password must be at least 6 characters'); return }

    setLoading(true)
    try {
      await authAPI.changePassword(currentPw, newPw)
      toast.success('Password changed successfully')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>
        Profile &amp; Security
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Manage your account details and password.
      </p>

      {/* Account info */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '18px 20px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 14 }}>
          Account Info
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          {[
            { label: 'Full Name', value: user?.name || '—' },
            { label: 'Email',     value: user?.email || '—' },
            { label: 'Role',      value: user?.role  || '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Change password form */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
          <KeyRound size={14} color="var(--text-muted)" />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Change Password
          </span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Current Password', value: currentPw, set: setCurrentPw, show: showCur, toggle: () => setShowCur(p => !p) },
            { label: 'New Password',     value: newPw,     set: setNewPw,     show: showNew, toggle: () => setShowNew(p => !p) },
            { label: 'Confirm New Password', value: confirmPw, set: setConfirmPw, show: showCon, toggle: () => setShowCon(p => !p) },
          ].map(({ label, value, set, show, toggle }) => (
            <div key={label}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                {label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={e => set(e.target.value)}
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 36px 9px 12px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 13, background: 'var(--bg)', color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button type="button" onClick={toggle} style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                  padding: 0, display: 'flex',
                }}>
                  {show ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
          ))}

          <button type="submit" disabled={loading} style={{
            marginTop: 4, padding: '10px 0', borderRadius: 8,
            background: 'var(--primary)', color: 'white',
            border: 'none', fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {loading ? 'Saving...' : <><CheckCircle size={14}/> Save New Password</>}
          </button>
        </form>
      </div>
    </div>
  )
}
