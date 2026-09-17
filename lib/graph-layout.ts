import type { EntryLinkRow } from './entry-links'
import type { EntryLinkKind } from './types'

/**
 * Layout for the whole meaning graph (the Material tab's Graph view).
 *
 * Pure and deterministic end to end: the same vocabulary always produces the same picture, so
 * the learner can recognise the shape of their own graph on the way back. Nothing is random —
 * seeding is a golden-angle spiral by index, the iteration count is fixed, and the simulation
 * runs to completion before anything is drawn rather than animating into place.
 *
 * No layout dependency. d3-force is the obvious import and it is not worth it here (AGENTS.md
 * §16): Fruchterman-Reingold over a few dozen nodes per cluster is the forty lines below, and
 * the bundle is on the phone's critical path.
 */

/** An entry only reaches the graph if it has at least one link, so this stays small. */
export interface GraphEntry {
  id: string
  danish: string
  translation: string | null
}

export interface GraphNode extends GraphEntry {
  /** Connected-component index. Every node in one island shares it, and it drives the colour. */
  cluster: number
  degree: number
  x: number
  y: number
  radius: number
}

export interface GraphEdge {
  a: string
  b: string
  kind: EntryLinkKind
  confirmed: boolean
  /** The meaning the edge claims the two share. Null on hand-made and pre-concept edges. */
  concept: string | null
  cluster: number
}

export interface VocabularyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** How many separate islands the graph has. */
  clusters: number
  /** Entries with no link at all. Counted so the UI can say so, never drawn. */
  isolated: number
  width: number
  height: number
}

const ITERATIONS = 300
/** The edge length the simulation pulls towards, and the unit every other force is scaled by. */
const IDEAL_EDGE = 92
const COOLING = 0.975
/** Gap between two clusters when they are packed onto the canvas. */
const CLUSTER_GAP = 56
const CANVAS_PAD = 40
/** Golden angle: the spiral that spreads seeds most evenly without any randomness. */
const GOLDEN_ANGLE = 2.399963229728653

interface Point { x: number; y: number }

/** Node pill half-width, from the label, mirroring how the ego-graph sizes its boxes. */
function nodeRadius(danish: string): number {
  return Math.min(56, Math.max(26, (danish || '').trim().length * 3.6 + 18))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Union-find over the edges. Connected components are the clustering: it needs no tuning, it is
 * exactly what "these words link to each other" means, and it cannot drift between renders the
 * way a community-detection pass with a resolution parameter would.
 */
function components(ids: readonly string[], edges: readonly { a: string; b: string }[]): Map<string, number> {
  const parent = new Map<string, string>(ids.map((id) => [id, id]))

  function find(id: string): string {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    // Path compression, so a long chain of links stays cheap to resolve.
    let walk = id
    while (parent.get(walk) !== root) {
      const next = parent.get(walk) as string
      parent.set(walk, root)
      walk = next
    }
    return root
  }

  for (const edge of edges) {
    const a = find(edge.a)
    const b = find(edge.b)
    if (a !== b) parent.set(a, b)
  }

  // Number the clusters by their smallest member id. Which node ends up as a component's
  // union-find root depends on the order the edges arrived in, so the root itself is not a
  // stable name for the component — the smallest member is.
  const smallest = new Map<string, string>()
  for (const id of ids) {
    const root = find(id)
    const current = smallest.get(root)
    if (current === undefined || id < current) smallest.set(root, id)
  }
  const order = [...smallest.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  const index = new Map(order.map(([root], position) => [root, position]))
  return new Map(ids.map((id) => [id, index.get(find(id)) as number]))
}

/**
 * Fruchterman-Reingold on one cluster, returning positions centred on the origin.
 *
 * Repulsion is all-pairs, which is O(n²) — fine, because it runs per cluster and a vocabulary
 * island is dozens of words, not thousands.
 */
function layoutCluster(ids: readonly string[], edges: readonly { a: string; b: string }[]): Map<string, Point> {
  const positions = new Map<string, Point>()
  ids.forEach((id, index) => {
    const angle = index * GOLDEN_ANGLE
    const radius = IDEAL_EDGE * 0.5 * Math.sqrt(index + 0.5)
    positions.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  })

  if (ids.length === 1) return positions

  let temperature = IDEAL_EDGE
  for (let step = 0; step < ITERATIONS; step += 1) {
    const displacement = new Map<string, Point>(ids.map((id) => [id, { x: 0, y: 0 }]))

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const left = positions.get(ids[i]) as Point
        const right = positions.get(ids[j]) as Point
        let dx = left.x - right.x
        let dy = left.y - right.y
        let distance = Math.hypot(dx, dy)
        if (distance < 0.01) {
          // Two seeds landed on top of each other; nudge them apart deterministically.
          dx = (i - j) * 0.01
          dy = 0.01
          distance = Math.hypot(dx, dy)
        }
        const force = (IDEAL_EDGE * IDEAL_EDGE) / distance
        const pushX = (dx / distance) * force
        const pushY = (dy / distance) * force
        const a = displacement.get(ids[i]) as Point
        const b = displacement.get(ids[j]) as Point
        a.x += pushX; a.y += pushY
        b.x -= pushX; b.y -= pushY
      }
    }

    for (const edge of edges) {
      const left = positions.get(edge.a)
      const right = positions.get(edge.b)
      if (!left || !right) continue
      const dx = left.x - right.x
      const dy = left.y - right.y
      const distance = Math.max(0.01, Math.hypot(dx, dy))
      const force = (distance * distance) / IDEAL_EDGE
      const pullX = (dx / distance) * force
      const pullY = (dy / distance) * force
      const a = displacement.get(edge.a) as Point
      const b = displacement.get(edge.b) as Point
      a.x -= pullX; a.y -= pullY
      b.x += pullX; b.y += pullY
    }

    for (const id of ids) {
      const move = displacement.get(id) as Point
      const length = Math.max(0.01, Math.hypot(move.x, move.y))
      const capped = Math.min(length, temperature)
      const point = positions.get(id) as Point
      point.x += (move.x / length) * capped
      point.y += (move.y / length) * capped
    }

    temperature *= COOLING
  }

  let cx = 0
  let cy = 0
  for (const id of ids) {
    const point = positions.get(id) as Point
    cx += point.x
    cy += point.y
  }
  cx /= ids.length
  cy /= ids.length
  for (const point of positions.values()) {
    point.x -= cx
    point.y -= cy
  }
  return positions
}

