'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Maximize2, Minus, Plus, Search, Sparkles, Waypoints, X } from 'lucide-react'
import { buildVocabularyGraph, type GraphEdge, type GraphNode } from '@/lib/graph-layout'
import { LINK_KIND_LABELS, type EntryLinkRow } from '@/lib/entry-links'
import type { VocabularyEntry } from '@/lib/types'

/**
 * The whole meaning graph: every entry that links to something, laid out by island.
 *
 * The layout is computed once in `lib/graph-layout.ts` and never animates. What moves here is
 * the camera — pan and zoom over a finished picture — so the learner's own graph keeps the same
 * shape every time they open it.
 */

/** Past this zoom every edge explains itself; below it, only the selected node's edges do. */
const CONCEPT_ZOOM = 1.5
/** The floor for deliberate zooming out. Framing the whole graph may go below it, and does on a
 *  phone as soon as there are a few islands — "show me everything" outranks a tidy minimum. */
const MIN_ZOOM = 0.35
const MAX_ZOOM = 3.5
/** A pointer that travelled further than this was a pan, not a tap. */
const TAP_SLOP = 6
/** Framing a single match must not fill the screen with one word; the island around it is the point. */
const MATCH_ZOOM = 1.6

interface Camera { x: number; y: number; k: number }

function clusterColor(cluster: number): string {
  return `var(--cluster-${cluster % 8})`
}

