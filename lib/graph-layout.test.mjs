import assert from 'node:assert/strict'
import test from 'node:test'
import { buildVocabularyGraph } from './graph-layout.ts'

const entry = (id, danish) => ({ id, danish, translation: null })
const link = (a_id, b_id, extra = {}) => ({
  a_id, b_id, kind: 'synonym', source: 'ai', confidence: 0.9, confirmed: true, concept: null, ...extra,
})

test('only linked entries are drawn, and the rest are counted', () => {
  const graph = buildVocabularyGraph(
    [entry('a', 'kun'), entry('b', 'blot'), entry('c', 'hus')],
    [link('a', 'b')],
  )

  assert.deepEqual(graph.nodes.map((node) => node.id), ['a', 'b'])
  assert.equal(graph.isolated, 1, 'hus links to nothing, so it is counted rather than drawn')
  assert.equal(graph.clusters, 1)
})

test('separate islands get separate clusters, and every member shares one', () => {
  const graph = buildVocabularyGraph(
    ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id, id)),
    [link('a', 'b'), link('b', 'c'), link('d', 'e')],
  )

  const cluster = new Map(graph.nodes.map((node) => [node.id, node.cluster]))
  assert.equal(graph.clusters, 2)
  assert.equal(cluster.get('a'), cluster.get('b'))
  assert.equal(cluster.get('b'), cluster.get('c'), 'a chain is one island')
  assert.equal(cluster.get('d'), cluster.get('e'))
  assert.notEqual(cluster.get('a'), cluster.get('d'))
  for (const edge of graph.edges) {
    assert.equal(edge.cluster, cluster.get(edge.a), 'an edge belongs to its endpoints island')
  }
})

test('the same vocabulary always produces the same picture', () => {
  const entries = ['a', 'b', 'c', 'd'].map((id) => entry(id, `word-${id}`))
  const links = [link('a', 'b'), link('b', 'c'), link('c', 'a'), link('c', 'd')]

  const first = buildVocabularyGraph(entries, links)
  // Feeding the same graph in a different order must not move a single node.
  const second = buildVocabularyGraph([...entries].reverse(), [...links].reverse())

  assert.deepEqual(
    first.nodes.map((node) => [node.id, node.x, node.y]),
    second.nodes.map((node) => [node.id, node.x, node.y]),
  )
  assert.ok(first.width > 0 && first.height > 0)
})

test('linked nodes are pulled together and never land on top of each other', () => {
  const graph = buildVocabularyGraph(
    ['a', 'b', 'c'].map((id) => entry(id, id)),
    [link('a', 'b'), link('b', 'c')],
  )

  const at = (id) => graph.nodes.find((node) => node.id === id)
  const gap = (left, right) => Math.hypot(at(left).x - at(right).x, at(left).y - at(right).y)

  assert.ok(gap('a', 'b') > 20, 'nodes are separated')
  assert.ok(gap('a', 'b') < gap('a', 'c'), 'a neighbour sits closer than the far end of the chain')
})

test('edges to entries that are not on this surface are skipped, not drawn nameless', () => {
  const graph = buildVocabularyGraph([entry('a', 'kun')], [link('a', 'missing')])
  assert.deepEqual(graph.nodes, [])
  assert.equal(graph.clusters, 0)
  assert.equal(graph.isolated, 1)
})

test('the concept rides along on the edge so the picture can explain itself', () => {
  const graph = buildVocabularyGraph(
    [entry('a', 'kun'), entry('b', 'blot')],
    [link('a', 'b', { concept: '  только  ' })],
  )
  assert.equal(graph.edges[0].concept, 'только')
})
