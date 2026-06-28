import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff } from 'lucide-react'
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
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandMark}><Zap size={18}/></div>
          <div>
            <div className={styles.brandName}>DeclarAI</div>
            <div className={styles.brandSub}>Cikarang Dry Port</div>
          </div>
        </div>
        <h1 className={styles.title}>Sign in to your account</h1>
        <p className={styles.sub}>AI-Powered Customs Declaration System</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@cdp.co.id" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <div className={styles.pwWrap}>
              <input className={styles.input} type={showPw ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>
          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className={styles.registerNote}>
          New user? Register and wait for admin approval.
          <br/>
          <a href="/register" className={styles.link}>Create account</a>
        </p>
      </div>
    </div>
  )
}
