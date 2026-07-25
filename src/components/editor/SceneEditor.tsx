import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import {
  Copy,
  Download,
  Magnet,
  Move3d,
  Rotate3d,
  Scale3d,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  GEOMETRY_ARGS,
  PRIMITIVE_KINDS,
  SPAWN_HEIGHT,
  fmt,
  toJsx,
  toSceneJson,
} from '../../lib/scene'
import type { Group, Mesh } from 'three'
import type { PrimitiveKind, SceneObject, Vec3 } from '../../lib/scene'

type TransformMode = 'translate' | 'rotate' | 'scale'

const STORAGE_KEY = 'jasi-setpiece-scene-v1'

const SPAWN_COLORS = [
  '#ff6a3d',
  '#ffc15e',
  '#7ec8a9',
  '#5aa7d6',
  '#c98bde',
  '#e2ded1',
]

function loadScene(): Array<SceneObject> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Deterministic golden-angle spiral so new objects never stack. */
function spawnPosition(index: number, y: number): Vec3 {
  if (index === 0) return [0, y, 0]
  const angle = index * 2.4
  const radius = 1.1 + 0.4 * Math.sqrt(index)
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius]
}

function PrimitiveGeometry({ kind }: { kind: PrimitiveKind }) {
  switch (kind) {
    case 'box':
      return <boxGeometry args={[...GEOMETRY_ARGS.box]} />
    case 'sphere':
      return <sphereGeometry args={[...GEOMETRY_ARGS.sphere]} />
    case 'cylinder':
      return <cylinderGeometry args={[...GEOMETRY_ARGS.cylinder]} />
    case 'cone':
      return <coneGeometry args={[...GEOMETRY_ARGS.cone]} />
    case 'torus':
      return <torusGeometry args={[...GEOMETRY_ARGS.torus]} />
  }
}

function ModelContent({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      if ((node as Mesh).isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    return copy
  }, [scene])
  return <primitive object={cloned} />
}

function ModelPlaceholder() {
  return (
    <mesh position={[0, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial wireframe color="#ff6a3d" />
    </mesh>
  )
}

function SceneNode({
  obj,
  url,
  selected,
  onSelect,
  registerRef,
}: {
  obj: SceneObject
  url?: string
  selected: boolean
  onSelect: (id: string) => void
  registerRef: (id: string, node: Group | null) => void
}) {
  return (
    <group
      ref={(node) => registerRef(obj.id, node)}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(obj.id)
      }}
    >
      {obj.kind === 'model' ? (
        url ? (
          <Suspense fallback={<ModelPlaceholder />}>
            <ModelContent url={url} />
          </Suspense>
        ) : (
          <ModelPlaceholder />
        )
      ) : (
        <mesh castShadow receiveShadow>
          <PrimitiveGeometry kind={obj.kind} />
          <meshStandardMaterial
            color={obj.color}
            roughness={0.5}
            metalness={0.05}
            emissive={selected ? obj.color : '#000000'}
            emissiveIntensity={selected ? 0.3 : 0}
          />
        </mesh>
      )}
    </group>
  )
}

function AxisRow({
  label,
  values,
  step,
  onChange,
}: {
  label: string
  values: Vec3
  step: number
  onChange: (axis: 0 | 1 | 2, value: number) => void
}) {
  return (
    <div className="grid grid-cols-[2.4rem_1fr_1fr_1fr] items-center gap-1.5">
      <span className="text-[0.62rem] font-semibold tracking-[0.14em] uppercase text-[var(--dim)]">
        {label}
      </span>
      {([0, 1, 2] as const).map((axis) => (
        <input
          key={axis}
          type="number"
          step={step}
          value={Number(fmt(values[axis]))}
          onChange={(e) => {
            const next = parseFloat(e.target.value)
            if (!Number.isNaN(next)) onChange(axis, next)
          }}
          className="field-input"
          aria-label={`${label} ${'xyz'[axis]}`}
        />
      ))}
    </div>
  )
}

const KIND_GLYPH: Record<string, string> = {
  box: 'B',
  sphere: 'S',
  cylinder: 'C',
  cone: 'K',
  torus: 'T',
  model: 'M',
}

