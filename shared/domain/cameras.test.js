import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildCameraIndex, camerasWithin, distanceMeters, nearestCamera } from './cameras.js'

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

describe('câmeras dentro de um raio', () => {
  const cameras = [
    { code: 'perto', latitude: -22.9001, longitude: -43.1700 },
    // Do outro lado de uma borda de célula da grade, ainda dentro do raio.
    { code: 'vizinha', latitude: -22.8999, longitude: -43.1702 },
    { code: 'longe', latitude: -22.92, longitude: -43.17 },
    { code: 'sem-coord', latitude: null, longitude: null },
  ]
  const index = buildCameraIndex(cameras)

  it('devolve só as câmeras dentro do raio, da mais próxima à mais distante', () => {
    const result = camerasWithin(index, -22.9, -43.17, 300)
    assert.deepEqual(result.map((item) => item.camera.code), ['perto', 'vizinha'])
    assert.ok(result[0].distance <= result[1].distance)
  })

  it('não devolve nada sem ponto válido', () => {
    assert.deepEqual(camerasWithin(index, undefined, -43.17, 300), [])
  })
})
