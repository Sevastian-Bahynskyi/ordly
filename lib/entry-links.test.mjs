import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EGO_GEOMETRY,
  EGO_NODE_LIMIT,
  egoLayout,
  isSameLink,
  neighboursByEntry,
  neighboursOf,
  truncateLabel,
  withConfirmedLink,
  withoutLink,
} from './entry-links.ts'

const link = (a_id, b_id, extra = {}) => ({
  a_id,
  b_id,
  kind: 'synonym',
  source: 'ai',
  confidence: 0.7,
  confirmed: false,
  ...extra,
})

const labels = (...ids) => new Map(ids.map((id) => [id, { id, danish: `word-${id}`, translation: null }]))

test('an edge is read from whichever end the displayed entry sits on', () => {
  const entries = labels('a', 'b', 'c')
  const links = [link('a', 'b'), link('c', 'a', { confirmed: true })]

  assert.deepEqual(neighboursOf('a', links, entries).map((n) => n.id), ['b', 'c'])
  assert.deepEqual(neighboursOf('b', links, entries).map((n) => n.id), ['a'])
  assert.deepEqual(neighboursOf('c', links, entries).map((n) => n.id), ['a'])
  // uuids are compared case-insensitively, as the canonical pair lowercases them.
  assert.deepEqual(neighboursOf('A', links, entries).map((n) => n.id), ['b', 'c'])
})

test('an edge whose other end is not on this surface is skipped, never drawn unlabelled', () => {
  const entries = labels('a')
  assert.deepEqual(neighboursOf('a', [link('a', 'missing')], entries), [])
  assert.deepEqual(neighboursOf('a', [], entries), [])
  assert.deepEqual(neighboursOf('a', null, entries), [])
  assert.deepEqual(neighboursOf('a', [link('a', 'b')], null), [])
})

test('confirming an edge does not reorder anything', () => {
  const entries = labels('a', 'b', 'c', 'd')
  const before = [link('a', 'b'), link('a', 'c', { confirmed: true }), link('a', 'd')]
  const after = before.map((row) => ({ ...row, confirmed: true, source: 'user' }))

  const order = (links) => neighboursOf('a', links, entries).map((n) => n.id)
  assert.deepEqual(order(before), ['b', 'c', 'd'])
  assert.deepEqual(order(after), order(before), 'layout order must not depend on confirmed')
  // Nor on the order the rows arrive in.
  assert.deepEqual(order([...before].reverse()), order(before))
})

test('kinds sort before names, and only inflection_of carries a direction', () => {
  const entries = labels('a', 'b', 'c', 'd')
  const links = [
    link('a', 'b', { kind: 'related' }),
    link('a', 'c', { kind: 'inflection_of' }),
    link('d', 'a', { kind: 'inflection_of' }),
  ]

  const neighbours = neighboursOf('a', links, entries)
  assert.deepEqual(neighbours.map((n) => n.kind), ['related', 'inflection_of', 'inflection_of'])
  // a_id is the inflected form: with `a` as a_id the neighbour is the base, and vice versa.
  assert.deepEqual(neighbours.map((n) => n.role), [null, 'base', 'inflected'])
})

test('the same pair linked by two kinds stays two chips, one per kind', () => {
  const entries = labels('a', 'b')
  const links = [link('a', 'b', { kind: 'synonym' }), link('a', 'b', { kind: 'related' })]
  assert.deepEqual(neighboursOf('a', links, entries).map((n) => n.kind), ['synonym', 'related'])
  // but a duplicated row is not two chips
  assert.equal(neighboursOf('a', [...links, link('a', 'b')], entries).length, 2)
})

test('the per-entry index fills in both ends of every edge in one pass', () => {
  const entries = labels('a', 'b', 'c')
  const links = [link('a', 'b', { kind: 'inflection_of' }), link('a', 'c'), link('a', 'missing')]
  const index = neighboursByEntry(links, entries)

  assert.deepEqual([...index.keys()].sort(), ['a', 'b', 'c'])
  assert.deepEqual(index.get('a').map((n) => n.id), ['c', 'b'], 'synonym sorts before inflection')
  assert.deepEqual(index.get('b').map((n) => n.id), ['a'])
  // Same answer as the single-entry read, including the direction of the one directional kind.
  for (const id of ['a', 'b', 'c']) {
    assert.deepEqual(index.get(id), neighboursOf(id, links, entries), `index matches neighboursOf for ${id}`)
  }
  assert.equal(neighboursByEntry([], entries).size, 0)
})

