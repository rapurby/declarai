import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2, ShieldCheck, FileSearch, Radar } from 'lucide-react'
import { login } from '../utils/auth.js'
import toast from 'react-hot-toast'
import styles from './Login.module.css'

export default function Login() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed'
      toast.error(msg)
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

          <h1 className={styles.heroHeading}>Customs declarations, reviewed and validated by AI.</h1>
          <p className={styles.heroText}>
            DeclarAI checks every document against CEISA requirements before it reaches your desk.
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
          <h2 className={styles.authTitle}>Sign in to your account</h2>
          <p className={styles.authSubtitle}>AI-Powered Customs Declaration System</p>

          <form onSubmit={handleSubmit} className={styles.authForm}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@cdp.co.id" required />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Password</label>
              <div className={styles.passwordField}>
                <input className={styles.formInput} type={showPw ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required />
                <button type="button" className={styles.togglePw} onClick={() => setShowPw(p => !p)}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
            </div>
            <button className={styles.signInBtn} type="submit" disabled={loading}>
              {loading ? <Loader2 size={15} className={styles.btnSpinner}/> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className={styles.authFooter}>
            New user? Register and wait for admin approval.
            <br/>
            <a href="/register" className={styles.authLink}>Create account</a>
          </p>
        </div>
      </main>
    </div>
  )
}
