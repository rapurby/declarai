import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/ui/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Upload from './pages/Upload.jsx'
import Declarations from './pages/Declarations.jsx'
import DeclarationDetail from './pages/DeclarationDetail.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Users from './pages/Users.jsx'
import Scan from './pages/Scan.jsx'
import Profile from './pages/Profile.jsx'
import { isAuthenticated } from './utils/auth.js'

function PrivateRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: { background: 'white', color: '#0f1c3f', border: '1px solid #e2e6ed', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
        success: { iconTheme: { primary: '#0d9f6e', secondary: 'white' } },
        error:   { iconTheme: { primary: '#dc2626', secondary: 'white' } },
      }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/scan/:token" element={<Scan />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"        element={<Dashboard />} />
          <Route path="upload"           element={<Upload />} />
          <Route path="declarations"     element={<Declarations />} />
          <Route path="declarations/:id" element={<DeclarationDetail />} />
          <Route path="users"            element={<Users />} />
          <Route path="profile"          element={<Profile />} />
        </Route>
      </Routes>
    </>
  )
}
