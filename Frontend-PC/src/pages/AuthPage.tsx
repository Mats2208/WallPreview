import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE } from '../lib/api'
import { useWorkspace } from '../context/WorkspaceContext'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate()
  const { setSessionToken } = useWorkspace()
  const [email, setEmail] = useState(mode === 'login' ? 'admin@wallpreview.local' : '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState(mode === 'login' ? 'Admin123!' : '')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    const response = await fetch(`${API_BASE}/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'login' ? { email, password } : { email, name, password }),
    })

    if (!response.ok) {
      setError(await response.text())
      return
    }

    const data = (await response.json()) as { token: string }
    setSessionToken(data.token)
    navigate('/dashboard')
  }

  return (
    <section className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="panel-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="panel-subtitle">
          {mode === 'login'
            ? 'Access your workspace and continue where you left off.'
            : 'Start a new designer account to upload walls and build previews.'}
        </p>
        <label className="field-label">
          Email
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        {mode === 'register' ? (
          <label className="field-label">
            Name
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        ) : null}
        <label className="field-label">
          Password
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="action-primary mt-5 w-full">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <Link className="auth-link" to={mode === 'login' ? '/register' : '/login'}>
          {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
        </Link>
      </form>
    </section>
  )
}
