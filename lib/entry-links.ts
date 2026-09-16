import type { EntryLinkKind, EntryLinkSource } from './types'

/**
 * Presentation logic for the meaning graph (D12).
 *
 * Everything here is pure and deterministic so the ego-graph can be laid out without a layout
 * library: the same edges always produce the same picture, and confirming an edge moves nothing
 * (`confirmed` is deliberately absent from the layout sort key). `lib/synonyms.ts` owns the
 * candidate/edge logic; this module only decides how an edge is read and where it is drawn.
 *
 * No dependency is added for this — not d3, not react-flow. The graph is one hand-rolled inline
 * SVG, because the bundle is on the phone's critical path (AGENTS.md §16).
 */

/** The `public.entry_links` columns the UI reads. */
export interface EntryLinkRow {
  a_id: string
  b_id: string
  kind: EntryLinkKind
  source: EntryLinkSource
  confidence: number | null
  confirmed: boolean
}

/** The minimum an entry has to expose to be drawn as a neighbour. */
export interface LinkedEntryLabel {
  id: string
  danish: string
  translation: string | null
}

/**
 * `inflection_of` is the one directional kind: `a_id` is the inflected form, `b_id` the base.
 * From the point of view of the entry being displayed, the neighbour is therefore either the
 * base form or an inflection of it — the two read very differently and must not be conflated.
 */
export type LinkRole = 'base' | 'inflected' | null

export interface LinkNeighbour {
  id: string
  danish: string
  translation: string | null
  kind: EntryLinkKind
  /** false means discovery proposed this and nobody has accepted it: a suggestion, not a fact. */
  confirmed: boolean
  source: EntryLinkSource
  confidence: number | null
  role: LinkRole
  /** The edge itself, so a confirm or a dismiss can address the exact primary-key row. */
  link: EntryLinkRow
}

/** Stable kind ordering, used for both chip order and graph order. */
export const LINK_KINDS: readonly EntryLinkKind[] = ['synonym', 'antonym', 'related', 'inflection_of']

export const LINK_KIND_LABELS: Record<EntryLinkKind, string> = {
  synonym: 'Synonym',
  antonym: 'Opposite',
  related: 'Related',
  inflection_of: 'Inflection',
}

