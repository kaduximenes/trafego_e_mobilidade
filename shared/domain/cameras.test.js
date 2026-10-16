import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { distanceMeters, nearestCamera } from './cameras.js'

describe('câmera mais próxima', () => {
  const cameras = [
    { code: '000001', latitude: -22.900259, longitude: -43.177031 },
    { code: '000002', latitude: -22.95, longitude: -43.2 },
    { code: 'sem-coord', latitude: null, longitude: null },
    { code: 'zerada', latitude: 0, longitude: 0 },
  ]

  it('mede distâncias em metros', () => {
    // 0,001° de latitude ≈ 111 m.
    assert.ok(Math.abs(distanceMeters(-22.9, -43.17, -22.901, -43.17) - 111) < 1)
  })

  it('escolhe a câmera mais perto e ignora as sem coordenada', () => {
    const result = nearestCamera(cameras, -22.9005, -43.177)
    assert.equal(result.camera.code, '000001')
    assert.ok(result.distance < 50)
  })

  it('devolve null sem câmeras ou sem ponto válido', () => {
    assert.equal(nearestCamera([], -22.9, -43.1), null)
    assert.equal(nearestCamera(cameras, undefined, -43.1), null)
  })
})
