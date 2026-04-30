import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { Toast } from './Toast'

export function AppShell() {
  const { user, logout, message, setMessage } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const onDesigner = location.pathname.startsWith('/projects/')

  function handleLogout() {
    logout()
    navigate('/')
  }

  if (onDesigner) {
    return (
      <main className="app-shell" data-theme="dark">
        {message ? <Toast message={message} onClose={() => setMessage('')} /> : null}
        <Outlet />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="command-bar">
        <Link className="command-bar-brand" to={user ? '/dashboard' : '/'}>
          <b>WallPreview</b>
          <span>Industrial design studio</span>
        </Link>
        <nav className="command-bar-nav">
          {user ? (
            <>
              <Link className="nav-pill" to="/dashboard">Dashboard</Link>
              <Link className="identity-pill" to="/profile">{user.name}</Link>
              <button className="nav-pill" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link className="nav-pill" to="/login">Login</Link>
              <Link className="action-primary" to="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>
      {message ? <Toast message={message} onClose={() => setMessage('')} /> : null}
      <Outlet />
    </main>
  )
}
