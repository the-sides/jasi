import { describe, expect, it } from 'vitest'
import { fmt, toJsx, toSceneJson } from './scene'
import type { SceneObject } from './scene'

const box: SceneObject = {
  id: '1',
  name: 'box 1',
  kind: 'box',
  color: '#ff6a3d',
  position: [1.23456, 0.5, -2],
  rotation: [0, Math.PI / 4, 0],
  scale: [1, 1, 1],
}

const model: SceneObject = {
  id: '2',
  name: 'chair',
  kind: 'model',
  fileName: 'chair.glb',
  color: '#ffffff',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [2, 2, 2],
}

describe('fmt', () => {
  it('rounds to 3 decimals and strips trailing zeros', () => {
    expect(fmt(1.23456)).toBe('1.235')
    expect(fmt(1.5)).toBe('1.5')
    expect(fmt(-0.0001)).toBe('0')
  })
})

describe('toSceneJson', () => {
  it('serializes objects with rounded transforms', () => {
    const parsed = JSON.parse(toSceneJson([box, model]))
    expect(parsed.version).toBe(1)
    expect(parsed.objects).toHaveLength(2)
    expect(parsed.objects[0]).toMatchObject({
      name: 'box 1',
      kind: 'box',
      color: '#ff6a3d',
      position: [1.235, 0.5, -2],
    })
    expect(parsed.objects[1]).toMatchObject({ kind: 'model', file: 'chair.glb' })
    expect(parsed.objects[1].color).toBeUndefined()
  })
})

describe('toJsx', () => {
  it('emits mesh JSX for primitives and omits identity transforms', () => {
    const jsx = toJsx([box])
    expect(jsx).toContain('<mesh position={[1.235, 0.5, -2]} rotation={[0, 0.785, 0]}')
    expect(jsx).not.toContain('scale=')
    expect(jsx).toContain('<boxGeometry args={[1, 1, 1]} />')
    expect(jsx).toContain('color="#ff6a3d"')
    expect(jsx).not.toContain('Gltf')
  })

  it('emits Gltf tags and the drei import when models are present', () => {
    const jsx = toJsx([model])
    expect(jsx).toContain("import { Gltf } from '@react-three/drei'")
    expect(jsx).toContain('<Gltf src="/models/chair.glb" position={[0, 0, 0]} scale={[2, 2, 2]} />')
  })
})
