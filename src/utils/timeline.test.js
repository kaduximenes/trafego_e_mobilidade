// Testes da geometria da linha do tempo: matemática pura, sem DOM.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { instantAtPosition, nearestFrameIndex, positionOf } from './timeline.js'

const bounds = { first: '2026-08-01T10:00:00.000Z', last: '2026-08-01T12:00:00.000Z' }

describe('positionOf', () => {
  it('posiciona instantes dentro da janela', () => {
    assert.equal(positionOf('2026-08-01T10:00:00.000Z', bounds), 0)
    assert.equal(positionOf('2026-08-01T11:00:00.000Z', bounds), 0.5)
    assert.equal(positionOf('2026-08-01T12:00:00.000Z', bounds), 1)
  })

  it('prende instantes fora da janela nos limites', () => {
    assert.equal(positionOf('2026-08-01T09:00:00.000Z', bounds), 0)
    assert.equal(positionOf('2026-08-01T13:00:00.000Z', bounds), 1)
  })

  it('devolve 0 com janela ou instante ausente/inválido', () => {
    assert.equal(positionOf(null, bounds), 0)
    assert.equal(positionOf('2026-08-01T11:00:00.000Z', null), 0)
    assert.equal(positionOf('nao-e-data', bounds), 0)
    assert.equal(positionOf('2026-08-01T11:00:00.000Z', { first: 'x', last: 'y' }), 0)
  })

  it('posiciona no fim quando há um único frame (janela de largura zero)', () => {
    const single = { first: '2026-08-01T10:00:00.000Z', last: '2026-08-01T10:00:00.000Z' }
    assert.equal(positionOf('2026-08-01T10:00:00.000Z', single), 1)
    assert.equal(instantAtPosition(0.5, single), '2026-08-01T10:00:00.000Z')
  })
})

describe('instantAtPosition', () => {
  it('converte posição em instante', () => {
    assert.equal(instantAtPosition(0, bounds), '2026-08-01T10:00:00.000Z')
    assert.equal(instantAtPosition(1, bounds), '2026-08-01T12:00:00.000Z')
    assert.equal(instantAtPosition(0.25, bounds), '2026-08-01T10:30:00.000Z')
  })

  it('prende valores fora de 0..1 ao intervalo', () => {
    assert.equal(instantAtPosition(5, bounds), '2026-08-01T12:00:00.000Z')
    assert.equal(instantAtPosition(-1, bounds), '2026-08-01T10:00:00.000Z')
  })

  it('devolve null sem janela', () => {
    assert.equal(instantAtPosition(0.5, null), null)
    assert.equal(instantAtPosition(0.5, { first: 'x', last: 'y' }), null)
  })

  it('faz ida e volta sem perder o instante', () => {
    const instants = [
      '2026-08-01T10:00:00.000Z',
      '2026-08-01T10:37:00.000Z',
      '2026-08-01T11:59:59.000Z',
      '2026-08-01T12:00:00.000Z',
    ]

    for (const at of instants) {
      const roundTripped = instantAtPosition(positionOf(at, bounds), bounds)
      assert.equal(new Date(roundTripped).getTime(), new Date(at).getTime(), `perdeu ${at}`)
    }
  })
})

describe('nearestFrameIndex', () => {
  const instants = [
    new Date('2026-08-01T10:00:00.000Z').getTime(),
    new Date('2026-08-01T10:15:00.000Z').getTime(),
    new Date('2026-08-01T10:30:00.000Z').getTime(),
  ]

  it('encontra o frame em ou antes do instante', () => {
    assert.equal(nearestFrameIndex(instants, '2026-08-01T10:20:00.000Z'), 1)
    assert.equal(nearestFrameIndex(instants, '2026-08-01T10:15:00.000Z'), 1)
    assert.equal(nearestFrameIndex(instants, '2026-08-01T10:00:00.000Z'), 0)
    assert.equal(nearestFrameIndex(instants, '2026-08-01T11:00:00.000Z'), 2)
  })

  it('devolve -1 antes do primeiro frame ou sem dados', () => {
    assert.equal(nearestFrameIndex(instants, '2026-08-01T09:00:00.000Z'), -1)
    assert.equal(nearestFrameIndex([], '2026-08-01T10:00:00.000Z'), -1)
    assert.equal(nearestFrameIndex(instants, 'nao-e-data'), -1)
  })
})
