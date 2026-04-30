import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssetGrid } from '../components/AssetGrid'
import { UploadCard } from '../components/UploadCard'
import { useWorkspace } from '../context/WorkspaceContext'
import { withBuiltinUtilities } from '../lib/builtinAssets'

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

const UTILITY_ACCEPT = [IMAGE_ACCEPT, '.obj', 'model/obj', 'text/plain'].join(',')

export function DashboardPage() {
  const navigate = useNavigate()
  const { assets, projects, upload, createProject, refreshWorkspace } = useWorkspace()
  const walls = assets.filter((asset) => asset.kind === 'WALL')
  const utilities = withBuiltinUtilities(assets)
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
        <header className="panel-header">
          <div>
            <h1 className="panel-title">Workspace</h1>
            <p className="panel-subtitle">Upload walls per user. Utilities are shared across all projects.</p>
          </div>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadCard title="Upload wall" accept={IMAGE_ACCEPT} onFile={(file) => upload('walls', file)} />
          <UploadCard title="Upload utility" accept={UTILITY_ACCEPT} note="Images or OBJ models" onFile={(file) => upload('utilities', file)} />
        </div>
        <div className="create-card">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Create project</h2>
          <p className="mt-1 text-sm text-ink-secondary">Name it, pick a wall, and open the designer.</p>
          <label className="field-label">
            Project name
            <input className="field" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <label className="field-label">
            Wall image
            <select className="field" value={wallAssetId ?? ''} onChange={(event) => setWallAssetId(Number(event.target.value) || null)}>
              <option value="">No wall selected</option>
              {walls.map((wall) => <option key={wall.id} value={wall.id}>{wall.name}</option>)}
            </select>
          </label>
          <button className="action-primary mt-4" onClick={handleCreateProject}>Open designer</button>
        </div>
      </div>
      <div className="grid gap-6">
        <div className="panel">
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Projects</h2>
              <p className="panel-subtitle">{projects.length} saved</p>
            </div>
          </header>
          <div className="grid gap-3">
            {projects.length ? projects.map((project) => (
              <button className="project-row" key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                <b>{project.name}</b>
                <span>#{project.id}</span>
              </button>
            )) : <p className="text-sm text-ink-muted">No projects yet.</p>}
          </div>
        </div>
        <div className="panel">
          <header className="panel-header">
            <div>
              <h2 className="panel-title">Utility library</h2>
              <p className="panel-subtitle">Shared across all designers</p>
            </div>
          </header>
          <AssetGrid assets={utilities} />
        </div>
      </div>
    </section>
  )
}
