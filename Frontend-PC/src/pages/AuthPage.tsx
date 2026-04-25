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
    <section className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1440px] place-items-center px-8 py-12">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">{mode === 'login' ? 'Workspace access' : 'Create designer account'}</p>
        <h1 className="text-4xl font-black tracking-tight">{mode === 'login' ? 'Login' : 'Register'}</h1>
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
        {error ? <p className="mt-4 bg-red-100 p-3 text-sm text-red-700">{error}</p> : null}
        <button className="action-primary mt-5 w-full">{mode === 'login' ? 'Enter dashboard' : 'Create account'}</button>
        <Link className="mt-4 block w-full text-center text-sm font-bold text-stone-500" to={mode === 'login' ? '/register' : '/login'}>
          {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
        </Link>
      </form>
    </section>
  )
}
