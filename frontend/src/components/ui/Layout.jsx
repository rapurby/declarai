import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { LayoutDashboard, Upload, FileText, FlaskConical, LogOut, ChevronDown, Zap, Users, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { getUser, logout, isAuthenticated } from '../../utils/auth.js'
import styles from './Layout.module.css'

const NAV = {
  admin: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/upload',       icon: Upload,          label: 'Upload Document' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
    { to: '/simulator',    icon: FlaskConical,    label: 'CEISA Simulator' },
    { to: '/users',        icon: Users,           label: 'User Management' },
  ],
  operator: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/upload',       icon: Upload,          label: 'Upload Document' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
    { to: '/simulator',    icon: FlaskConical,    label: 'CEISA Simulator' },
  ],
  viewer: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/declarations', icon: FileText,        label: 'Declarations' },
  ],
}

const ROLE_META = {
  admin:    { color: '#dc2626', bg: 'rgba(220,38,38,0.12)',  label: 'Admin' },
  operator: { color: '#0d9f6e', bg: 'rgba(13,159,110,0.12)', label: 'Operator' },
  viewer:   { color: '#2563eb', bg: 'rgba(37,99,235,0.12)',  label: 'Viewer' },
}

export default function Layout() {
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (!isAuthenticated()) return <Navigate to="/login" replace />

  const user = getUser()
  const role = user?.role || 'operator'
  const meta = ROLE_META[role] || ROLE_META.operator
  const navItems = NAV[role] || NAV.operator
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'OP'

  const handleLogout = () => { logout(); navigate('/login') }

  const sidebar = (
    <aside className={styles.sidebar + (mobileNavOpen ? ' ' + styles.sidebarOpen : '')} onClick={() => setMobileNavOpen(false)}>
      <div className={styles.brand} onClick={e => e.stopPropagation()}>
        <div className={styles.brandMark}><Zap size={15}/></div>
        <div>
          <div className={styles.brandName}>DeclarAI</div>
          <div className={styles.brandSub}>Cikarang Dry Port</div>
        </div>
      </div>

      <div className={styles.navWrap} onClick={e => e.stopPropagation()}>
        <div className={styles.navSection}>MENU</div>
        <nav>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) => styles.navItem + (isActive ? ' ' + styles.navActive : '')}>
              <Icon size={15} className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className={styles.userSection} onClick={e => e.stopPropagation()}>
        <div className={styles.userCard} onClick={() => setUserMenuOpen(p => !p)}>
          <div className={styles.avatar} style={{ background: meta.bg, color: meta.color }}>{initials}</div>
          <div className={styles.userMeta}>
            <div className={styles.userName}>{user?.name}</div>
            <div className={styles.userRole} style={{ color: meta.color }}>{meta.label}</div>
          </div>
          <ChevronDown size={13} style={{ color: 'var(--sidebar-text)', transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </div>
        {userMenuOpen && (
          <div className={styles.userMenu}>
            <div className={styles.userEmail}>{user?.email}</div>
            <div className={styles.menuDivider} />
            <button className={styles.logoutBtn} onClick={handleLogout}><LogOut size={13}/> Sign Out</button>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <div className={styles.shell}>
      {mobileNavOpen && <div className={styles.overlay} onClick={() => setMobileNavOpen(false)} />}
      {sidebar}

      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.menuBtn} onClick={() => setMobileNavOpen(p => !p)}>
              {mobileNavOpen ? <X size={18}/> : <Menu size={18}/>}
            </button>
            <span className={styles.topbarBreadcrumb}>Customs Declaration System</span>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.rolePill} style={{ background: meta.bg, color: meta.color }}>{meta.label.toUpperCase()}</div>
            <div className={styles.topbarUser}>{user?.name}</div>
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
