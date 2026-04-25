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
    <section className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1440px] place-items-center px-8 py-12">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">Account settings</p>
        <h1 className="text-4xl font-black tracking-tight">Profile</h1>
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
        {error ? <p className="mt-4 bg-red-100 p-3 text-sm text-red-700">{error}</p> : null}
        <button className="action-primary mt-5 w-full">Save profile</button>
      </form>
    </section>
  )
}
