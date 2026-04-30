import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateProfile } = useWorkspace()
  const [email, setEmail] = useState(user?.email ?? '')
  const [name, setName] = useState(user?.name ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    try {
      await updateProfile({ email, name, password: password || undefined })
      navigate('/dashboard')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update profile')
    }
  }

  return (
    <section className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="panel-title">Profile</h1>
        <p className="panel-subtitle">Update your account name, email, or password.</p>
        <label className="field-label">
          Name
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field-label">
          Email
          <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label className="field-label">
          New password
          <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Leave blank to keep current password" />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="action-primary mt-5 w-full">Save profile</button>
      </form>
    </section>
  )
}
