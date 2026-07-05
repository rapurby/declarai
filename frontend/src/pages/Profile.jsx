import { useState } from 'react'
import { KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, UserCircle } from 'lucide-react'
import { authAPI } from '../services/api.js'
import { getUser } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Profile.module.css'

const ROLE_COLORS = { admin: '#dc2626', operator: '#0d9f6e', viewer: '#2563eb' }

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

export default function Profile() {
  const user = getUser()

  const [editingProfile, setEditingProfile] = useState(false)
  const [fullName,    setFullName]    = useState(user?.name || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const handleSaveProfile = async () => {
    if (!fullName.trim()) { toast.error('Name cannot be empty'); return }
    setSavingProfile(true)
    try {
      await authAPI.updateProfile(fullName.trim())
      // update localStorage so navbar reflects new name immediately
      const stored = JSON.parse(localStorage.getItem('declarai_user') || '{}')
      stored.name = fullName.trim()
      localStorage.setItem('declarai_user', JSON.stringify(stored))
      toast.success('Profile updated')
      setEditingProfile(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [showCur,    setShowCur]    = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [showCon,    setShowCon]    = useState(false)
  const [loading,    setLoading]    = useState(false)
  // Presentational only — echoes the same outcome as the toast, inline on the form.
  const [feedback,   setFeedback]   = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFeedback(null)
    if (newPw !== confirmPw) {
      toast.error('New passwords do not match')
      setFeedback({ type: 'error', msg: 'New passwords do not match' })
      return
    }
    if (newPw.length < 6) {
      toast.error('New password must be at least 6 characters')
      setFeedback({ type: 'error', msg: 'New password must be at least 6 characters' })
      return
    }

    setLoading(true)
    try {
      await authAPI.changePassword(currentPw, newPw)
      toast.success('Password changed successfully')
      setFeedback({ type: 'success', msg: 'Password changed successfully' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to change password'
      toast.error(msg)
      setFeedback({ type: 'error', msg })
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { key: 'current', label: 'Current Password', value: currentPw, set: setCurrentPw, show: showCur, toggle: () => setShowCur(p => !p) },
    { key: 'new',     label: 'New Password',      value: newPw,     set: setNewPw,     show: showNew, toggle: () => setShowNew(p => !p) },
    { key: 'confirm', label: 'Confirm New Password', value: confirmPw, set: setConfirmPw, show: showCon, toggle: () => setShowCon(p => !p) },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Profile &amp; Security</h1>
          <p className={styles.subtitle}>Manage your account details and password.</p>
        </div>

        <div className={styles.accountCard}>
          <div className={styles.avatar}>{initialsOf(user?.name)}</div>
          <div className={styles.accountInfo}>
            {editingProfile ? (
              <div className={styles.editRow}>
                <input
                  className={styles.input}
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
                <button className={styles.submitBtn} onClick={handleSaveProfile} disabled={savingProfile} style={{ marginTop: 8 }}>
                  {savingProfile ? 'Saving...' : <><CheckCircle size={13}/> Save</>}
                </button>
                <button onClick={() => { setEditingProfile(false); setFullName(user?.name || '') }}
                  style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--text-muted, #8496b0)', fontSize: 12, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className={styles.accountName}>{user?.name || '—'}</div>
                <div className={styles.accountEmail}>{user?.email || '—'}</div>
                <span className={styles.roleBadge} style={{ background: `${ROLE_COLORS[user?.role] || '#8496b0'}14`, color: ROLE_COLORS[user?.role] || '#8496b0' }}>
                  {user?.role || 'unknown'}
                </span>
                <button onClick={() => setEditingProfile(true)}
                  style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid #e2e6ed', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#4a5568' }}>
                  <UserCircle size={13}/> Edit Profile
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.passwordCard}>
          <div className={styles.cardLabel}><KeyRound size={14} /> Change Password</div>

          {feedback && (
            <div className={styles.feedback + ' ' + (feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError)}>
              {feedback.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {feedback.msg}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {fields.map(({ key, label, value, set, show, toggle }) => (
              <div key={key} className={styles.field}>
                <label className={styles.fieldLabel}>{label}</label>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={e => set(e.target.value)}
                    required
                  />
                  <button type="button" className={styles.toggleBtn} onClick={toggle}>
                    {show ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
            ))}

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Saving...' : <><CheckCircle size={14}/> Save New Password</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
