import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [responsiveCss, captureCss, transitionComponent, entryEditor] = await Promise.all([
  readFile(new URL('../app/responsive.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/capture.css', import.meta.url), 'utf8'),
  readFile(new URL('../components/RouteTransitionFeedback.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/EntryEditor.tsx', import.meta.url), 'utf8'),
])

function zIndices(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gu'))]
    .map((match) => match[1].match(/z-index:\s*(\d+)/u)?.[1])
    .filter(Boolean)
    .map(Number)
}

test('route loading feedback covers the sticky composer actions during navigation', () => {
  assert.match(transitionComponent, /className="route-loading"/u)
  assert.match(entryEditor, /className="capture-actions"/u)

  const routeLayer = Math.max(...zIndices(responsiveCss, '.route-loading'))
  const composerLayer = Math.max(...zIndices(captureCss, '.capture-actions'))

  assert.ok(
    routeLayer > composerLayer,
    `route loading layer (${routeLayer}) must be above sticky composer actions (${composerLayer})`,
  )
})
