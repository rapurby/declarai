import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { authAPI } from '../services/api.js'
import toast from 'react-hot-toast'
import styles from './Login.module.css'

export default function Register() {
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'operator' })
  const [loading, setLoading] = useState(false)
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
      setLoading(false) }
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
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.sub}>Your account will be activated after admin approval</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Full Name</label>
            <input className={styles.input} value={form.full_name} onChange={set('full_name')} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Company Email</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input className={styles.input} type="password" value={form.password} onChange={set('password')} required minLength={8} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Role</label>
            <select className={styles.input} value={form.role} onChange={set('role')}>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className={styles.registerNote}><Link to="/login" className={styles.link}>Back to sign in</Link></p>
      </div>
    </div>
  )
}
