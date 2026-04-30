import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fullUrl } from '../lib/api'
import { withBuiltinUtilities } from '../lib/builtinAssets'
import { DEFAULT_MODEL_SETTINGS, isObjAsset, renderModelToCanvas } from '../lib/model3d'
import { loadImage, parseScene } from '../lib/scene'
import type { Asset, Layer, ModelSettings, Point, Project } from '../types/wallpreview'

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
type DockTab = 'all' | 'images' | 'models'

const PERSPECTIVE_BIND_KEY = 'wallpreview_perspective_bind'
const SCALE_FACTOR = 1.1

export function DesignerPage() {
  const { id } = useParams()
  const { assets, projects, refreshWorkspace, saveProject, setMessage } = useWorkspace()
  const [project, setProject] = useState<Project | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frame, setFrame] = useState<ImageFrame | null>(null)
  const [perspectiveKey, setPerspectiveKey] = useState<ModifierKey>(() => readModifierBind())
  const [perspectiveDown, setPerspectiveDown] = useState(false)
  const [dockTab, setDockTab] = useState<DockTab>('all')
  const [axisLock, setAxisLock] = useState<'x' | 'y' | null>(null)
  const undoStack = useRef<Layer[][]>([])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const utilities = useMemo(() => withBuiltinUtilities(assets), [assets])
  const dockAssets = useMemo(() => filterDock(utilities, dockTab), [utilities, dockTab])
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
      if (!canvas) {
        return
      }

      const container = canvas.getBoundingClientRect()
      if (!image || !image.naturalWidth || !image.naturalHeight) {
        if (container.width > 0 && container.height > 0) {
          setFrame({
            left: 0,
            top: 0,
            width: container.width,
            height: container.height,
            scale: 1,
            naturalWidth: container.width,
            naturalHeight: container.height,
          })
        }
        return
      }

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
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) {
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
        commitLayer(selectedId, (layer) => moveLayerBy(layer, delta))
      }
    }

    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [selectedId, layers, frame])

  useEffect(() => {
    function syncModifier(event: KeyboardEvent) {
      setPerspectiveDown(
        (perspectiveKey === 'ctrl' && event.ctrlKey) ||
          (perspectiveKey === 'shift' && event.shiftKey) ||
          (perspectiveKey === 'alt' && event.altKey),
      )
    }

    function resetModifier() {
      setPerspectiveDown(false)
    }

    window.addEventListener('keydown', syncModifier)
    window.addEventListener('keyup', syncModifier)
    window.addEventListener('blur', resetModifier)
    return () => {
      window.removeEventListener('keydown', syncModifier)
      window.removeEventListener('keyup', syncModifier)
      window.removeEventListener('blur', resetModifier)
    }
  }, [perspectiveKey])

  async function addUtility(asset: Asset) {
    if (!frame) {
      return
    }

    const src = fullUrl(asset.public_url)
    const isModel = isObjAsset(asset.name, asset.public_url)
    let defaultWidth = frame.naturalWidth * 0.22
    let defaultHeight = defaultWidth
    if (!isModel) {
      const image = await loadImage(src)
      defaultWidth = Math.min(frame.naturalWidth * 0.2, image.naturalWidth)
      defaultHeight = defaultWidth * (image.naturalHeight / image.naturalWidth)
    }
    const x = Math.max(0, frame.naturalWidth * 0.06 + layers.length * 24)
    const y = Math.max(0, frame.naturalHeight * 0.06 + layers.length * 18)
    pushHistory()

    setLayers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        assetId: asset.id,
        src,
        name: asset.name,
        mediaType: isModel ? 'model3d' : 'image',
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        model: isModel ? { ...DEFAULT_MODEL_SETTINGS } : undefined,
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
      quad: selectedLayer.quad ? moveQuad(selectedLayer.quad, { x: 24, y: 24 }) : undefined,
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

  function updateSelectedModel(settings: Partial<ModelSettings>) {
    if (!selectedLayer || selectedLayer.mediaType !== 'model3d') {
      return
    }
    applyLayer(selectedLayer.id, (layer) => ({
      ...layer,
      model: { ...DEFAULT_MODEL_SETTINGS, ...layer.model, ...settings },
    }))
  }

  function updateSelectedTransform(input: Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>) {
    if (!selectedLayer) {
      return
    }
    applyLayer(selectedLayer.id, (layer) => ({
      ...layer,
      ...input,
      width: input.width !== undefined ? Math.max(8, input.width) : layer.width,
      height: input.height !== undefined ? Math.max(8, input.height) : layer.height,
      quad: undefined,
    }))
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
      if (layer.mediaType === 'model3d') {
        const modelCanvas = document.createElement('canvas')
        modelCanvas.width = Math.max(1, Math.round(layer.width))
        modelCanvas.height = Math.max(1, Math.round(layer.height))
        await renderModelToCanvas({
          canvas: modelCanvas,
          src: layer.src,
          settings: { ...DEFAULT_MODEL_SETTINGS, ...layer.model },
        })
        context.drawImage(modelCanvas, layer.x, layer.y, layer.width, layer.height)
        continue
      }

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

  function setPerspectiveBind(next: ModifierKey) {
    setPerspectiveKey(next)
    localStorage.setItem(PERSPECTIVE_BIND_KEY, next)
  }

  function handleCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!selectedLayer || !frame) {
      return
    }
    const target = event.target as HTMLElement
    if (!target.closest('.rect-layer') && !target.closest('.quad-move-target')) {
      return
    }

    event.preventDefault()
    const factor = Math.pow(SCALE_FACTOR, -event.deltaY / 100)
    pushHistory()
    applyLayer(selectedLayer.id, (layer) => {
      const nextWidth = Math.max(8, layer.width * factor)
      const nextHeight = Math.max(8, layer.height * factor)
      const cx = layer.x + layer.width / 2
      const cy = layer.y + layer.height / 2
      const nextX = cx - nextWidth / 2
      const nextY = cy - nextHeight / 2

      if (layer.mediaType === 'model3d') {
        return {
          ...layer,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        }
      }

      if (layer.quad) {
        const center = { x: cx, y: cy }
        const scaled = scaleQuadAround(layer.quad, center, factor)
        return { ...layer, ...layerFromQuad(scaled) }
      }

      return { ...layer, x: nextX, y: nextY, width: nextWidth, height: nextHeight }
    })
  }

  if (!id) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <section className="designer-shell">
      <div className="designer-toolbar">
        <Link className="nav-pill" to="/dashboard" aria-label="Back to dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          <span>Back</span>
        </Link>
        <span className="toolbar-divider" />
        <button className="nav-pill" onClick={undo}>Undo</button>
        <span className="toolbar-divider" />
        <span className="toolbar-title">{project?.name ?? 'Project'}</span>
        <button className="nav-pill" onClick={() => project && saveProject(project.id, { layers })}>Save</button>
        <button className="nav-pill command-primary" onClick={exportImage}>Export PNG</button>
      </div>
      <div className="designer-workbench">
        <div
          className="canvas-zone"
          ref={canvasRef}
          onPointerDown={clearSelectionFromCanvas}
          onWheel={handleCanvasWheel}
        >
          {wall ? (
            <img
              className="canvas-wall-image"
              ref={imageRef}
              src={fullUrl(wall.public_url)}
              alt={wall.name}
              onLoad={() => window.dispatchEvent(new Event('resize'))}
            />
          ) : (
            <div className="canvas-empty">Select a wall image from the dashboard first.</div>
          )}
          {frame ? (
            <div className="image-stage" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
              {layers.map((layer) => (
                <CanvasLayer
                  key={layer.id}
                  frame={frame}
                  layer={layer}
                  perspectiveKey={perspectiveKey}
                  perspectiveDown={perspectiveDown}
                  axisLock={selectedId === layer.id ? axisLock : null}
                  selected={selectedId === layer.id}
                  onSelect={() => setSelectedId(layer.id)}
                  onCommitStart={pushHistory}
                  onApply={applyLayer}
                  onAxisLockChange={setAxisLock}
                />
              ))}
            </div>
          ) : null}
        </div>
        <InspectorPanel
          selectedLayer={selectedLayer}
          perspectiveKey={perspectiveKey}
          onPerspectiveKeyChange={setPerspectiveBind}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
          onResetPerspective={resetPerspective}
          onModelChange={updateSelectedModel}
          onTransformChange={updateSelectedTransform}
          onUndo={undo}
        />
      </div>
      <div className="utility-dock">
        <div className="utility-dock-tabs">
          <DockTabButton current={dockTab} value="all" onSelect={setDockTab}>All</DockTabButton>
          <DockTabButton current={dockTab} value="images" onSelect={setDockTab}>Images</DockTabButton>
          <DockTabButton current={dockTab} value="models" onSelect={setDockTab}>3D models</DockTabButton>
        </div>
        <div className="utility-dock-strip">
          {dockAssets.map((asset) => (
            <button className="dock-item" key={asset.id} onClick={() => void addUtility(asset)} title={asset.name}>
              {isObjAsset(asset.name, asset.public_url) ? (
                <span className="dock-model-preview">OBJ</span>
              ) : (
                <img src={fullUrl(asset.public_url)} alt={asset.name} />
              )}
              <span className="dock-item-name">{asset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )

  function clearSelectionFromCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (
      target === event.currentTarget ||
      target.classList.contains('canvas-wall-image') ||
      target.classList.contains('image-stage') ||
      target.classList.contains('canvas-empty')
    ) {
      setSelectedId(null)
    }
  }
}

function filterDock(assets: Asset[], tab: DockTab) {
  if (tab === 'all') return assets
  if (tab === 'models') return assets.filter((a) => isObjAsset(a.name, a.public_url))
  return assets.filter((a) => !isObjAsset(a.name, a.public_url))
}

function DockTabButton({
  current,
  value,
  children,
  onSelect,
}: {
  current: DockTab
  value: DockTab
  children: React.ReactNode
  onSelect: (value: DockTab) => void
}) {
  return (
    <button className={`utility-dock-tab ${current === value ? 'is-on' : ''}`} onClick={() => onSelect(value)}>
      {children}
    </button>
  )
}

function InspectorPanel({
  selectedLayer,
  perspectiveKey,
  onPerspectiveKeyChange,
  onDelete,
  onDuplicate,
  onModelChange,
  onTransformChange,
  onResetPerspective,
  onUndo,
}: {
  selectedLayer: Layer | null
  perspectiveKey: ModifierKey
  onPerspectiveKeyChange: (key: ModifierKey) => void
  onDelete: () => void
  onDuplicate: () => void
  onModelChange: (settings: Partial<ModelSettings>) => void
  onTransformChange: (input: Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height'>>) => void
  onResetPerspective: () => void
  onUndo: () => void
}) {
  const model = selectedLayer?.mediaType === 'model3d'
    ? { ...DEFAULT_MODEL_SETTINGS, ...selectedLayer.model }
    : null

  return (
    <aside className="designer-side-panel">
      <div className="side-panel-section" style={{ marginTop: 0 }}>
        <p className="side-panel-heading">Selection</p>
        <p className="side-panel-title">{selectedLayer ? selectedLayer.name : 'No selection'}</p>
        {selectedLayer ? (
          <p className="side-panel-meta">
            {selectedLayer.mediaType === 'model3d' ? '3D model' : 'Image layer'}
          </p>
        ) : (
          <p className="side-panel-meta">Click any utility on the canvas to edit.</p>
        )}
      </div>

      {selectedLayer ? (
        <div className="side-panel-section">
          <p className="side-panel-heading">Transform</p>
          <NumberPair label="X" value={selectedLayer.x} onChange={(x) => onTransformChange({ x })} />
          <NumberPair label="Y" value={selectedLayer.y} onChange={(y) => onTransformChange({ y })} />
          <NumberPair label="W" value={selectedLayer.width} min={8} onChange={(width) => onTransformChange({ width })} />
          <NumberPair label="H" value={selectedLayer.height} min={8} onChange={(height) => onTransformChange({ height })} />
        </div>
      ) : null}

      {model ? (
        <div className="side-panel-section">
          <p className="side-panel-heading">Rotation (deg)</p>
          <SliderInput label="X" min={-360} max={360} value={model.rotationX} onChange={(rotationX) => onModelChange({ rotationX })} />
          <SliderInput label="Y" min={-360} max={360} value={model.rotationY} onChange={(rotationY) => onModelChange({ rotationY })} />
          <SliderInput label="Z" min={-360} max={360} value={model.rotationZ} onChange={(rotationZ) => onModelChange({ rotationZ })} />
          <p className="side-panel-heading" style={{ marginTop: 8 }}>Zoom</p>
          <SliderInput label="×" min={0.1} max={5} step={0.05} value={model.zoom} onChange={(zoom) => onModelChange({ zoom })} />
        </div>
      ) : null}

      {selectedLayer ? (
        <div className="side-panel-section">
          <p className="side-panel-heading">Actions</p>
          <button className="tool-button" onClick={onDuplicate}>Duplicate</button>
          <button className="tool-button" disabled={selectedLayer.mediaType === 'model3d'} onClick={onResetPerspective}>Reset perspective</button>
          <button className="tool-button danger" onClick={onDelete}>Delete</button>
          <button className="tool-button" onClick={onUndo}>Undo</button>
        </div>
      ) : (
        <div className="side-panel-section">
          <p className="side-panel-heading">History</p>
          <button className="tool-button" onClick={onUndo}>Undo</button>
        </div>
      )}

      <div className="side-panel-section">
        <p className="side-panel-heading">Perspective key</p>
        <div className="segmented" role="radiogroup" aria-label="Perspective modifier key">
          {(['ctrl', 'shift', 'alt'] as ModifierKey[]).map((key) => (
            <button
              key={key}
              role="radio"
              aria-checked={perspectiveKey === key}
              className={perspectiveKey === key ? 'is-on' : ''}
              onClick={() => onPerspectiveKeyChange(key)}
            >
              {modifierLabel(key)}
            </button>
          ))}
        </div>
        <p className="side-panel-meta">Hold while dragging a corner to warp the image.</p>
      </div>

      <div className="side-panel-section shortcut-hints">
        <p className="side-panel-heading">Shortcuts</p>
        <p>Drag to move · <kbd>X</kbd>/<kbd>Y</kbd> lock axis · <kbd>Esc</kbd> cancel drag</p>
        <p>Wheel over selection to scale · <kbd>{modifierLabel(perspectiveKey)}</kbd>+drag corner = perspective</p>
        <p>Arrows to nudge · <kbd>Shift</kbd>+arrows for 10px · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</p>
      </div>
    </aside>
  )
}

function NumberPair({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="numeric-row">
      <label>{label}</label>
      <span />
      <input
        type="number"
        step={1}
        min={min}
        value={Number.isFinite(value) ? Math.round(value) : 0}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const next = Number(event.target.value)
          if (!Number.isNaN(next)) {
            onChange(next)
          }
        }}
      />
    </div>
  )
}

