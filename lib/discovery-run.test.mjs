import assert from 'node:assert/strict'
import test from 'node:test'
import { canStartDiscovery, discoveryStartIndex } from './discovery-run.ts'

test('a stopped run can be restarted; a live one cannot', () => {
  assert.equal(canStartDiscovery(null, 104), true, 'nothing running yet')
  assert.equal(canStartDiscovery({ done: 12, total: 104 }, 104), false, 'already going')

  // The regression: backgrounding Ordly stops the run, and the button has to work again.
  assert.equal(
    canStartDiscovery({ done: 37, total: 104, stopped: 'Paused while Ordly was in the background.' }, 104),
    true,
    'a stopped run is resumable, not a dead end',
  )

  assert.equal(canStartDiscovery(null, 0), false, 'nothing to look through')
})

test('a resume carries on rather than paying for the same entries twice', () => {
  const stopped = { done: 37, total: 104, stopped: 'Lost connection.' }
  assert.equal(discoveryStartIndex(stopped, 37, 104), 37)

  // A fresh run always starts at the beginning, whatever the cursor says.
  assert.equal(discoveryStartIndex(null, 37, 104), 0)
  assert.equal(discoveryStartIndex({ done: 5, total: 104 }, 37, 104), 0)

  // A cursor that no longer fits the vocabulary restarts instead of skipping everything.
  assert.equal(discoveryStartIndex(stopped, 200, 104), 0)
  assert.equal(discoveryStartIndex(stopped, -1, 104), 0)
})