function kindRank(kind: EntryLinkKind): number {
  const index = LINK_KINDS.indexOf(kind)
  return index === -1 ? LINK_KINDS.length : index
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function roleFor(kind: EntryLinkKind, entryIsA: boolean): LinkRole {
  if (kind !== 'inflection_of') return null
  // a_id is the inflected form, so when the displayed entry is a_id the neighbour is its base.
  return entryIsA ? 'base' : 'inflected'
}

/**
 * The entries joined to `entryId` by any kind of edge, labelled from `entries`.
 *
 * An edge whose other end is not in `entries` is skipped rather than drawn unlabelled: the list
 * pages already hold every entry they can render, so a missing label means the neighbour is not
 * on this surface at all, and a nameless chip would be worse than no chip.
 *
 * The order is deterministic and does NOT depend on `confirmed`, so accepting a suggestion
 * leaves every other chip and node exactly where it was.
 */
export function neighboursOf(
  entryId: string,
  links: readonly EntryLinkRow[] | null | undefined,
  entries: ReadonlyMap<string, LinkedEntryLabel> | null | undefined,
): LinkNeighbour[] {
  if (!entryId || !links?.length || !entries?.size) return []
  const neighbours: LinkNeighbour[] = []
  const seen = new Set<string>()

  for (const link of links) {
    if (!link) continue
    const entryIsA = sameId(link.a_id, entryId)
    if (!entryIsA && !sameId(link.b_id, entryId)) continue

    const otherId = entryIsA ? link.b_id : link.a_id
    const key = `${otherId.toLowerCase()}:${link.kind}`
    if (seen.has(key)) continue

    const other = labelFor(entries, otherId)
    if (!other) continue
    seen.add(key)
    neighbours.push(toNeighbour(link, entryIsA, other))
  }

  return neighbours.sort(compareNeighbours)
}

function labelFor(
  entries: ReadonlyMap<string, LinkedEntryLabel>,
  id: string,
): LinkedEntryLabel | undefined {
  return entries.get(id) || entries.get(id.toLowerCase())
}

function toNeighbour(link: EntryLinkRow, entryIsA: boolean, other: LinkedEntryLabel): LinkNeighbour {
  return {
    id: other.id,
    danish: other.danish,
    translation: other.translation,
    kind: link.kind,
    confirmed: Boolean(link.confirmed),
    source: link.source,
    confidence: typeof link.confidence === 'number' ? link.confidence : null,
    role: roleFor(link.kind, entryIsA),
    link,
  }
}

/**
 * Every entry's neighbours in one pass over the edges.
 *
 * The list pages render hundreds of rows; asking each row to scan the whole edge table would
 * make the chips quadratic on the phone's critical path (AGENTS.md §16). Both ends of an edge
 * are filled in here, so a row lookup is a single map hit.
 */
export function neighboursByEntry(
  links: readonly EntryLinkRow[] | null | undefined,
  entries: ReadonlyMap<string, LinkedEntryLabel> | null | undefined,
): Map<string, LinkNeighbour[]> {
  const byEntry = new Map<string, LinkNeighbour[]>()
  if (!links?.length || !entries?.size) return byEntry

  const seen = new Set<string>()
  for (const link of links) {
    if (!link) continue
    const a = labelFor(entries, link.a_id)
    const b = labelFor(entries, link.b_id)
    const key = `${link.a_id.toLowerCase()}:${link.b_id.toLowerCase()}:${link.kind}`
    if (seen.has(key)) continue
    seen.add(key)

    if (a && b) {
      push(byEntry, a.id, toNeighbour(link, true, b))
      push(byEntry, b.id, toNeighbour(link, false, a))
    }
  }

  for (const neighbours of byEntry.values()) neighbours.sort(compareNeighbours)
  return byEntry
}

function push(byEntry: Map<string, LinkNeighbour[]>, id: string, neighbour: LinkNeighbour): void {
  const existing = byEntry.get(id)
  if (existing) existing.push(neighbour)
  else byEntry.set(id, [neighbour])
}

function compareNeighbours(left: LinkNeighbour, right: LinkNeighbour): number {
  return kindRank(left.kind) - kindRank(right.kind)
    || left.danish.localeCompare(right.danish, 'da-DK')
    || left.id.localeCompare(right.id)
}

/** True when the same edge row is meant, whichever way round the caller holds it. */
export function isSameLink(left: EntryLinkRow, right: EntryLinkRow): boolean {
  return left.kind === right.kind && sameId(left.a_id, right.a_id) && sameId(left.b_id, right.b_id)
}

/** Drop one edge from a list, for the optimistic update behind a dismiss. */
export function withoutLink(links: readonly EntryLinkRow[], removed: EntryLinkRow): EntryLinkRow[] {
  return links.filter((link) => !isSameLink(link, removed))
}

/** Mark one edge confirmed and learner-owned, matching what a confirm writes to the database. */
export function withConfirmedLink(links: readonly EntryLinkRow[], confirmed: EntryLinkRow): EntryLinkRow[] {
  return links.map((link) => isSameLink(link, confirmed)
    ? { ...link, confirmed: true, source: 'user' as const }
    : link)
}

/* ---- Ego-graph layout ------------------------------------------------------------------ */

export interface EgoGeometry {
  width: number
  height: number
  cx: number
  cy: number
  rx: number
  ry: number
}

/**
 * A fixed viewBox rather than a measured container. The SVG scales to its box and the CSS caps
 * that box, so the graph looks the same on a 320px phone as on a desktop — which is the point:
 * it is designed at phone width and merely allowed to be bigger (AGENTS.md §17).
 */
export const EGO_GEOMETRY: EgoGeometry = { width: 320, height: 300, cx: 160, cy: 150, rx: 104, ry: 104 }

/**
 * One ring, and never more nodes than fit on it.
 *
 * At phone width the ring has room for six labels side by side and no more; a second, inner
 * ring was tried and abandoned, because anything close enough to the centre to count as a
 * second ring collides with the centre pill near the horizontal axis. Neighbour seven onwards
 * is not dropped — it is listed in full as a chip under the graph, which is the honest way to
 * say "there are more of these than a picture this size can show".
 */
export const EGO_NODE_LIMIT = 6

export interface EgoNode extends LinkNeighbour {
  index: number
  x: number
  y: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Place neighbours on a radial layout around the entry.
 *
 * Deterministic by construction: the order comes from `compareNeighbours`, the first node is at
 * the top, and the rest run clockwise at equal angles. Nothing is random, nothing is measured,
 * and nothing is animated into place.
 */
export function egoLayout(
  neighbours: readonly LinkNeighbour[],
  geometry: EgoGeometry = EGO_GEOMETRY,
): EgoNode[] {
  const nodes = [...neighbours].sort(compareNeighbours).slice(0, EGO_NODE_LIMIT)
  const count = nodes.length
  if (!count) return []

  return nodes.map((neighbour, index) => {
    // -90° puts the first node straight above the entry; the ring then runs clockwise.
    const angle = (-Math.PI / 2) + ((2 * Math.PI * index) / count)
    return {
      ...neighbour,
      index,
      x: round(geometry.cx + Math.cos(angle) * geometry.rx),
      y: round(geometry.cy + Math.sin(angle) * geometry.ry),
    }
  })
}

/** SVG `<text>` cannot ellipsize, so the label is cut deterministically before it is drawn. */
export function truncateLabel(text: string, max = 14): string {
  const trimmed = (text || '').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/* ---- Discovery ------------------------------------------------------------------------- */

/**
 * Ask the server to look for synonyms of a freshly saved entry (D16).
 *
 * Deliberately swallows everything. Discovery runs after the save has already succeeded, so a
 * rate limit, a missing AI key or an offline phone must cost the learner nothing at all — the
 * worst outcome allowed here is that no chips appear.
 *
 * Returns how many edges the run produced, so the caller can decide whether refreshing the
 * route is worth it.
 */
export async function discoverSynonyms(entryId: string): Promise<number> {
  if (!entryId) return 0
  try {
    const response = await fetch('/api/synonyms/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    })
    if (!response.ok) return 0
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object') return 0
    const links = (body as { links?: unknown }).links
    return Array.isArray(links) ? links.length : 0
  } catch {
    return 0
  }
}
