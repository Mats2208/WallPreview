import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { API_BASE, authHeaders } from '../lib/api'
import type { Asset, Project, Scene, User } from '../types/wallpreview'

type WorkspaceContextValue = {
  token: string
  user: User | null
  assets: Asset[]
  projects: Project[]
  message: string
  setMessage: (message: string) => void
  request: <T>(path: string, options?: RequestInit) => Promise<T>
  setSessionToken: (token: string) => void
  logout: () => void
  refreshWorkspace: (sessionToken?: string) => Promise<void>
  upload: (kind: 'walls' | 'utilities', file: File) => Promise<void>
  createProject: (name: string, wallAssetId: number | null) => Promise<Project>
  saveProject: (projectId: number, scene: Scene) => Promise<Project>
  updateProfile: (input: { email: string; name: string; password?: string }) => Promise<User>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('wallpreview_token') ?? '')
  const [user, setUser] = useState<User | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!message) {
      return
    }

    const timeout = window.setTimeout(() => setMessage(''), 3600)
    return () => window.clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!token) {
      return
    }

    localStorage.setItem('wallpreview_token', token)
    void loadSession(token)
  }, [token])

  async function request<T>(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? authHeaders(token) : {}),
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    return response.json() as Promise<T>
  }

  async function loadSession(sessionToken = token) {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: authHeaders(sessionToken),
    })

    if (!response.ok) {
      localStorage.removeItem('wallpreview_token')
      setToken('')
      setUser(null)
      return
    }

    setUser((await response.json()) as User)
    await refreshWorkspace(sessionToken)
  }

  async function refreshWorkspace(sessionToken = token) {
    if (!sessionToken) {
      return
    }

    const headers = authHeaders(sessionToken)
    const [assetResponse, projectResponse] = await Promise.all([
      fetch(`${API_BASE}/assets`, { headers }),
      fetch(`${API_BASE}/projects`, { headers }),
    ])

    if (assetResponse.ok) {
      setAssets((await assetResponse.json()) as Asset[])
    }

    if (projectResponse.ok) {
      setProjects((await projectResponse.json()) as Project[])
    }
  }

  function setSessionToken(sessionToken: string) {
    setToken(sessionToken)
  }

  function logout() {
    localStorage.removeItem('wallpreview_token')
    setToken('')
    setUser(null)
    setAssets([])
    setProjects([])
  }

  async function upload(kind: 'walls' | 'utilities', file: File) {
    const formData = new FormData()
    formData.append('file', file)
    await request<Asset>(`/assets/${kind}`, { method: 'POST', body: formData })
    await refreshWorkspace()
    setMessage(kind === 'walls' ? 'Wall image uploaded.' : 'Utility uploaded to shared library.')
  }

  async function createProject(name: string, wallAssetId: number | null) {
    const project = await request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, wallAssetId, scene: { layers: [] } }),
    })
    await refreshWorkspace()
    return project
  }

  async function saveProject(projectId: number, scene: Scene) {
    const updated = await request<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ scene }),
    })
    await refreshWorkspace()
    setMessage('Project saved.')
    return updated
  }

  async function updateProfile(input: { email: string; name: string; password?: string }) {
    const updated = await request<User>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    setUser(updated)
    setMessage('Profile updated.')
    return updated
  }

  const value = useMemo(
    () => ({
      token,
      user,
      assets,
      projects,
      message,
      setMessage,
      request,
      setSessionToken,
      logout,
      refreshWorkspace,
      upload,
      createProject,
      saveProject,
      updateProfile,
    }),
    [token, user, assets, projects, message],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider')
  }

  return value
}