test('optimistic dismiss and confirm address exactly one primary-key row', () => {
  const rows = [link('a', 'b'), link('a', 'b', { kind: 'related' }), link('a', 'c')]

  assert.equal(isSameLink(rows[0], { ...rows[0], confidence: 0.1 }), true)
  assert.equal(isSameLink(rows[0], rows[1]), false, 'kind is part of the key')
  assert.equal(isSameLink(rows[0], rows[2]), false)

  assert.deepEqual(withoutLink(rows, rows[0]).map((row) => row.kind), ['related', 'synonym'])

  const confirmed = withConfirmedLink(rows, rows[0])
  assert.deepEqual(confirmed.map((row) => row.confirmed), [true, false, false])
  // Flipping source to 'user' is what makes the edge survive the D17 demotion on a later edit.
  assert.deepEqual(confirmed.map((row) => row.source), ['user', 'ai', 'ai'])
})

test('the ego layout is deterministic, starts at the top, and stays inside the viewBox', () => {
  const entries = labels('a', 'b', 'c', 'd', 'e')
  const links = [link('a', 'b'), link('a', 'c'), link('a', 'd'), link('a', 'e')]
  const nodes = egoLayout(neighboursOf('a', links, entries))

  assert.deepEqual(nodes.map((node) => node.id), ['b', 'c', 'd', 'e'])
  assert.deepEqual(nodes[0], { ...nodes[0], x: EGO_GEOMETRY.cx, y: EGO_GEOMETRY.cy - EGO_GEOMETRY.ry })
  assert.deepEqual(egoLayout(neighboursOf('a', [...links].reverse(), entries)), nodes)

  for (const node of nodes) {
    assert.ok(node.x >= 0 && node.x <= EGO_GEOMETRY.width, `x in view: ${node.x}`)
    assert.ok(node.y >= 0 && node.y <= EGO_GEOMETRY.height, `y in view: ${node.y}`)
  }
})

test('a crowded graph keeps one ring and stops before it becomes unreadable', () => {
  const ids = Array.from({ length: 14 }, (unused, index) => `n${String(index).padStart(2, '0')}`)
  const entries = new Map([['a', { id: 'a', danish: 'a', translation: null }],
    ...ids.map((id) => [id, { id, danish: id, translation: null }])])
  const links = ids.map((id) => link('a', id))
  const nodes = egoLayout(neighboursOf('a', links, entries))

  assert.equal(nodes.length, EGO_NODE_LIMIT, 'the rest stay reachable as chips, not as nodes')
  assert.deepEqual(nodes.map((node) => node.id), ids.slice(0, EGO_NODE_LIMIT), 'and the cut is deterministic')

  // One ellipse, so every node sits at the same angle-adjusted distance: an inner ring was
  // tried and dropped because it collides with the centre pill near the horizontal axis.
  const radius = (node) => Math.hypot(node.x - EGO_GEOMETRY.cx, node.y - EGO_GEOMETRY.cy)
  for (const node of nodes) {
    assert.ok(radius(node) >= Math.min(EGO_GEOMETRY.rx, EGO_GEOMETRY.ry) - 0.5, `node ${node.id} is on the ring`)
    assert.ok(radius(node) <= Math.max(EGO_GEOMETRY.rx, EGO_GEOMETRY.ry) + 0.5, `node ${node.id} is on the ring`)
  }
})

test('labels are cut deterministically because SVG text cannot ellipsize', () => {
  assert.equal(truncateLabel('hyggelig'), 'hyggelig')
  assert.equal(truncateLabel('  hyggelig  '), 'hyggelig')
  assert.equal(truncateLabel('at tage sig af noget'), 'at tage sig a…')
  assert.equal(truncateLabel('at tage sig af noget', 12), 'at tage sig…', 'a trailing space is not kept before the ellipsis')
  assert.equal(truncateLabel('umiddelbart', 6), 'umidd…')
  assert.equal(truncateLabel(''), '')
})
