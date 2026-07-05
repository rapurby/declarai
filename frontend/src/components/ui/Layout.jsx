import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { LayoutDashboard, Upload, FileText, Users, LogOut, ChevronDown, Zap, KeyRound } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { getUser, logout, isAuthenticated } from '../../utils/auth.js'
import styles from './Layout.module.css'

const NAV = {
  admin:    [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/upload',       icon: Upload,          label: 'Upload' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
    { to: '/users',        icon: Users,           label: 'Users' },
  ],
  operator: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/upload',       icon: Upload,          label: 'Upload' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
  ],
  viewer: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
  ],
}

const ROLE_META = {
  admin:    { color: '#dc2626', bg: 'rgba(220,38,38,0.10)',   label: 'Admin' },
  operator: { color: '#0d9f6e', bg: 'rgba(13,159,110,0.10)', label: 'Operator' },
  viewer:   { color: '#2563eb', bg: 'rgba(37,99,235,0.10)',  label: 'Viewer' },
}

export default function Layout() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  if (!isAuthenticated()) return <Navigate to="/login" replace />

  const user = getUser()
  const role = user?.role || 'operator'
  const meta = ROLE_META[role] || ROLE_META.operator
  const navItems = NAV[role] || NAV.operator
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'OP'

  const handleLogout = () => { logout(); navigate('/login') }

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={styles.shell}>
      <header className={styles.topnav}>
        <div className={styles.topnavInner}>
          {/* Brand */}
          <div className={styles.brand}>
            <div className={styles.brandMark}><Zap size={14} /></div>
            <span className={styles.brandName}>DeclarAI</span>
            <span className={styles.brandSep}>|</span>
            <span className={styles.brandSub}>Cikarang Dry Port</span>
          </div>

          {/* Nav links */}
          <nav className={styles.navLinks}>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => styles.navLink + (isActive ? ' ' + styles.navLinkActive : '')}>
                <Icon size={14} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User menu */}
          <div className={styles.userArea} ref={menuRef}>
            <span className={styles.rolePill} style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            <button className={styles.userBtn} onClick={() => setMenuOpen(p => !p)}>
              <div className={styles.avatar} style={{ background: meta.bg, color: meta.color }}>{initials}</div>
              <span className={styles.userName}>{user?.name}</span>
              <ChevronDown size={13} className={menuOpen ? styles.chevronOpen : ''} />
            </button>
            {menuOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropEmail}>{user?.email}</div>
                <div className={styles.dropDivider} />
                <button className={styles.dropLogout} onClick={() => { setMenuOpen(false); navigate('/profile') }}>
                  <KeyRound size={13} /> Change Password
                </button>
                <button className={styles.dropLogout} onClick={handleLogout}>
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