function midpoint(a: GraphNode, b: GraphNode): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.a}:${edge.b}:${edge.kind}`
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  return (haystack || '').toLocaleLowerCase('da-DK').includes(needle)
}

export interface GraphDiscovery {
  done: number
  total: number
  /** Set when the run ended early, with the reason to show the learner. */
  stopped?: string
}

export function VocabularyGraph({ entries, links, discovery = null, onFindLinks }: {
  entries: readonly VocabularyEntry[]
  links: readonly EntryLinkRow[]
  discovery?: GraphDiscovery | null
  onFindLinks?: () => void
}): React.JSX.Element {
  const graph = useMemo(
    () => buildVocabularyGraph(
      entries.map((entry) => ({ id: entry.id, danish: entry.danish, translation: entry.translation })),
      links,
    ),
    [entries, links],
  )

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 })
  /**
   * The camera again, readable synchronously. A gesture re-baselines itself whenever a finger
   * lands or lifts, and it has to read the camera as it is *now*, not as it was when React last
   * rendered — otherwise the rebase snaps the view back to a stale position.
   */
  const cameraRef = useRef(camera)
  /** Never zoom out past the framed-everything view; there is nothing further out to see. */
  const minZoom = useRef(MIN_ZOOM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const frame = useRef<HTMLDivElement>(null)
  /** Live pointers, so one finger pans and two pinch without a gesture library. */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ camera: Camera; x: number; y: number; distance: number; moved: number } | null>(null)

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null
  const selectedEdges = useMemo(
    () => selected ? graph.edges.filter((edge) => edge.a === selected.id || edge.b === selected.id) : [],
    [graph.edges, selected],
  )
  const neighbourIds = useMemo(
    () => new Set(selectedEdges.flatMap((edge) => [edge.a, edge.b])),
    [selectedEdges],
  )

  /**
   * What the search matches: the same search the Material list has, over the same three texts —
   * the Danish, its meanings, and the concept an edge is about.
   *
   * Null means no search is running, which is not the same as no matches: the first dims nothing,
   * the second dims everything, and a learner who typed a word Ordly has not linked yet needs to
   * see that difference.
   */
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('da-DK')
    if (!query) return null
    const nodes = new Set(graph.nodes.filter((node) => contains(node.danish, query) || contains(node.translation, query)).map((node) => node.id))
    const edges = new Set<string>()
    for (const edge of graph.edges) {
      // An edge is a match in its own right when the meaning it claims is what was typed, and
      // then both of its ends light up — otherwise the match would be a line to nowhere.
      if (contains(edge.concept, query)) {
        edges.add(edgeKey(edge))
        nodes.add(edge.a)
        nodes.add(edge.b)
      }
    }
    for (const edge of graph.edges) {
      if (nodes.has(edge.a) || nodes.has(edge.b)) edges.add(edgeKey(edge))
    }
    return { nodes, edges }
  }, [search, graph])

  /** The match set as it is now, for the resize handler, which must not re-subscribe per keystroke. */
  const matchesRef = useRef(matches)
  matchesRef.current = matches

  function applyCamera(next: Camera): void {
    cameraRef.current = next
    setCamera(next)
  }

  /** Where the fingers are now, and how far apart. */
  function readPointers(): { x: number; y: number; distance: number } {
    const points = [...pointers.current.values()]
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
    }
  }

  /**
   * Restart the gesture from where the view and the fingers are right now.
   *
   * Called whenever the number of fingers changes, which is the whole fix for the view jumping:
   * lifting one finger after a pinch used to leave the two-finger baseline in place, so the next
   * move measured a one-finger distance of zero against it, threw the scale away, and teleported
   * the view back to wherever the pinch began.
   */
  function rebase(): void {
    if (!pointers.current.size) {
      gesture.current = null
      return
    }
    const { x, y, distance } = readPointers()
    gesture.current = { camera: cameraRef.current, x, y, distance, moved: gesture.current?.moved ?? 0 }
  }

  /**
   * Frame the whole graph. This is the view the learner asked for, so it is also the view they
   * land on and the one Reset returns to — never an arbitrary 1:1 zoom on whichever island
   * happened to be laid out at the origin.
   */
  const fit = useCallback((): void => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !graph.width || !graph.height) return
    const k = Math.min(MAX_ZOOM, Math.min(box.width / graph.width, box.height / graph.height) * 0.92)
    minZoom.current = Math.min(MIN_ZOOM, k)
    applyCamera({ k, x: (box.width - graph.width * k) / 2, y: (box.height - graph.height * k) / 2 })
  }, [graph.width, graph.height])

  /** Bring a few nodes into view — what a search does once it knows where its answer is. */
  const frameNodes = useCallback((ids: ReadonlySet<string>): void => {
    const box = frame.current?.getBoundingClientRect()
    const found = graph.nodes.filter((node) => ids.has(node.id))
    if (!box || !found.length) return
    const pad = 70
    const left = Math.min(...found.map((node) => node.x - node.radius)) - pad
    const right = Math.max(...found.map((node) => node.x + node.radius)) + pad
    const top = Math.min(...found.map((node) => node.y)) - pad
    const bottom = Math.max(...found.map((node) => node.y)) + pad
    const k = Math.max(minZoom.current, Math.min(MATCH_ZOOM, Math.min(box.width / (right - left), box.height / (bottom - top))))
    applyCamera({ k, x: box.width / 2 - ((left + right) / 2) * k, y: box.height / 2 - ((top + bottom) / 2) * k })
  }, [graph.nodes])

  /**
   * A search that found something moves the camera to it, once per search text.
   *
   * Keyed on the text rather than on the match set: `matches` is rebuilt whenever the graph is,
   * so `Find links` — which adds an edge at a time — would otherwise yank the camera back to the
   * old search on every edge it discovers, including mid-gesture.
   */
  const framedFor = useRef<string | null>(null)
  useEffect(() => {
    const query = search.trim()
    if (!query) {
      framedFor.current = null
      return
    }
    if (framedFor.current === query || !matches?.nodes.size) return
    framedFor.current = query
    frameNodes(matches.nodes)
  }, [search, matches, frameNodes])

  /**
   * Fits once the frame has a size, and again whenever the graph itself changes shape.
   *
   * A running search keeps its framing through a resize: on a phone the resize *is* the keyboard
   * opening under the search field, and fitting the whole graph there would throw away the
   * answer the learner just typed.
   */
  const refit = useCallback((): void => {
    const current = matchesRef.current
    if (current?.nodes.size) frameNodes(current.nodes)
    else fit()
  }, [fit, frameNodes])

  useLayoutEffect(() => {
    refit()
    if (typeof ResizeObserver === 'undefined' || !frame.current) return
    const observer = new ResizeObserver(refit)
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [refit])

  function zoomBy(factor: number, originX?: number, originY?: number): void {
    const current = cameraRef.current
    const k = Math.min(MAX_ZOOM, Math.max(minZoom.current, current.k * factor))
    if (k === current.k) return
    const box = frame.current?.getBoundingClientRect()
    const cx = originX ?? (box ? box.width / 2 : 0)
    const cy = originY ?? (box ? box.height / 2 : 0)
    const scale = k / current.k
    // Keep whatever sits under the cursor or the button's centre pinned in place.
    applyCamera({ k, x: cx - (cx - current.x) * scale, y: cy - (cy - current.y) * scale })
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    // Captured on the frame, not on whatever node happened to be under the finger, so every
    // later move and release lands here even when the pointer leaves the element it started on.
    // Capture is best-effort: it throws for a pointer the browser has already released, and
    // losing it only costs a gesture that strays outside the frame — never the gesture itself.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // ignored on purpose
    }
    if (!pointers.current.size) gesture.current = null
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    rebase()
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const start = gesture.current
    if (!start) return

    const { x, y, distance } = readPointers()
    start.moved = Math.max(start.moved, Math.hypot(x - start.x, y - start.y))

    // Only a gesture that began with two fingers and still has two is a pinch.
    const scale = start.distance > 0 && distance > 0 ? distance / start.distance : 1
    const k = Math.min(MAX_ZOOM, Math.max(minZoom.current, start.camera.k * scale))
    const zoom = k / start.camera.k
    const box = frame.current?.getBoundingClientRect()
    // Zoom about where the fingers started, then pan by how far they have travelled since.
    const originX = start.x - (box?.left ?? 0)
    const originY = start.y - (box?.top ?? 0)

    applyCamera({
      k,
      x: start.camera.x * zoom + originX * (1 - zoom) + (x - start.x),
      y: start.camera.y * zoom + originY * (1 - zoom) + (y - start.y),
    })
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!pointers.current.delete(event.pointerId)) return
    if (pointers.current.size > 0) {
      // Still touching: carry on from here rather than from a baseline the lifted finger set.
      rebase()
      return
    }
    // A tap on the background clears the selection; a pan leaves it alone. The target is
    // whatever the SVG put under the finger, so "background" means "not a node".
    const onNode = (event.target as Element).closest?.('.graph-node')
    if (gesture.current && gesture.current.moved < TAP_SLOP && !onNode) setSelectedId(null)
    gesture.current = null
  }

  function onNodeActivate(node: GraphNode): void {
    if (gesture.current && gesture.current.moved >= TAP_SLOP) return
    setSelectedId((current) => current === node.id ? null : node.id)
  }

  if (!graph.nodes.length) {
    return (
      <div className="graph-empty">
        <Waypoints size={22} aria-hidden="true" />
        <h2>Nothing is linked yet</h2>
        <p>
          Ordly looks for synonyms right after you save a word. Once two of your words share a
          meaning, they appear here as a connected island.
          {graph.isolated > 0 && ` All ${graph.isolated} of your entries are still unlinked.`}
        </p>
        {onFindLinks && <FindLinks discovery={discovery} onFindLinks={onFindLinks} />}
      </div>
    )
  }

  const showEveryConcept = camera.k >= CONCEPT_ZOOM

  return (
    <div className="graph-view">
      <div
        ref={frame}
        className="graph-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(event) => {
          event.preventDefault()
          // Measured against the frame, never `offsetX`: that is relative to whichever SVG
          // element the cursor happens to be over, which anchored the zoom somewhere random.
          const box = event.currentTarget.getBoundingClientRect()
          zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - box.left, event.clientY - box.top)
        }}
      >
        <svg className="graph-svg" role="presentation">
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
            {graph.edges.map((edge) => {
              const a = nodeById.get(edge.a)
              const b = nodeById.get(edge.b)
              if (!a || !b) return null
              const active = (!selected || neighbourIds.has(edge.a)) && (!matches || matches.edges.has(edgeKey(edge)))
              return (
                <line
                  key={`${edge.a}:${edge.b}:${edge.kind}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={clusterColor(edge.cluster)}
                  strokeWidth={edge.confirmed ? 1.6 : 1.2}
                  // A guess nobody has accepted is never drawn with the weight of a fact (D4).
                  strokeDasharray={edge.confirmed ? undefined : '3 5'}
                  opacity={active ? (edge.confirmed ? 0.5 : 0.3) : 0.08}
                />
              )
            })}

            {graph.edges.map((edge) => {
              const a = nodeById.get(edge.a)
              const b = nodeById.get(edge.b)
              if (!a || !b || !edge.concept) return null
              const onSelected = selected ? (edge.a === selected.id || edge.b === selected.id) : false
              // A concept the learner just searched for explains itself at any zoom: it is the
              // thing they were looking for.
              const found = Boolean(matches?.edges.has(edgeKey(edge)) && contains(edge.concept, search.trim().toLocaleLowerCase('da-DK')))
              if (!found && !onSelected && !(showEveryConcept && !selected)) return null
              const point = midpoint(a, b)
              return (
                <text
                  key={`concept-${edge.a}:${edge.b}:${edge.kind}`}
                  className="graph-concept"
                  x={point.x}
                  y={point.y}
                >
                  {edge.concept}
                </text>
              )
            })}

            {graph.nodes.map((node) => {
              const dimmed = (Boolean(selected) && !neighbourIds.has(node.id)) || Boolean(matches && !matches.nodes.has(node.id))
              const isSelected = selected?.id === node.id
              const found = Boolean(matches?.nodes.has(node.id))
              return (
                <g
                  key={node.id}
                  className={`graph-node${isSelected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}${found ? ' found' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.danish}${node.translation ? `, ${node.translation}` : ''}, ${node.degree} link${node.degree === 1 ? '' : 's'}`}
                  aria-pressed={isSelected}
                  onClick={() => onNodeActivate(node)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setSelectedId((current) => current === node.id ? null : node.id)
                  }}
                >
                  <rect
                    x={node.x - node.radius}
                    y={node.y - 13}
                    width={node.radius * 2}
                    height={26}
                    rx={13}
                    fill={isSelected ? clusterColor(node.cluster) : 'var(--surface)'}
                    stroke={clusterColor(node.cluster)}
                    strokeWidth={isSelected ? 0 : found ? 2.6 : 1.4}
                  />
                  <text x={node.x} y={node.y} fill={isSelected ? '#fff' : undefined}>{node.danish}</text>
                </g>
              )
            })}
          </g>
        </svg>

        <label className="graph-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              // Emptying the field is "show me everything again", however it was emptied.
              if (!event.target.value.trim()) fit()
            }}
            placeholder="Find a word or meaning…"
            aria-label="Search the graph"
            // The frame owns pointer gestures; typing here must not start a pan.
            onPointerDown={(event) => event.stopPropagation()}
          />
          {search && (
            <button type="button" className="graph-search-clear" aria-label="Clear the search" onClick={() => { setSearch(''); fit() }}>
              <X size={14} />
            </button>
          )}
          {matches && <span className="graph-search-count">{matches.nodes.size}</span>}
        </label>

        <div className="graph-zoom">
          <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><Plus size={16} /></button>
          <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out"><Minus size={16} /></button>
          <button type="button" onClick={() => { fit(); setSelectedId(null) }} aria-label="Fit the whole graph"><Maximize2 size={15} /></button>
        </div>
      </div>

      {selected ? (
        <div className="graph-detail">
          <div className="graph-detail-head">
            <div>
              <strong>{selected.danish}</strong>
              {selected.translation && <small>{selected.translation}</small>}
            </div>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setSelectedId(null)}><X size={16} /></button>
          </div>
          <ul className="graph-detail-links">
            {selectedEdges.map((edge) => {
              const other = nodeById.get(edge.a === selected.id ? edge.b : edge.a)
              if (!other) return null
              return (
                <li key={`${edge.a}:${edge.b}:${edge.kind}`}>
                  <Link href={`/words/${other.id}`}>
                    {edge.confirmed ? <Link2 size={12} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
                    <span>{other.danish}</span>
                  </Link>
                  <ConceptTag edge={edge} />
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="graph-footer">
        <p className="graph-hint">
          {graph.nodes.length} linked {graph.nodes.length === 1 ? 'word' : 'words'} in {graph.clusters}{' '}
          {graph.clusters === 1 ? 'island' : 'islands'}. Tap one to see what it connects to and why.
          {graph.isolated > 0 && ` ${graph.isolated} unlinked ${graph.isolated === 1 ? 'entry is' : 'entries are'} not shown.`}
        </p>
        {onFindLinks && <FindLinks discovery={discovery} onFindLinks={onFindLinks} />}
        </div>
      )}

    </div>
  )
}

/**
 * Run discovery over the whole vocabulary.
 *
 * Discovery normally fires only when an entry is saved, so words added before it existed — or
 * after the edges were cleared — would otherwise never find each other.
 */
function FindLinks({ discovery, onFindLinks }: { discovery: GraphDiscovery | null; onFindLinks: () => void }): React.JSX.Element {
  const running = Boolean(discovery && !discovery.stopped)
  const paused = Boolean(discovery?.stopped)
  return (
    <div className="graph-discover">
      <button type="button" className="graph-find" disabled={running} onClick={onFindLinks}>
        {running ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
        {running
          ? `Looking… ${discovery?.done} / ${discovery?.total}`
          : paused
            ? `Carry on · ${discovery?.done} / ${discovery?.total}`
            : 'Find links'}
      </button>
      {/* Why it stopped, and that nothing found so far was lost. */}
      {paused && <small>{discovery?.stopped} Nothing found so far is lost.</small>}
    </div>
  )
}

/** The claim the edge makes, in words: what it is, and the meaning it rests on. */
function ConceptTag({ edge }: { edge: GraphEdge }): React.JSX.Element {
  return (
    <em className={edge.confirmed ? 'graph-concept-tag' : 'graph-concept-tag suggested'}>
      {edge.confirmed ? LINK_KIND_LABELS[edge.kind] : `Suggested ${LINK_KIND_LABELS[edge.kind].toLowerCase()}`}
      {edge.concept ? ` · ${edge.concept}` : ''}
    </em>
  )
}