export default function SceneEditor() {
  const [objects, setObjects] = useState<Array<SceneObject>>(loadScene)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<Group | null>(null)
  const [mode, setMode] = useState<TransformMode>('translate')
  const [snap, setSnap] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportTab, setExportTab] = useState<'jsx' | 'json'>('jsx')
  const [copied, setCopied] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [modelUrls, setModelUrls] = useState<Record<string, string>>({})

  const refs = useRef(new Map<string, Group>())
  const selectedIdRef = useRef<string | null>(null)
  const spawnCounter = useRef(objects.length)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Autosave
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(objects))
      } catch {
        // storage full/unavailable — arranging still works, persistence doesn't
      }
    }, 250)
    return () => clearTimeout(t)
  }, [objects])

  const registerRef = useCallback((id: string, node: Group | null) => {
    if (node) refs.current.set(id, node)
    else refs.current.delete(id)
    if (selectedIdRef.current === id) setSelectedNode(node)
  }, [])

  const select = useCallback((id: string | null) => {
    selectedIdRef.current = id
    setSelectedId(id)
    setSelectedNode(id ? (refs.current.get(id) ?? null) : null)
  }, [])

  const updateObject = useCallback(
    (id: string, patch: Partial<SceneObject>) => {
      setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    },
    [],
  )

  const addPrimitive = useCallback(
    (kind: PrimitiveKind) => {
      const n = spawnCounter.current++
      const obj: SceneObject = {
        id: crypto.randomUUID(),
        name: `${kind} ${n + 1}`,
        kind,
        color: SPAWN_COLORS[n % SPAWN_COLORS.length],
        position: spawnPosition(n, SPAWN_HEIGHT[kind]),
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      }
      setObjects((prev) => [...prev, obj])
      select(obj.id)
    },
    [select],
  )

  const removeObject = useCallback(
    (id: string) => {
      setObjects((prev) => prev.filter((o) => o.id !== id))
      if (selectedIdRef.current === id) select(null)
    },
    [select],
  )

  const duplicateObject = useCallback(
    (id: string) => {
      setObjects((prev) => {
        const source = prev.find((o) => o.id === id)
        if (!source) return prev
        const copy: SceneObject = {
          ...source,
          id: crypto.randomUUID(),
          name: `${source.name} copy`,
          position: [
            source.position[0] + 0.75,
            source.position[1],
            source.position[2] + 0.75,
          ],
        }
        select(copy.id)
        return [...prev, copy]
      })
    },
    [select],
  )

  const importFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      const models = Array.from(files).filter((f) => /\.(glb|gltf)$/i.test(f.name))
      if (models.length === 0) return
      setModelUrls((prev) => {
        const next = { ...prev }
        for (const file of models) {
          if (next[file.name]) URL.revokeObjectURL(next[file.name])
          next[file.name] = URL.createObjectURL(file)
        }
        return next
      })
      setObjects((prev) => {
        const additions = models
          .filter((file) => !prev.some((o) => o.fileName === file.name))
          .map((file, i): SceneObject => {
            const n = spawnCounter.current++
            return {
              id: crypto.randomUUID(),
              name: file.name.replace(/\.(glb|gltf)$/i, ''),
              kind: 'model',
              fileName: file.name,
              color: '#ffffff',
              position: spawnPosition(n + i, 0),
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            }
          })
        return additions.length ? [...prev, ...additions] : prev
      })
    },
    [],
  )

  const commitTransform = useCallback(() => {
    const id = selectedIdRef.current
    const node = id ? refs.current.get(id) : null
    if (!id || !node) return
    updateObject(id, {
      position: node.position.toArray() as Vec3,
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
      scale: node.scale.toArray() as Vec3,
    })
  }, [updateObject])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') {
        if (exportOpen) setExportOpen(false)
        else select(null)
        return
      }
      switch (e.key.toLowerCase()) {
        case 'g':
        case 'w':
          setMode('translate')
          break
        case 'r':
          setMode('rotate')
          break
        case 's':
          setMode('scale')
          break
        case 'x':
          setSnap((v) => !v)
          break
        case 'd':
          if (selectedIdRef.current) {
            e.preventDefault()
            duplicateObject(selectedIdRef.current)
          }
          break
        case 'delete':
        case 'backspace':
          if (selectedIdRef.current) removeObject(selectedIdRef.current)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duplicateObject, exportOpen, removeObject, select])

  const selected = objects.find((o) => o.id === selectedId) ?? null
  const missingModels = objects.filter(
    (o) => o.kind === 'model' && o.fileName && !modelUrls[o.fileName],
  )

  const exportCode = exportTab === 'jsx' ? toJsx(objects) : toSceneJson(objects)

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard blocked — user can still select the text manually
    }
  }

  const downloadExport = () => {
    const blob = new Blob([exportCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportTab === 'jsx' ? 'ArrangedScene.tsx' : 'scene.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="editor-root fixed inset-0 overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        importFiles(e.dataTransfer.files)
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [7, 5.5, 9], fov: 38 }}
        onPointerDown={(e) => {
          pointerDown.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerMissed={(e) => {
          const down = pointerDown.current
          const moved =
            down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
          if (!moved) select(null)
        }}
      >
        <color attach="background" args={['#0b0d10']} />
        <fog attach="fog" args={['#0b0d10', 28, 60]} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#cfd8dc', '#20242a', 0.35]} />
        <directionalLight
          castShadow
          position={[6, 10, 4]}
          intensity={1.5}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
        />
        <directionalLight position={[-6, 4, -6]} intensity={0.35} />

        <Grid
          position={[0, 0.001, 0]}
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          cellColor="#1c2127"
          sectionColor="#2d353e"
          fadeDistance={42}
          fadeStrength={1.4}
        />
        <mesh receiveShadow rotation-x={-Math.PI / 2}>
          <planeGeometry args={[120, 120]} />
          <shadowMaterial opacity={0.4} />
        </mesh>

        {objects.map((o) => (
          <SceneNode
            key={o.id}
            obj={o}
            url={o.kind === 'model' && o.fileName ? modelUrls[o.fileName] : undefined}
            selected={o.id === selectedId}
            onSelect={select}
            registerRef={registerRef}
          />
        ))}

        {selectedNode && (
          <TransformControls
            object={selectedNode}
            mode={mode}
            translationSnap={snap ? 0.25 : null}
            rotationSnap={snap ? Math.PI / 12 : null}
            scaleSnap={snap ? 0.1 : null}
            onMouseUp={commitTransform}
          />
        )}

        <OrbitControls
          makeDefault
          target={[0, 0.6, 0]}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={2}
          maxDistance={55}
        />
      </Canvas>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3">
        <div className="panel pointer-events-auto flex items-center gap-3 px-4 py-2.5">
          <span className="wordmark">SETPIECE</span>
          <span className="hidden text-[0.62rem] tracking-[0.18em] uppercase text-[var(--dim)] sm:inline">
            arrange · export
          </span>
        </div>

        <div className="panel pointer-events-auto flex items-center gap-1 p-1">
          {(
            [
              ['translate', Move3d, 'Move (G)'],
              ['rotate', Rotate3d, 'Rotate (R)'],
              ['scale', Scale3d, 'Scale (S)'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => setMode(value)}
              className={`seg-btn ${mode === value ? 'seg-btn-active' : ''}`}
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="hidden md:inline">{label.split(' ')[0]}</span>
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-[var(--line)]" />
          <button
            type="button"
            title="Snap to grid (X)"
            onClick={() => setSnap((v) => !v)}
            className={`seg-btn ${snap ? 'seg-btn-active' : ''}`}
          >
            <Magnet size={15} strokeWidth={1.75} />
            <span className="hidden md:inline">Snap</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="btn-ember pointer-events-auto"
          disabled={objects.length === 0}
        >
          <Download size={15} strokeWidth={2} />
          Export
        </button>
      </header>

      {/* ── Add palette ─────────────────────────────────────── */}
      <aside className="panel absolute top-1/2 left-3 flex w-[7.5rem] -translate-y-1/2 flex-col gap-1 p-2">
        <p className="px-1.5 pt-0.5 pb-1 text-[0.6rem] font-semibold tracking-[0.2em] uppercase text-[var(--dim)]">
          Add
        </p>
        {PRIMITIVE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => addPrimitive(kind)}
            className="add-btn"
          >
            <span className={`shape shape-${kind}`} aria-hidden />
            {kind}
          </button>
        ))}
        <div className="mx-1 my-1 h-px bg-[var(--line)]" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="add-btn"
        >
          <Upload size={13} strokeWidth={1.75} className="text-[var(--ember)]" />
          model
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".glb,.gltf"
          multiple
          hidden
          onChange={(e) => {
            importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="px-1.5 pt-1 text-[0.6rem] leading-relaxed text-[var(--dim)]">
          or drop .glb anywhere
        </p>
      </aside>

      {/* ── Objects & inspector ─────────────────────────────── */}
      <aside className="panel absolute top-16 right-3 bottom-12 flex w-64 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2.5">
          <p className="text-[0.62rem] font-semibold tracking-[0.2em] uppercase text-[var(--dim)]">
            Objects <span className="text-[var(--ember)]">{objects.length}</span>
          </p>
          {objects.length > 0 && (
            <button
              type="button"
              className="icon-btn"
              title="Clear scene"
              onClick={() => {
                if (window.confirm('Remove every object from the scene?')) {
                  setObjects([])
                  select(null)
                }
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {objects.length === 0 && (
            <p className="px-2 py-3 text-xs leading-relaxed text-[var(--dim)]">
              Empty stage. Add a primitive or drop a .glb model to begin
              arranging.
            </p>
          )}
          {objects.map((o) => (
            <div
              key={o.id}
              className={`obj-row ${o.id === selectedId ? 'obj-row-active' : ''}`}
              onClick={() => select(o.id)}
            >
              <span
                className="glyph"
                style={
                  o.kind === 'model'
                    ? undefined
                    : { color: o.color, borderColor: o.color }
                }
              >
                {KIND_GLYPH[o.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">{o.name}</span>
              <button
                type="button"
                className="icon-btn opacity-0 group-hover:opacity-100"
                title="Duplicate (D)"
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateObject(o.id)
                }}
              >
                <Copy size={12} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn opacity-0 group-hover:opacity-100"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  removeObject(o.id)
                }}
              >
                <X size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>

        {selected && (
          <div className="space-y-2 border-t border-[var(--line)] p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={selected.name}
                onChange={(e) => updateObject(selected.id, { name: e.target.value })}
                className="field-input flex-1 !text-left"
                aria-label="Object name"
              />
              {selected.kind !== 'model' && (
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) =>
                    updateObject(selected.id, { color: e.target.value })
                  }
                  className="h-7 w-8 cursor-pointer rounded border border-[var(--line)] bg-transparent p-0.5"
                  aria-label="Object color"
                />
              )}
            </div>
            <AxisRow
              label="pos"
              values={selected.position}
              step={0.1}
              onChange={(axis, v) => {
                const next = [...selected.position] as Vec3
                next[axis] = v
                updateObject(selected.id, { position: next })
              }}
            />
            <AxisRow
              label="rot°"
              values={
                selected.rotation.map((r) => (r * 180) / Math.PI) as Vec3
              }
              step={5}
              onChange={(axis, v) => {
                const next = [...selected.rotation] as Vec3
                next[axis] = (v * Math.PI) / 180
                updateObject(selected.id, { rotation: next })
              }}
            />
            <AxisRow
              label="scl"
              values={selected.scale}
              step={0.1}
              onChange={(axis, v) => {
                const next = [...selected.scale] as Vec3
                next[axis] = v
                updateObject(selected.id, { scale: next })
              }}
            />
          </div>
        )}
      </aside>

      {/* ── Hints / warnings ────────────────────────────────── */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
        <p className="panel px-3 py-1.5 text-[0.62rem] tracking-wide text-[var(--dim)]">
          G move · R rotate · S scale · X snap · D duplicate · ⌫ delete · esc
          deselect
        </p>
        {missingModels.length > 0 && (
          <p className="panel pointer-events-auto border-[rgba(255,106,61,0.4)] px-3 py-1.5 text-[0.62rem] text-[var(--ember)]">
            {missingModels.length} saved model
            {missingModels.length > 1 ? 's need' : ' needs'} re-linking — drop{' '}
            {missingModels.map((m) => m.fileName).join(', ')} back in
          </p>
        )}
      </footer>

      {/* ── Drop overlay ────────────────────────────────────── */}
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ember)] bg-[rgba(11,13,16,0.7)]">
          <p className="wordmark text-lg">DROP .GLB TO STAGE IT</p>
        </div>
      )}

      {/* ── Export modal ────────────────────────────────────── */}
      {exportOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(5,6,8,0.72)] p-4 backdrop-blur-[3px]"
          onClick={() => setExportOpen(false)}
        >
          <div
            className="panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-1">
                {(['jsx', 'json'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setExportTab(tab)}
                    className={`seg-btn ${exportTab === tab ? 'seg-btn-active' : ''}`}
                  >
                    {tab === 'jsx' ? 'R3F JSX' : 'JSON'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={copyExport} className="seg-btn">
                  <Copy size={13} strokeWidth={1.75} />
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" onClick={downloadExport} className="seg-btn">
                  <Download size={13} strokeWidth={1.75} />
                  Download
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setExportOpen(false)}
                  title="Close (esc)"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
            {objects.some((o) => o.kind === 'model') && (
              <p className="border-b border-[var(--line)] bg-[var(--ember-soft)] px-4 py-2 text-[0.68rem] leading-relaxed text-[var(--ember)]">
                Model files aren't embedded — copy your .glb files into{' '}
                <code className="font-semibold">public/models/</code> so the
                exported src paths resolve.
              </p>
            )}
            <pre className="code-block min-h-0 flex-1 overflow-auto p-4 text-[0.72rem] leading-relaxed">
              <code>{exportCode}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
