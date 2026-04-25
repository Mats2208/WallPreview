import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { Toast } from './Toast'

export function AppShell() {
  const { user, logout, message, setMessage } = useWorkspace()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-8 py-4">
          <Link className="text-left" to={user ? '/dashboard' : '/'}>
            <span className="brand-word">WallPreview</span>
            <span className="brand-kicker">Industrial Design Studio</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm font-bold">
            {user ? (
              <>
                <Link className="identity-pill" to="/profile">{user.name}</Link>
                <Link className="nav-pill" to="/dashboard">Dashboard</Link>
                <button className="nav-pill" onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <>
                <Link className="nav-pill" to="/login">Login</Link>
                <Link className="nav-pill" to="/register">Register</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {message ? <Toast message={message} onClose={() => setMessage('')} /> : null}
      <Outlet />
    </main>
  )
}
