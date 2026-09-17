'use client'

import Link from 'next/link'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link2, Loader2, Maximize2, Minus, Plus, Sparkles, Waypoints, X } from 'lucide-react'
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

interface Camera { x: number; y: number; k: number }

function clusterColor(cluster: number): string {
  return `var(--cluster-${cluster % 8})`
}

function midpoint(a: GraphNode, b: GraphNode): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
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
  /** Never zoom out past the framed-everything view; there is nothing further out to see. */
  const minZoom = useRef(MIN_ZOOM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
   * Frame the whole graph. This is the view the learner asked for, so it is also the view they
   * land on and the one Reset returns to — never an arbitrary 1:1 zoom on whichever island
   * happened to be laid out at the origin.
   */
  const fit = useCallback((): void => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !graph.width || !graph.height) return
    const k = Math.min(MAX_ZOOM, Math.min(box.width / graph.width, box.height / graph.height) * 0.92)
    minZoom.current = Math.min(MIN_ZOOM, k)
    setCamera({ k, x: (box.width - graph.width * k) / 2, y: (box.height - graph.height * k) / 2 })
  }, [graph.width, graph.height])

  // Fits once the frame has a size, and again whenever the graph itself changes shape.
  useLayoutEffect(() => {
    fit()
    if (typeof ResizeObserver === 'undefined' || !frame.current) return
    const observer = new ResizeObserver(fit)
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [fit])

  function zoomBy(factor: number, originX?: number, originY?: number): void {
    setCamera((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(minZoom.current, current.k * factor))
      const box = frame.current?.getBoundingClientRect()
      const cx = originX ?? (box ? box.width / 2 : 0)
      const cy = originY ?? (box ? box.height / 2 : 0)
      const scale = k / current.k
      // Keep whatever sits under the cursor or the pinch centre pinned in place.
      return { k, x: cx - (cx - current.x) * scale, y: cy - (cy - current.y) * scale }
    })
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    // Captured on the frame, not on whatever node happened to be under the finger, so every
    // later move and release lands here even when the pointer leaves the element it started on.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    gesture.current = {
      camera,
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
      moved: 0,
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const start = gesture.current
    if (!start) return

    const points = [...pointers.current.values()]
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0

    start.moved = Math.max(start.moved, Math.hypot(x - start.x, y - start.y))
    const scale = start.distance > 0 && distance > 0 ? distance / start.distance : 1
    const k = Math.min(MAX_ZOOM, Math.max(minZoom.current, start.camera.k * scale))
    const box = frame.current?.getBoundingClientRect()
    const localX = start.x - (box?.left ?? 0)
    const localY = start.y - (box?.top ?? 0)
    const zoom = k / start.camera.k

    setCamera({
      k,
      x: start.camera.x * zoom + (localX - localX * zoom) + (x - start.x),
      y: start.camera.y * zoom + (localY - localY * zoom) + (y - start.y),
    })
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) {
      // A tap on the background clears the selection; a pan leaves it alone. The target is
      // whatever the SVG put under the finger, so "background" means "not a node".
      const onNode = (event.target as Element).closest?.('.graph-node')
      if (gesture.current && gesture.current.moved < TAP_SLOP && !onNode) setSelectedId(null)
      gesture.current = null
    }
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
        onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.nativeEvent.offsetX, event.nativeEvent.offsetY) }}
      >
        <svg className="graph-svg" role="presentation">
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
            {graph.edges.map((edge) => {
              const a = nodeById.get(edge.a)
              const b = nodeById.get(edge.b)
              if (!a || !b) return null
              const active = !selected || neighbourIds.has(edge.a)
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
              if (!onSelected && !(showEveryConcept && !selected)) return null
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
              const dimmed = Boolean(selected) && !neighbourIds.has(node.id)
              const isSelected = selected?.id === node.id
              return (
                <g
                  key={node.id}
                  className={`graph-node${isSelected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
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
                    strokeWidth={isSelected ? 0 : 1.4}
                  />
                  <text x={node.x} y={node.y} fill={isSelected ? '#fff' : undefined}>{node.danish}</text>
                </g>
              )
            })}
          </g>
        </svg>

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
        <p className="graph-hint">
          {graph.nodes.length} linked {graph.nodes.length === 1 ? 'word' : 'words'} in {graph.clusters}{' '}
          {graph.clusters === 1 ? 'island' : 'islands'}. Tap one to see what it connects to and why.
          {graph.isolated > 0 && ` ${graph.isolated} unlinked ${graph.isolated === 1 ? 'entry is' : 'entries are'} not shown.`}
        </p>
      )}

      {onFindLinks && !selected && <FindLinks discovery={discovery} onFindLinks={onFindLinks} />}
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
  return (
    <div className="graph-discover">
      <button type="button" className="soft-button" disabled={running} onClick={onFindLinks}>
        {running ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
        {running ? `Looking for links… ${discovery?.done} / ${discovery?.total}` : 'Find links'}
      </button>
      {discovery?.stopped && <small>{discovery.stopped}</small>}
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
