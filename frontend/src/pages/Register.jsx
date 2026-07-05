import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2, ShieldCheck, FileSearch, Radar, Info } from 'lucide-react'
import { authAPI } from '../services/api.js'
import toast from 'react-hot-toast'
import styles from './Register.module.css'

export default function Register() {
  const [form, setForm]         = useState({ email: '', full_name: '', password: '', role: 'operator' })
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authAPI.register(form)
      toast.success('Account created! Waiting for admin approval.')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.authShell}>
      <aside className={styles.brandPanel}>
        <div className={styles.brandPanelTop}>
          <div className={styles.brandRow}>
            <div className={styles.brandIcon}><Zap size={17}/></div>
            <div>
              <div className={styles.brandTitle}>DeclarAI</div>
              <div className={styles.brandTagline}>Cikarang Dry Port</div>
            </div>
          </div>

          <h1 className={styles.heroHeading}>Request access to the customs declaration workspace.</h1>
          <p className={styles.heroText}>
            Create an operator or viewer account. An admin reviews every request before it's activated.
          </p>
        </div>

        <div className={styles.metricList}>
          <div className={styles.metric}>
            <div className={`${styles.metricIcon} ${styles.success}`}><ShieldCheck size={15}/></div>
            <span className={styles.metricLabel}>CEISA-compliant validation</span>
          </div>
          <div className={styles.metric}>
            <div className={`${styles.metricIcon} ${styles.accentTone}`}><FileSearch size={15}/></div>
            <span className={styles.metricLabel}>Automated data extraction</span>
          </div>
          <div className={styles.metric}>
            <div className={`${styles.metricIcon} ${styles.warn}`}><Radar size={15}/></div>
            <span className={styles.metricLabel}>Real-time status tracking</span>
          </div>
        </div>

        <p className={styles.brandPanelFoot}>© 2026 Cikarang Dry Port. Internal use only.</p>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.authCard}>
          <h2 className={styles.authTitle}>Create account</h2>
          <p className={styles.authSubtitle}>Set up operator or viewer access</p>

          <form onSubmit={handleSubmit} className={styles.authForm}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full Name</label>
              <input className={styles.formInput} value={form.full_name}
                onChange={set('full_name')} placeholder="Your full name" required />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" value={form.email}
                onChange={set('email')} placeholder="you@cdp.co.id" required />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Password</label>
              <div className={styles.passwordField}>
                <input className={styles.formInput} type={showPw ? 'text' : 'password'}
                  value={form.password} onChange={set('password')}
                  placeholder="At least 8 characters" required minLength={8} />
                <button type="button" className={styles.togglePw} onClick={() => setShowPw(p => !p)}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Role</label>
              <select className={styles.formInput} value={form.role} onChange={set('role')}>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <button className={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? <Loader2 size={15} className={styles.btnSpinner}/> : null}
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <div className={styles.approvalNote}>
            <Info size={14} />
            <span>Your account requires admin approval before you can log in.</span>
          </div>

          <p className={styles.authFooter}>
            Already have an account? <Link to="/login" className={styles.authLink}>Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
