import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fullUrl } from '../lib/api'
import { loadImage, parseScene } from '../lib/scene'
import type { Asset, Layer, Project } from '../types/wallpreview'

type ImageFrame = {
  left: number
  top: number
  width: number
  height: number
  scale: number
  naturalWidth: number
  naturalHeight: number
}

type ResizeMode = 'move' | 'right' | 'bottom' | 'corner'

export function DesignerPage() {
  const { id } = useParams()
  const { assets, projects, refreshWorkspace, saveProject } = useWorkspace()
  const [project, setProject] = useState<Project | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frame, setFrame] = useState<ImageFrame | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const utilities = assets.filter((asset) => asset.kind === 'UTILITY')
  const wall = useMemo(
    () => assets.find((asset) => asset.id === project?.wall_asset_id),
    [assets, project?.wall_asset_id],
  )

  useEffect(() => {
    void refreshWorkspace()
  }, [])

  useEffect(() => {
    const match = projects.find((item) => item.id === Number(id))
    if (match) {
      setProject(match)
      setLayers(parseScene(match.scene_json).layers)
    }
  }, [id, projects])

  useEffect(() => {
    function update() {
      const image = imageRef.current
      const canvas = canvasRef.current
      if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) {
        return
      }

      const container = canvas.getBoundingClientRect()
      const imageRatio = image.naturalWidth / image.naturalHeight
      const containerRatio = container.width / container.height
      const width = containerRatio > imageRatio ? container.height * imageRatio : container.width
      const height = containerRatio > imageRatio ? container.height : container.width / imageRatio
      const left = (container.width - width) / 2
      const top = (container.height - height) / 2

      setFrame({
        left,
        top,
        width,
        height,
        scale: width / image.naturalWidth,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [wall])

  async function addUtility(asset: Asset) {
    if (!frame) {
      return
    }

    const image = await loadImage(fullUrl(asset.public_url))
    const defaultWidth = Math.min(frame.naturalWidth * 0.18, image.naturalWidth)
    const defaultHeight = defaultWidth * (image.naturalHeight / image.naturalWidth)

    setLayers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        assetId: asset.id,
        src: fullUrl(asset.public_url),
        name: asset.name,
        x: Math.max(0, frame.naturalWidth * 0.08 + current.length * 24),
        y: Math.max(0, frame.naturalHeight * 0.08 + current.length * 18),
        width: defaultWidth,
        height: defaultHeight,
      },
    ])
  }

  function updateLayer(id: string, patch: Partial<Layer>) {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)))
  }

  async function exportImage() {
    if (!wall || !frame) {
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = frame.naturalWidth
    canvas.height = frame.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const wallImage = await loadImage(fullUrl(wall.public_url))
    context.drawImage(wallImage, 0, 0, canvas.width, canvas.height)

    for (const layer of layers) {
      const utilityImage = await loadImage(layer.src)
      context.drawImage(utilityImage, layer.x, layer.y, layer.width, layer.height)
    }

    const link = document.createElement('a')
    link.download = `${(project?.name ?? 'wallpreview').replace(/\s+/g, '-').toLowerCase()}-wallpreview.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  if (!id) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section className="designer-shell">
      <div className="designer-toolbar">
        <Link className="nav-pill" to="/dashboard">Back</Link>
        <div className="mr-auto">
          <h1 className="text-2xl font-black tracking-tight">{project?.name ?? 'Project'}</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Industrial visual layout canvas</p>
        </div>
        <button className="nav-pill" onClick={() => project && saveProject(project.id, { layers })}>Save</button>
        <button className="nav-pill command-primary" onClick={exportImage}>Export PNG</button>
      </div>
      <div className="canvas-zone" ref={canvasRef}>
        {wall ? (
          <img
            className="canvas-wall-image"
            ref={imageRef}
            src={fullUrl(wall.public_url)}
            alt={wall.name}
            onLoad={() => window.dispatchEvent(new Event('resize'))}
          />
        ) : (
          <div className="grid h-full place-items-center text-stone-500">Select a wall image from dashboard first.</div>
        )}
        {frame ? (
          <div className="image-stage" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
            {layers.map((layer) => (
              <CanvasLayer
                key={layer.id}
                frame={frame}
                layer={layer}
                selected={selectedId === layer.id}
                onSelect={() => setSelectedId(layer.id)}
                onUpdate={updateLayer}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="utility-dock">
        <div className="mr-3 min-w-36 border-r border-stone-700 pr-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#fce100]">Utilities</p>
          <p className="text-sm text-stone-300">Click to place. Drag handles to resize.</p>
        </div>
        <div className="flex gap-3 overflow-x-auto">
          {utilities.map((asset) => (
            <button className="dock-item" key={asset.id} onClick={() => void addUtility(asset)}>
              <img className="h-16 w-20 object-contain" src={fullUrl(asset.public_url)} alt={asset.name} />
              <span className="max-w-24 truncate text-xs">{asset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function CanvasLayer({
  frame,
  layer,
  selected,
  onSelect,
  onUpdate,
}: {
  frame: ImageFrame
  layer: Layer
  selected: boolean
  onSelect: () => void
  onUpdate: (id: string, patch: Partial<Layer>) => void
}) {
  const left = layer.x * frame.scale
  const top = layer.y * frame.scale
  const width = layer.width * frame.scale
  const height = layer.height * frame.scale

  function startPointer(event: ReactPointerEvent, mode: ResizeMode) {
    event.preventDefault()
    event.stopPropagation()
    onSelect()

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startLayer = { ...layer }

    function pointerMove(moveEvent: PointerEvent) {
      const deltaX = (moveEvent.clientX - startClientX) / frame.scale
      const deltaY = (moveEvent.clientY - startClientY) / frame.scale

      if (mode === 'move') {
        onUpdate(layer.id, {
          x: clamp(startLayer.x + deltaX, 0, frame.naturalWidth - startLayer.width),
          y: clamp(startLayer.y + deltaY, 0, frame.naturalHeight - startLayer.height),
        })
        return
      }

      const nextWidth = mode === 'right' || mode === 'corner'
        ? clamp(startLayer.width + deltaX, 16, frame.naturalWidth - startLayer.x)
        : startLayer.width
      const nextHeight = mode === 'bottom' || mode === 'corner'
        ? clamp(startLayer.height + deltaY, 16, frame.naturalHeight - startLayer.y)
        : startLayer.height

      onUpdate(layer.id, { width: nextWidth, height: nextHeight })
    }

    function pointerUp() {
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
    }

    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
  }

  return (
    <div
      className={`canvas-layer ${selected ? 'is-selected' : ''}`}
      onPointerDown={(event) => startPointer(event, 'move')}
      style={{ left, top, width, height }}
    >
      <img className="h-full w-full object-fill" src={layer.src} alt={layer.name} draggable={false} />
      <button className="resize-handle resize-right" onPointerDown={(event) => startPointer(event, 'right')} aria-label="Resize width" />
      <button className="resize-handle resize-bottom" onPointerDown={(event) => startPointer(event, 'bottom')} aria-label="Resize height" />
      <button className="resize-handle resize-corner" onPointerDown={(event) => startPointer(event, 'corner')} aria-label="Resize width and height" />
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