/**
 * Build and lay out the whole graph.
 *
 * Only entries that link to something are drawn — hundreds of unconnected dots say nothing and
 * make the islands unreadable — so `isolated` reports the rest for the UI to mention.
 */
export function buildVocabularyGraph(
  entries: readonly GraphEntry[],
  links: readonly EntryLinkRow[],
): VocabularyGraph {
  const byId = new Map(entries.map((entry) => [entry.id.toLowerCase(), entry]))

  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const linked = new Set<string>()
  for (const link of links || []) {
    const a = String(link?.a_id || '').toLowerCase()
    const b = String(link?.b_id || '').toLowerCase()
    if (!a || !b || a === b || !byId.has(a) || !byId.has(b)) continue
    const key = `${a}:${b}:${link.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    linked.add(a)
    linked.add(b)
    edges.push({
      a,
      b,
      kind: link.kind,
      confirmed: Boolean(link.confirmed),
      concept: (link.concept || '').trim() || null,
      cluster: 0,
    })
  }

  // Sorted before anything reads them. The simulation sums forces edge by edge, and floating
  // point addition is not associative, so two orderings of the same edges would settle into
  // visibly different pictures.
  edges.sort((left, right) => left.a.localeCompare(right.a)
    || left.b.localeCompare(right.b)
    || left.kind.localeCompare(right.kind))

  const ids = [...linked].sort()
  if (!ids.length) {
    return { nodes: [], edges: [], clusters: 0, isolated: entries.length, width: 0, height: 0 }
  }

  const cluster = components(ids, edges)
  for (const edge of edges) edge.cluster = cluster.get(edge.a) ?? 0

  const degree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1)
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1)
  }

  const clusterCount = Math.max(0, ...cluster.values()) + 1
  const members: string[][] = Array.from({ length: clusterCount }, () => [])
  for (const id of ids) members[cluster.get(id) as number].push(id)

  const laidOut = members.map((ownIds, index) => {
    const ownEdges = edges.filter((edge) => edge.cluster === index)
    const positions = layoutCluster(ownIds, ownEdges)
    let radius = 0
    for (const id of ownIds) {
      const point = positions.get(id) as Point
      radius = Math.max(radius, Math.hypot(point.x, point.y) + nodeRadius(byId.get(id)?.danish || '') + 12)
    }
    return { index, ids: ownIds, positions, radius: Math.max(radius, 40) }
  })

  // Shelf-pack the clusters: biggest first, wrapping into rows once a row gets wider than it is
  // tall. The result is a compact block rather than one long line the learner has to pan along.
  const order = [...laidOut].sort((left, right) => right.radius - left.radius || left.index - right.index)
  const rowWidthTarget = Math.max(520, Math.sqrt(order.reduce((sum, item) => sum + (2 * item.radius) ** 2, 0)))

  const placement = new Map<number, Point>()
  let rowX = 0
  let rowY = 0
  let rowHeight = 0
  let maxWidth = 0
  for (const item of order) {
    const size = 2 * item.radius
    if (rowX > 0 && rowX + size > rowWidthTarget) {
      rowY += rowHeight + CLUSTER_GAP
      rowX = 0
      rowHeight = 0
    }
    placement.set(item.index, { x: rowX + item.radius, y: rowY + item.radius })
    rowX += size + CLUSTER_GAP
    rowHeight = Math.max(rowHeight, size)
    maxWidth = Math.max(maxWidth, rowX - CLUSTER_GAP)
  }

  const nodes: GraphNode[] = []
  for (const item of laidOut) {
    const origin = placement.get(item.index) as Point
    for (const id of item.ids) {
      const point = item.positions.get(id) as Point
      const entry = byId.get(id) as GraphEntry
      nodes.push({
        ...entry,
        id,
        cluster: item.index,
        degree: degree.get(id) ?? 0,
        x: round(origin.x + point.x + CANVAS_PAD),
        y: round(origin.y + point.y + CANVAS_PAD),
        radius: nodeRadius(entry.danish),
      })
    }
  }

  nodes.sort((left, right) => left.cluster - right.cluster || left.id.localeCompare(right.id))

  return {
    nodes,
    edges,
    clusters: clusterCount,
    isolated: entries.length - ids.length,
    width: round(maxWidth + CANVAS_PAD * 2),
    height: round(rowY + rowHeight + CANVAS_PAD * 2),
  }
}
