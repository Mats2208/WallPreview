import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssetGrid } from '../components/AssetGrid'
import { UploadCard } from '../components/UploadCard'
import { useWorkspace } from '../context/WorkspaceContext'

const IMAGE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.heic',
  '.heif',
].join(',')

export function DashboardPage() {
  const navigate = useNavigate()
  const { assets, projects, upload, createProject, refreshWorkspace } = useWorkspace()
  const walls = assets.filter((asset) => asset.kind === 'WALL')
  const utilities = assets.filter((asset) => asset.kind === 'UTILITY')
  const [projectName, setProjectName] = useState('New wall preview')
  const [wallAssetId, setWallAssetId] = useState<number | null>(walls[0]?.id ?? null)

  useEffect(() => {
    void refreshWorkspace()
  }, [])

  useEffect(() => {
    if (!wallAssetId && walls[0]) {
      setWallAssetId(walls[0].id)
    }
  }, [walls, wallAssetId])

  async function handleCreateProject() {
    const project = await createProject(projectName, wallAssetId)
    navigate(`/projects/${project.id}`)
  }

  return (
    <section className="dashboard-grid">
      <div className="panel">
        <p className="eyebrow">Control room</p>
        <h1 className="text-4xl font-black tracking-tight">Workspace</h1>
        <p className="mt-2 text-[var(--muted)]">Upload wall photos per user. Utilities are shared globally across all projects.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <UploadCard title="Upload wall" accept={IMAGE_ACCEPT} onFile={(file) => upload('walls', file)} />
          <UploadCard title="Upload utility" accept={IMAGE_ACCEPT} onFile={(file) => upload('utilities', file)} />
        </div>
        <div className="create-card">
          <h2 className="text-2xl font-black tracking-tight">Create project</h2>
          <input className="field mt-4 text-stone-950" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <select className="field mt-3 text-stone-950" value={wallAssetId ?? ''} onChange={(event) => setWallAssetId(Number(event.target.value) || null)}>
            <option value="">No wall selected</option>
            {walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}
          </select>
          <button className="action-primary mt-4" onClick={handleCreateProject}>Open designer</button>
        </div>
      </div>
      <div className="grid gap-6">
        <div className="panel">
          <h2 className="text-3xl font-black tracking-tight">Projects</h2>
          <div className="mt-4 grid gap-3">
            {projects.length ? projects.map((project) => (
              <button className="project-row" key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                <span className="font-bold">{project.name}</span>
                <span className="text-sm text-stone-500">Project #{project.id}</span>
              </button>
            )) : <p className="text-stone-500">No projects yet.</p>}
          </div>
        </div>
        <div className="panel">
          <h2 className="text-3xl font-black tracking-tight">Utility library</h2>
          <AssetGrid assets={utilities} />
        </div>
      </div>
    </section>
  )
}