function SliderInput({
  label,
  max,
  min,
  step = 1,
  value,
  onChange,
}: {
  label: string
  max: number
  min: number
  step?: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="numeric-row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const next = Number(event.target.value)
          if (!Number.isNaN(next)) {
            onChange(next)
          }
        }}
      />
    </div>
  )
}

function CanvasLayer({
  frame,
  layer,
  perspectiveKey,
  perspectiveDown,
  axisLock,
  selected,
  onSelect,
  onCommitStart,
  onApply,
  onAxisLockChange,
}: {
  frame: ImageFrame
  layer: Layer
  perspectiveKey: ModifierKey
  perspectiveDown: boolean
  axisLock: 'x' | 'y' | null
  selected: boolean
  onSelect: () => void
  onCommitStart: () => void
  onApply: (id: string, updater: (layer: Layer) => Layer) => void
  onAxisLockChange: (lock: 'x' | 'y' | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const quad = getQuad(layer)
  const isModel = layer.mediaType === 'model3d'
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
      if (!canvas) return

      canvas.width = Math.max(1, Math.round(frame.width))
      canvas.height = Math.max(1, Math.round(frame.height))
      canvas.style.width = `${frame.width}px`
      canvas.style.height = `${frame.height}px`

      const context = canvas.getContext('2d')
      if (!context) return

      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!isWarped(layer) || isModel) return

      const image = await loadImage(layer.src)
      if (!cancelled) {
        await drawImageInQuad(context, image, screenQuad, 8)
      }
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [frame.height, frame.width, isModel, layer.quad, layer.src, screenQuad.bl.x, screenQuad.bl.y, screenQuad.br.x, screenQuad.br.y, screenQuad.tl.x, screenQuad.tl.y, screenQuad.tr.x, screenQuad.tr.y])

  function startPointer(event: ReactPointerEvent, requestedMode: DragMode) {
    event.preventDefault()
    event.stopPropagation()
    onSelect()
    onCommitStart()

    const perspectiveActive = !isModel && isModifierActive(event, perspectiveKey)
    const mode = requestedMode === 'corner' && perspectiveActive ? 'br' : requestedMode
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startLayer = cloneLayer(layer)
    const startQuad = cloneQuad(getQuad(layer))
    let lockAxis: 'x' | 'y' | null = null
    let cancelled = false

    function applyDrag(clientX: number, clientY: number) {
      const rawDelta = {
        x: (clientX - startClientX) / frame.scale,
        y: (clientY - startClientY) / frame.scale,
      }

      const delta = mode === 'move' ? applyAxisLock(rawDelta, lockAxis) : rawDelta

      onApply(layer.id, () => {
        if (mode === 'move') {
          return moveLayerBy(startLayer, delta)
        }

        if (mode === 'right' || mode === 'bottom' || mode === 'corner') {
          return resizeRectLayer(startLayer, delta, mode)
        }

        if (!perspectiveActive) {
          return startLayer
        }

        const nextQuad = {
          ...startQuad,
          [mode]: addPoint(startQuad[mode], delta),
        }
        return { ...startLayer, ...layerFromQuad(nextQuad) }
      })
    }

    function pointerMove(moveEvent: PointerEvent) {
      if (cancelled) return
      applyDrag(moveEvent.clientX, moveEvent.clientY)
    }

    function pointerUp() {
      teardown()
    }

    function keyDown(keyEvent: KeyboardEvent) {
      if (mode !== 'move') return
      const key = keyEvent.key.toLowerCase()
      if (key === 'x') {
        keyEvent.preventDefault()
        lockAxis = lockAxis === 'x' ? null : 'x'
        onAxisLockChange(lockAxis)
        applyDrag(lastClient.x, lastClient.y)
      } else if (key === 'y') {
        keyEvent.preventDefault()
        lockAxis = lockAxis === 'y' ? null : 'y'
        onAxisLockChange(lockAxis)
        applyDrag(lastClient.x, lastClient.y)
      } else if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault()
        cancelled = true
        onApply(layer.id, () => startLayer)
        teardown()
      }
    }

    function teardown() {
      window.removeEventListener('pointermove', trackedMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('keydown', keyDown)
      onAxisLockChange(null)
    }

    const lastClient = { x: startClientX, y: startClientY }
    function trackedMove(moveEvent: PointerEvent) {
      lastClient.x = moveEvent.clientX
      lastClient.y = moveEvent.clientY
      pointerMove(moveEvent)
    }

    window.addEventListener('pointermove', trackedMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('keydown', keyDown)
  }

  const showAxisX = selected && axisLock === 'x'
  const showAxisY = selected && axisLock === 'y'

  return (
    <div className={`canvas-layer-shell ${selected ? 'is-selected' : ''} ${axisLock ? 'is-locking' : ''}`}>
      {isWarped(layer) && !isModel ? (
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
          {isModel ? (
            <ModelLayerCanvas layer={layer} width={screenRect.width} height={screenRect.height} />
          ) : (
            <img className="h-full w-full select-none object-fill" src={layer.src} alt={layer.name} draggable={false} />
          )}
        </button>
      )}
      {selected ? (
        <>
          <button
            className="rect-handle rect-right"
            style={{ left: screenRect.left + screenRect.width - 4, top: screenRect.top + screenRect.height / 2 - 12 }}
            onPointerDown={(event) => startPointer(event, 'right')}
            aria-label="Resize width"
          />
          <button
            className="rect-handle rect-bottom"
            style={{ left: screenRect.left + screenRect.width / 2 - 12, top: screenRect.top + screenRect.height - 4 }}
            onPointerDown={(event) => startPointer(event, 'bottom')}
            aria-label="Resize height"
          />
          <button
            className="rect-handle rect-corner"
            style={{ left: screenRect.left + screenRect.width - 6, top: screenRect.top + screenRect.height - 6 }}
            onPointerDown={(event) => startPointer(event, 'corner')}
            aria-label="Resize or perspective corner"
          />
          {!isModel && (perspectiveDown || isWarped(layer))
            ? (Object.keys(screenQuad) as Corner[]).map((corner) => (
                <button
                  className={`quad-corner quad-corner-${corner}`}
                  key={corner}
                  onPointerDown={(event) => startPointer(event, corner)}
                  style={{ left: screenQuad[corner].x, top: screenQuad[corner].y }}
                  aria-label={`Move ${corner} corner`}
                />
              ))
            : null}
          {showAxisX ? (
            <span className="axis-guide is-x" style={{ top: screenRect.top + screenRect.height / 2 }} />
          ) : null}
          {showAxisY ? (
            <span className="axis-guide is-y" style={{ left: screenRect.left + screenRect.width / 2 }} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ModelLayerCanvas({ layer, width, height }: { layer: Layer; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function draw() {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      try {
        await renderModelToCanvas({
          canvas,
          src: layer.src,
          settings: { ...DEFAULT_MODEL_SETTINGS, ...layer.model },
        })
      } catch {
        if (!cancelled) {
          const context = canvas.getContext('2d')
          context?.clearRect(0, 0, canvas.width, canvas.height)
        }
      }
    }

    void draw()
    return () => {
      cancelled = true
    }
  }, [height, layer.model, layer.src, width])

  return <canvas className="model-layer-canvas" ref={canvasRef} aria-label={layer.name} />
}

function applyAxisLock(delta: Point, lock: 'x' | 'y' | null) {
  if (lock === 'x') return { x: delta.x, y: 0 }
  if (lock === 'y') return { x: 0, y: delta.y }
  return delta
}

function normalizeLayer(layer: Layer): Layer {
  const mediaType = layer.mediaType ?? (isObjAsset(layer.name, layer.src) ? 'model3d' : 'image')
  const normalizedLayer = mediaType === 'model3d'
    ? { ...layer, mediaType, model: { ...DEFAULT_MODEL_SETTINGS, ...layer.model }, quad: undefined }
    : { ...layer, mediaType }

  if (!normalizedLayer.quad) {
    return normalizedLayer
  }

  return { ...normalizedLayer, ...layerFromQuad(normalizedLayer.quad) }
}

function resizeRectLayer(layer: Layer, delta: Point, mode: DragMode): Layer {
  if (layer.quad) {
    return resizeWarpedLayer(layer, delta, mode)
  }

  const width = mode === 'right' || mode === 'corner'
    ? Math.max(8, layer.width + delta.x)
    : layer.width
  const height = mode === 'bottom' || mode === 'corner'
    ? Math.max(8, layer.height + delta.y)
    : layer.height

  return { ...layer, width, height, quad: undefined }
}

function resizeWarpedLayer(layer: Layer, delta: Point, mode: DragMode): Layer {
  const quad = getQuad(layer)
  const bounds = quadBounds(quad)
  const nextWidth = mode === 'right' || mode === 'corner'
    ? Math.max(8, bounds.width + delta.x)
    : bounds.width
  const nextHeight = mode === 'bottom' || mode === 'corner'
    ? Math.max(8, bounds.height + delta.y)
    : bounds.height
  const scaleX = bounds.width === 0 ? 1 : nextWidth / bounds.width
  const scaleY = bounds.height === 0 ? 1 : nextHeight / bounds.height
  const nextQuad = scaleQuadFromOrigin(quad, { x: bounds.left, y: bounds.top }, scaleX, scaleY)

  return { ...layer, ...layerFromQuad(nextQuad) }
}

function moveLayerBy(layer: Layer, delta: Point): Layer {
  if (layer.quad) {
    const quad = moveQuad(layer.quad, delta)
    return { ...layer, ...layerFromQuad(quad) }
  }

  return {
    ...layer,
    x: layer.x + delta.x,
    y: layer.y + delta.y,
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
  if (!layer.quad) return false
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

function scaleQuadAround(quad: Quad, center: Point, factor: number): Quad {
  return {
    tl: { x: center.x + (quad.tl.x - center.x) * factor, y: center.y + (quad.tl.y - center.y) * factor },
    tr: { x: center.x + (quad.tr.x - center.x) * factor, y: center.y + (quad.tr.y - center.y) * factor },
    br: { x: center.x + (quad.br.x - center.x) * factor, y: center.y + (quad.br.y - center.y) * factor },
    bl: { x: center.x + (quad.bl.x - center.x) * factor, y: center.y + (quad.bl.y - center.y) * factor },
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

function moveQuad(quad: Quad, delta: Point): Quad {
  return {
    tl: addPoint(quad.tl, delta),
    tr: addPoint(quad.tr, delta),
    br: addPoint(quad.br, delta),
    bl: addPoint(quad.bl, delta),
  }
}

function addPoint(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y }
}

function quadBounds(quad: Quad) {
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x]
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y]
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)

  return { left, top, width: right - left, height: bottom - top }
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
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount }
}

function drawTexturedTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
) {
  const expandedDestination = expandTriangle(destination, 0.85)
  const transform = triangleTransform(source, expandedDestination)
  if (!transform) return

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
    (modifierKey === 'ctrl' && (event.ctrlKey || event.metaKey)) ||
    (modifierKey === 'shift' && event.shiftKey) ||
    (modifierKey === 'alt' && event.altKey)
  )
}

function readModifierBind(): ModifierKey {
  const value = localStorage.getItem(PERSPECTIVE_BIND_KEY)
  return value === 'shift' || value === 'alt' || value === 'ctrl' ? value : 'ctrl'
}

function modifierLabel(key: ModifierKey) {
  return key === 'ctrl' ? 'Ctrl' : key === 'shift' ? 'Shift' : 'Alt'
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
