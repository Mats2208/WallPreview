import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fullUrl } from '../lib/api'
import { loadImage, parseScene } from '../lib/scene'
import type { Asset, Layer, Point, Project } from '../types/wallpreview'

type ImageFrame = {
  left: number
  top: number
  width: number
  height: number
  scale: number
  naturalWidth: number
  naturalHeight: number
}

type Quad = NonNullable<Layer['quad']>
type Corner = keyof Quad
type DragMode = 'move' | 'right' | 'bottom' | 'corner' | Corner
type ModifierKey = 'ctrl' | 'shift' | 'alt'

const BIND_STORAGE_KEY = 'wallpreview_canvas_bind'

export function DesignerPage() {
  const { id } = useParams()
  const { assets, projects, refreshWorkspace, saveProject, setMessage } = useWorkspace()
  const [project, setProject] = useState<Project | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frame, setFrame] = useState<ImageFrame | null>(null)
  const [modifierKey, setModifierKey] = useState<ModifierKey>(() => readModifierBind())
  const [modifierDown, setModifierDown] = useState(false)
  const [bindsOpen, setBindsOpen] = useState(false)
  const undoStack = useRef<Layer[][]>([])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const utilities = assets.filter((asset) => asset.kind === 'UTILITY')
  const selectedLayer = layers.find((layer) => layer.id === selectedId) ?? null
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
      setLayers(parseScene(match.scene_json).layers.map(normalizeLayer))
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

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
        return
      }

      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        const amount = event.shiftKey ? 10 : 1
        const delta = {
          x: event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
          y: event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0,
        }
        commitLayer(selectedId, (layer) => moveLayerBy(layer, delta, frame))
      }
    }

    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [selectedId, layers, frame])

  useEffect(() => {
    function syncModifier(event: KeyboardEvent) {
      setModifierDown(
        (modifierKey === 'ctrl' && event.ctrlKey) ||
          (modifierKey === 'shift' && event.shiftKey) ||
          (modifierKey === 'alt' && event.altKey),
      )
    }

    function resetModifier() {
      setModifierDown(false)
    }

    window.addEventListener('keydown', syncModifier)
    window.addEventListener('keyup', syncModifier)
    window.addEventListener('blur', resetModifier)
    return () => {
      window.removeEventListener('keydown', syncModifier)
      window.removeEventListener('keyup', syncModifier)
      window.removeEventListener('blur', resetModifier)
    }
  }, [modifierKey])

  async function addUtility(asset: Asset) {
    if (!frame) {
      return
    }

    const image = await loadImage(fullUrl(asset.public_url))
    const defaultWidth = Math.min(frame.naturalWidth * 0.18, image.naturalWidth)
    const defaultHeight = defaultWidth * (image.naturalHeight / image.naturalWidth)
    const x = Math.max(0, frame.naturalWidth * 0.08 + layers.length * 24)
    const y = Math.max(0, frame.naturalHeight * 0.08 + layers.length * 18)
    pushHistory()

    setLayers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        assetId: asset.id,
        src: fullUrl(asset.public_url),
        name: asset.name,
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
      },
    ])
  }

  function pushHistory() {
    undoStack.current = [...undoStack.current.slice(-24), cloneLayers(layers)]
  }

  function undo() {
    const previous = undoStack.current.pop()
    if (!previous) {
      setMessage('Nothing to undo.')
      return
    }

    setLayers(previous)
    setSelectedId(null)
  }

  function commitLayer(id: string, updater: (layer: Layer) => Layer) {
    pushHistory()
    setLayers((current) => current.map((layer) => (layer.id === id ? normalizeLayer(updater(layer)) : layer)))
  }

  function applyLayer(id: string, updater: (layer: Layer) => Layer) {
    setLayers((current) => current.map((layer) => (layer.id === id ? normalizeLayer(updater(layer)) : layer)))
  }

  function deleteSelected() {
    if (!selectedId) {
      return
    }

    pushHistory()
    setLayers((current) => current.filter((layer) => layer.id !== selectedId))
    setSelectedId(null)
  }

  function duplicateSelected() {
    if (!selectedLayer) {
      return
    }

    pushHistory()
    const clone = {
      ...cloneLayer(selectedLayer),
      id: crypto.randomUUID(),
      x: selectedLayer.x + 24,
      y: selectedLayer.y + 24,
      quad: selectedLayer.quad ? moveQuad(selectedLayer.quad, { x: 24, y: 24 }, frame) : undefined,
    }
    setLayers((current) => [...current, normalizeLayer(clone)])
    setSelectedId(clone.id)
  }

  function resetPerspective() {
    if (!selectedLayer) {
      return
    }

    commitLayer(selectedLayer.id, (layer) => ({ ...layer, quad: undefined }))
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
      if (isWarped(layer)) {
        await drawImageInQuad(context, utilityImage, getQuad(layer), 8)
      } else {
        context.drawImage(utilityImage, layer.x, layer.y, layer.width, layer.height)
      }
    }

    const link = document.createElement('a')
    link.download = `${(project?.name ?? 'wallpreview').replace(/\s+/g, '-').toLowerCase()}-wallpreview.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function saveModifier(next: ModifierKey) {
    setModifierKey(next)
    localStorage.setItem(BIND_STORAGE_KEY, next)
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
          <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Hold {modifierLabel(modifierKey)} while dragging corners for perspective mode</p>
        </div>
        <button className="nav-pill" onClick={() => setBindsOpen(true)}>Binds</button>
        <button className="nav-pill" onClick={() => project && saveProject(project.id, { layers })}>Save</button>
        <button className="nav-pill command-primary" onClick={exportImage}>Export PNG</button>
      </div>
      <div className="designer-workbench">
        <InspectorPanel
          selectedLayer={selectedLayer}
          modifierKey={modifierKey}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
          onResetPerspective={resetPerspective}
          onUndo={undo}
        />
        <div className="canvas-zone" ref={canvasRef} onPointerDown={clearSelectionFromCanvas}>
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
                  modifierKey={modifierKey}
                  modifierDown={modifierDown}
                  selected={selectedId === layer.id}
                  onSelect={() => setSelectedId(layer.id)}
                  onCommitStart={pushHistory}
                  onApply={applyLayer}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="utility-dock">
        <div className="mr-3 min-w-56 border-r border-stone-700 pr-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#fce100]">Utilities</p>
          <p className="text-sm text-stone-300">Click to place. Resize normally; hold {modifierLabel(modifierKey)} for perspective.</p>
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
      {bindsOpen ? (
        <BindModal
          modifierKey={modifierKey}
          onChange={saveModifier}
          onClose={() => setBindsOpen(false)}
        />
      ) : null}
    </section>
  )

  function clearSelectionFromCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (
      target === event.currentTarget ||
      target.classList.contains('canvas-wall-image') ||
      target.classList.contains('image-stage')
    ) {
      setSelectedId(null)
    }
  }
}

function InspectorPanel({
  selectedLayer,
  modifierKey,
  onDelete,
  onDuplicate,
  onResetPerspective,
  onUndo,
}: {
  selectedLayer: Layer | null
  modifierKey: ModifierKey
  onDelete: () => void
  onDuplicate: () => void
  onResetPerspective: () => void
  onUndo: () => void
}) {
  return (
    <aside className="designer-side-panel">
      <p className="side-panel-kicker">Canvas tools</p>
      <h2 className="side-panel-title">{selectedLayer ? selectedLayer.name : 'No selection'}</h2>
      <div className="side-panel-section">
        <button className="tool-button" disabled={!selectedLayer} onClick={onDuplicate}>Duplicate</button>
        <button className="tool-button" disabled={!selectedLayer} onClick={onResetPerspective}>Reset perspective</button>
        <button className="tool-button danger" disabled={!selectedLayer} onClick={onDelete}>Delete</button>
        <button className="tool-button" onClick={onUndo}>Undo</button>
      </div>
      <div className="side-panel-section text-sm text-stone-300">
        <p><b>Move:</b> drag selected utility</p>
        <p><b>Resize:</b> right, bottom, or corner handles</p>
        <p><b>Perspective:</b> hold {modifierLabel(modifierKey)} and drag a corner</p>
        <p><b>Delete:</b> Delete / Backspace</p>
        <p><b>Undo:</b> Ctrl + Z</p>
        <p><b>Nudge:</b> arrow keys, Shift for 10px</p>
      </div>
    </aside>
  )
}

function BindModal({
  modifierKey,
  onChange,
  onClose,
}: {
  modifierKey: ModifierKey
  onChange: (key: ModifierKey) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="bind-modal">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="eyebrow">Canvas binds</p>
            <h2 className="text-2xl font-black tracking-tight">Perspective modifier</h2>
            <p className="mt-2 text-sm text-stone-500">Choose which key activates corner deformation while dragging.</p>
          </div>
          <button className="nav-pill" onClick={onClose}>Close</button>
        </div>
        <div className="mt-6 grid gap-3">
          {(['ctrl', 'shift', 'alt'] as ModifierKey[]).map((key) => (
            <label className="bind-option" key={key}>
              <input
                checked={modifierKey === key}
                name="modifier"
                onChange={() => onChange(key)}
                type="radio"
              />
              <span>{modifierLabel(key)}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}

function CanvasLayer({
  frame,
  layer,
  modifierKey,
  modifierDown,
  selected,
  onSelect,
  onCommitStart,
  onApply,
}: {
  frame: ImageFrame
  layer: Layer
  modifierKey: ModifierKey
  modifierDown: boolean
  selected: boolean
  onSelect: () => void
  onCommitStart: () => void
  onApply: (id: string, updater: (layer: Layer) => Layer) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const quad = getQuad(layer)
  const screenQuad = scaleQuad(quad, frame.scale)
  const screenRect = {
    left: layer.x * frame.scale,
    top: layer.y * frame.scale,
    width: layer.width * frame.scale,
    height: layer.height * frame.scale,
  }

  useEffect(() => {
    let cancelled = false

    async function draw() {
      const canvas = canvasRef.current
      if (!canvas) {
        return
      }

      canvas.width = Math.max(1, Math.round(frame.width))
      canvas.height = Math.max(1, Math.round(frame.height))
      canvas.style.width = `${frame.width}px`
      canvas.style.height = `${frame.height}px`

      const context = canvas.getContext('2d')
      if (!context) {
        return
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!isWarped(layer)) {
        return
      }

      const image = await loadImage(layer.src)
      if (!cancelled) {
        await drawImageInQuad(context, image, screenQuad, 8)
      }
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [frame.height, frame.width, layer.quad, layer.src, screenQuad.bl.x, screenQuad.bl.y, screenQuad.br.x, screenQuad.br.y, screenQuad.tl.x, screenQuad.tl.y, screenQuad.tr.x, screenQuad.tr.y])

  function startPointer(event: ReactPointerEvent, requestedMode: DragMode) {
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    onCommitStart()

    const perspectiveActive = isModifierActive(event, modifierKey)
    const mode = requestedMode === 'corner' && perspectiveActive ? 'br' : requestedMode
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startLayer = cloneLayer(layer)
    const startQuad = cloneQuad(getQuad(layer))

    function pointerMove(moveEvent: PointerEvent) {
      const delta = {
        x: (moveEvent.clientX - startClientX) / frame.scale,
        y: (moveEvent.clientY - startClientY) / frame.scale,
      }

      onApply(layer.id, () => {
        if (mode === 'move') {
          return moveLayerBy(startLayer, delta, frame)
        }

        if (mode === 'right' || mode === 'bottom' || mode === 'corner') {
          return resizeRectLayer(startLayer, delta, mode, frame)
        }

        if (!perspectiveActive) {
          return startLayer
        }

        const nextQuad = {
          ...startQuad,
          [mode]: clampPoint(addPoint(startQuad[mode], delta), frame),
        }
        return { ...startLayer, ...layerFromQuad(nextQuad) }
      })
    }

    function pointerUp() {
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
    }

    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
  }

  return (
    <div className={`canvas-layer-shell ${selected ? 'is-selected' : ''}`}>
      {isWarped(layer) ? (
        <>
          <canvas className="quad-layer-canvas" ref={canvasRef} />
          <button
            className="quad-move-target"
            onPointerDown={(event) => startPointer(event, 'move')}
            style={quadBounds(scaleQuad(getQuad(layer), frame.scale))}
            aria-label={`Move ${layer.name}`}
          />
        </>
      ) : (
        <button
          className="rect-layer"
          onPointerDown={(event) => startPointer(event, 'move')}
          style={screenRect}
          aria-label={`Move ${layer.name}`}
        >
          <img className="h-full w-full object-fill" src={layer.src} alt={layer.name} draggable={false} />
        </button>
      )}
      {selected ? (
        <>
          <button
            className="rect-handle rect-right"
            style={{ left: screenRect.left + screenRect.width - 4, top: screenRect.top + screenRect.height / 2 - 14 }}
            onPointerDown={(event) => startPointer(event, 'right')}
            aria-label="Resize width"
          />
          <button
            className="rect-handle rect-bottom"
            style={{ left: screenRect.left + screenRect.width / 2 - 14, top: screenRect.top + screenRect.height - 4 }}
            onPointerDown={(event) => startPointer(event, 'bottom')}
            aria-label="Resize height"
          />
          <button
            className="rect-handle rect-corner"
            style={{ left: screenRect.left + screenRect.width - 6, top: screenRect.top + screenRect.height - 6 }}
            onPointerDown={(event) => startPointer(event, 'corner')}
            aria-label="Resize or perspective corner"
          />
          {modifierDown || isWarped(layer)
            ? (Object.keys(screenQuad) as Corner[]).map((corner) => (
                <button
                  className={`quad-corner quad-corner-${corner}`}
                  key={corner}
                  onPointerDown={(event) => startPointer(event, corner)}
                  style={{ left: screenQuad[corner].x, top: screenQuad[corner].y }}
                  aria-label={`Move ${corner} corner`}
                  title={`Hold ${modifierLabel(modifierKey)} for perspective handles`}
                />
              ))
            : null}
        </>
      ) : null}
    </div>
  )
}

function normalizeLayer(layer: Layer): Layer {
  if (!layer.quad) {
    return layer
  }

  return { ...layer, ...layerFromQuad(layer.quad) }
}

function resizeRectLayer(layer: Layer, delta: Point, mode: DragMode, frame: ImageFrame): Layer {
  if (layer.quad) {
    return resizeWarpedLayer(layer, delta, mode, frame)
  }

  const width = mode === 'right' || mode === 'corner'
    ? clamp(layer.width + delta.x, 16, frame.naturalWidth - layer.x)
    : layer.width
  const height = mode === 'bottom' || mode === 'corner'
    ? clamp(layer.height + delta.y, 16, frame.naturalHeight - layer.y)
    : layer.height

  return {
    ...layer,
    width,
    height,
    quad: undefined,
  }
}

function resizeWarpedLayer(layer: Layer, delta: Point, mode: DragMode, frame: ImageFrame): Layer {
  const quad = getQuad(layer)
  const bounds = quadBounds(quad)
  const nextWidth = mode === 'right' || mode === 'corner'
    ? clamp(bounds.width + delta.x, 16, frame.naturalWidth - bounds.left)
    : bounds.width
  const nextHeight = mode === 'bottom' || mode === 'corner'
    ? clamp(bounds.height + delta.y, 16, frame.naturalHeight - bounds.top)
    : bounds.height
  const scaleX = bounds.width === 0 ? 1 : nextWidth / bounds.width
  const scaleY = bounds.height === 0 ? 1 : nextHeight / bounds.height
  const nextQuad = scaleQuadFromOrigin(quad, { x: bounds.left, y: bounds.top }, scaleX, scaleY)

  return { ...layer, ...layerFromQuad(nextQuad) }
}

function moveLayerBy(layer: Layer, delta: Point, frame: ImageFrame | null): Layer {
  if (!frame) {
    return layer
  }

  if (layer.quad) {
    const quad = moveQuad(layer.quad, delta, frame)
    return { ...layer, ...layerFromQuad(quad) }
  }

  return {
    ...layer,
    x: clamp(layer.x + delta.x, 0, frame.naturalWidth - layer.width),
    y: clamp(layer.y + delta.y, 0, frame.naturalHeight - layer.height),
  }
}

function rectToQuad(x: number, y: number, width: number, height: number): Quad {
  return {
    tl: { x, y },
    tr: { x: x + width, y },
    br: { x: x + width, y: y + height },
    bl: { x, y: y + height },
  }
}

function getQuad(layer: Layer): Quad {
  return layer.quad ?? rectToQuad(layer.x, layer.y, layer.width, layer.height)
}

function isWarped(layer: Layer) {
  if (!layer.quad) {
    return false
  }

  const rect = rectToQuad(layer.x, layer.y, layer.width, layer.height)
  return (Object.keys(rect) as Corner[]).some((corner) => distance(rect[corner], layer.quad![corner]) > 0.5)
}

function layerFromQuad(quad: Quad): Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'quad'> {
  const bounds = quadBounds(quad)
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    quad,
  }
}

function scaleQuad(quad: Quad, scale: number): Quad {
  return {
    tl: scalePoint(quad.tl, scale),
    tr: scalePoint(quad.tr, scale),
    br: scalePoint(quad.br, scale),
    bl: scalePoint(quad.bl, scale),
  }
}

function scalePoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale }
}

function scaleQuadFromOrigin(quad: Quad, origin: Point, scaleX: number, scaleY: number): Quad {
  return {
    tl: scalePointFromOrigin(quad.tl, origin, scaleX, scaleY),
    tr: scalePointFromOrigin(quad.tr, origin, scaleX, scaleY),
    br: scalePointFromOrigin(quad.br, origin, scaleX, scaleY),
    bl: scalePointFromOrigin(quad.bl, origin, scaleX, scaleY),
  }
}

function scalePointFromOrigin(point: Point, origin: Point, scaleX: number, scaleY: number): Point {
  return {
    x: origin.x + (point.x - origin.x) * scaleX,
    y: origin.y + (point.y - origin.y) * scaleY,
  }
}

function cloneLayers(layers: Layer[]) {
  return layers.map(cloneLayer)
}

function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    quad: layer.quad ? cloneQuad(layer.quad) : undefined,
  }
}

function cloneQuad(quad: Quad): Quad {
  return {
    tl: { ...quad.tl },
    tr: { ...quad.tr },
    br: { ...quad.br },
    bl: { ...quad.bl },
  }
}

function moveQuad(quad: Quad, delta: Point, frame: ImageFrame | null): Quad {
  const moved = {
    tl: addPoint(quad.tl, delta),
    tr: addPoint(quad.tr, delta),
    br: addPoint(quad.br, delta),
    bl: addPoint(quad.bl, delta),
  }

  if (!frame) {
    return moved
  }

  const bounds = quadBounds(moved)
  const correction = {
    x: bounds.left < 0 ? -bounds.left : bounds.left + bounds.width > frame.naturalWidth ? frame.naturalWidth - bounds.left - bounds.width : 0,
    y: bounds.top < 0 ? -bounds.top : bounds.top + bounds.height > frame.naturalHeight ? frame.naturalHeight - bounds.top - bounds.height : 0,
  }

  return {
    tl: addPoint(moved.tl, correction),
    tr: addPoint(moved.tr, correction),
    br: addPoint(moved.br, correction),
    bl: addPoint(moved.bl, correction),
  }
}

function addPoint(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y }
}

function clampPoint(point: Point, frame: ImageFrame): Point {
  return {
    x: clamp(point.x, 0, frame.naturalWidth),
    y: clamp(point.y, 0, frame.naturalHeight),
  }
}

function quadBounds(quad: Quad) {
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x]
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y]
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

async function drawImageInQuad(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  quad: Quad,
  steps: number,
) {
  const width = image.naturalWidth
  const height = image.naturalHeight

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const u0 = column / steps
      const u1 = (column + 1) / steps
      const v0 = row / steps
      const v1 = (row + 1) / steps

      const s00 = { x: u0 * width, y: v0 * height }
      const s10 = { x: u1 * width, y: v0 * height }
      const s11 = { x: u1 * width, y: v1 * height }
      const s01 = { x: u0 * width, y: v1 * height }

      const d00 = interpolateQuad(quad, u0, v0)
      const d10 = interpolateQuad(quad, u1, v0)
      const d11 = interpolateQuad(quad, u1, v1)
      const d01 = interpolateQuad(quad, u0, v1)

      drawTexturedTriangle(context, image, [s00, s10, s11], [d00, d10, d11])
      drawTexturedTriangle(context, image, [s00, s11, s01], [d00, d11, d01])
    }
  }
}

function interpolateQuad(quad: Quad, u: number, v: number): Point {
  const top = lerpPoint(quad.tl, quad.tr, u)
  const bottom = lerpPoint(quad.bl, quad.br, u)
  return lerpPoint(top, bottom, v)
}

function lerpPoint(a: Point, b: Point, amount: number): Point {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  }
}

function drawTexturedTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
) {
  const expandedDestination = expandTriangle(destination, 0.85)
  const transform = triangleTransform(source, expandedDestination)
  if (!transform) {
    return
  }

  context.save()
  context.beginPath()
  context.moveTo(expandedDestination[0].x, expandedDestination[0].y)
  context.lineTo(expandedDestination[1].x, expandedDestination[1].y)
  context.lineTo(expandedDestination[2].x, expandedDestination[2].y)
  context.closePath()
  context.clip()
  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
  context.drawImage(image, 0, 0)
  context.restore()
}

function expandTriangle(points: [Point, Point, Point], amount: number): [Point, Point, Point] {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  }

  return points.map((point) => {
    const vector = { x: point.x - center.x, y: point.y - center.y }
    const length = Math.hypot(vector.x, vector.y) || 1
    return {
      x: point.x + (vector.x / length) * amount,
      y: point.y + (vector.y / length) * amount,
    }
  }) as [Point, Point, Point]
}

function triangleTransform(source: [Point, Point, Point], destination: [Point, Point, Point]) {
  const [s0, s1, s2] = source
  const [d0, d1, d2] = destination
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)

  if (Math.abs(denominator) < 0.0001) {
    return null
  }

  return {
    a: (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator,
    b: (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator,
    c: (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator,
    d: (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator,
    e:
      (d0.x * (s1.x * s2.y - s2.x * s1.y) +
        d1.x * (s2.x * s0.y - s0.x * s2.y) +
        d2.x * (s0.x * s1.y - s1.x * s0.y)) /
      denominator,
    f:
      (d0.y * (s1.x * s2.y - s2.x * s1.y) +
        d1.y * (s2.x * s0.y - s0.x * s2.y) +
        d2.y * (s0.x * s1.y - s1.x * s0.y)) /
      denominator,
  }
}

function isModifierActive(event: ReactPointerEvent, modifierKey: ModifierKey) {
  return (
    (modifierKey === 'ctrl' && event.ctrlKey) ||
    (modifierKey === 'shift' && event.shiftKey) ||
    (modifierKey === 'alt' && event.altKey)
  )
}

function readModifierBind(): ModifierKey {
  const value = localStorage.getItem(BIND_STORAGE_KEY)
  return value === 'shift' || value === 'alt' || value === 'ctrl' ? value : 'ctrl'
}

function modifierLabel(key: ModifierKey) {
  return key === 'ctrl' ? 'Ctrl' : key === 'shift' ? 'Shift' : 'Alt'
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
