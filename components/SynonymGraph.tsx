'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Waypoints } from 'lucide-react'
import {
  EGO_GEOMETRY,
  egoLayout,
  LINK_KIND_LABELS,
  neighboursOf,
  truncateLabel,
  withConfirmedLink,
  withoutLink,
  type EgoNode,
  type EntryLinkRow,
  type LinkedEntryLabel,
} from '@/lib/entry-links'
import type { EntryKind, EntryLinkKind } from '@/lib/types'
import { describe, SynonymChips } from './SynonymChips'

/**
 * The 1-hop ego-graph for one entry (D12): this entry at the centre, its neighbours on a
 * deterministic radial layout, edge colour by kind.
 *
 * Hand-rolled inline SVG on purpose. A graph library would add more bytes to the phone's
 * critical path than the whole feature is worth (AGENTS.md §16), and none of what they provide
 * — force simulation, panning, dragging — is wanted here: a picture that rearranges itself is a
 * picture the learner cannot recognise on the way back.
 *
 * The SVG is inert (`pointer-events: none`, `aria-hidden`); every node carries a real HTML
 * anchor on top of it. That is what keeps the graph tappable at iPhone width, prefetching, and
 * wired into the app's route-loading feedback, none of which an SVG `<a>` gives for free.
 */

const NODE_HEIGHT = 26
const CENTRE_HEIGHT = 32
const LABEL_MAX = 11
const NODE_MAX_WIDTH = 84
const CENTRE_MAX_WIDTH = 100

/**
 * Deterministic box width for a label, since SVG text cannot be measured before it is drawn.
 *
 * The caps are what keep the picture from colliding with itself. At the ring radius, six node
 * pills of 84 still fit around the ring, and one of them sitting on the horizontal axis — the
 * only place it can meet the centre — still clears a 100-wide centre pill.
 */
function boxWidth(label: string, padding: number, max: number): number {
  return Math.min(max, Math.max(52, label.length * 6.4 + padding))
}

function kindColor(kind: EntryLinkKind): string {
  return `var(--link-${kind})`
}

export function SynonymGraph({
  entryId,
  entryDanish,
  entryKind = 'word',
  initialLinks,
  neighbourEntries,
}: {
  entryId: string
  entryDanish: string
  entryKind?: EntryKind
  initialLinks: readonly EntryLinkRow[]
  neighbourEntries: readonly LinkedEntryLabel[]
}): React.JSX.Element {
  const [links, setLinks] = useState<EntryLinkRow[]>(() => [...initialLinks])

  const labels = useMemo(
    () => new Map(neighbourEntries.map((entry) => [entry.id, entry])),
    [neighbourEntries],
  )
  const neighbours = useMemo(() => neighboursOf(entryId, links, labels), [entryId, links, labels])
  const nodes = useMemo(() => egoLayout(neighbours), [neighbours])

  function onResolved(link: EntryLinkRow, action: 'confirm' | 'dismiss'): void {
    setLinks((current) => action === 'dismiss' ? withoutLink(current, link) : withConfirmedLink(current, link))
  }

  const confirmedCount = neighbours.filter((neighbour) => neighbour.confirmed).length
  const suggestedCount = neighbours.length - confirmedCount
  const kinds = [...new Set(nodes.map((node) => node.kind))]
  const centreLabel = truncateLabel(entryDanish, LABEL_MAX)
  const centreWidth = boxWidth(centreLabel, 26, CENTRE_MAX_WIDTH)

  return (
    <section className="composer-card synonym-card">
      <div className="composer-heading">
        <div>
          <span className="eyebrow"><Waypoints size={14} /> MEANING GRAPH</span>
          <h2>{neighbours.length ? 'What this connects to' : 'Nothing linked yet'}</h2>
          <p>
            {neighbours.length
              ? `${confirmedCount} confirmed${suggestedCount ? ` · ${suggestedCount} waiting for you` : ''}. Tap a word to open it.${
                neighbours.length > nodes.length ? ` The picture holds ${nodes.length}; all ${neighbours.length} are listed below.` : ''}`
              : entryKind === 'sentence'
                ? 'Sentences are learned whole, so Ordly does not look for synonyms of them.'
                : 'Ordly looks for synonyms right after you save an entry. Anything it finds appears here.'}
          </p>
        </div>
      </div>

      {nodes.length > 0 ? (
        <div className="synonym-graph-canvas">
          <svg
            className="synonym-graph-svg"
            viewBox={`0 0 ${EGO_GEOMETRY.width} ${EGO_GEOMETRY.height}`}
            aria-hidden="true"
            focusable="false"
          >
            {nodes.map((node) => (
              <line
                key={`edge-${node.id}-${node.kind}`}
                x1={EGO_GEOMETRY.cx}
                y1={EGO_GEOMETRY.cy}
                x2={node.x}
                y2={node.y}
                stroke={kindColor(node.kind)}
                strokeWidth={node.confirmed ? 1.9 : 1.4}
                strokeLinecap="round"
                // A dashed, faded edge for an edge nobody has confirmed: the picture must never
                // present a guess with the same weight as a fact (D4).
                strokeDasharray={node.confirmed ? undefined : '3 5'}
                opacity={node.confirmed ? 0.82 : 0.5}
              />
            ))}

            <g>
              <rect
                x={EGO_GEOMETRY.cx - centreWidth / 2}
                y={EGO_GEOMETRY.cy - CENTRE_HEIGHT / 2}
                width={centreWidth}
                height={CENTRE_HEIGHT}
                rx={CENTRE_HEIGHT / 2}
                className="synonym-node-centre"
              />
              <text x={EGO_GEOMETRY.cx} y={EGO_GEOMETRY.cy} className="synonym-node-centre-text">
                {centreLabel}
              </text>
            </g>

            {nodes.map((node) => (
              <GraphNode key={`node-${node.id}-${node.kind}`} node={node} />
            ))}
          </svg>

          {/* Real anchors over the drawing: prefetching, middle-clickable, and big enough for a
              thumb even where the drawn node is small. */}
          {nodes.map((node) => (
            <Link
              key={`hit-${node.id}-${node.kind}`}
              className={`synonym-graph-hit ${node.confirmed ? 'confirmed' : 'unconfirmed'}`}
              href={`/words/${node.id}`}
              style={{
                left: `${(node.x / EGO_GEOMETRY.width) * 100}%`,
                top: `${(node.y / EGO_GEOMETRY.height) * 100}%`,
                width: `${(boxWidth(truncateLabel(node.danish, LABEL_MAX), 18, NODE_MAX_WIDTH) / EGO_GEOMETRY.width) * 100}%`,
              }}
              aria-label={`${describe(node)}${node.confirmed ? '' : ', suggested'}: ${node.danish}`}
            />
          ))}
        </div>
      ) : (
        <div className="synonym-empty">
          <span className="synonym-empty-ring" aria-hidden="true">
            <span className="synonym-empty-centre">{truncateLabel(entryDanish, 10) || '—'}</span>
          </span>
          <p>
            {entryKind === 'sentence'
              ? 'No links. That is normal for a sentence.'
              : 'No links yet — that is normal for a new word.'}
          </p>
        </div>
      )}

      {kinds.length > 0 && (
        <div className="synonym-legend">
          {kinds.map((kind) => (
            <span className="synonym-legend-item" key={kind}>
              <i style={{ background: kindColor(kind) }} aria-hidden="true" />
              {LINK_KIND_LABELS[kind]}
            </span>
          ))}
          {nodes.some((node) => !node.confirmed) && (
            <span className="synonym-legend-item">
              <i className="dashed" aria-hidden="true" />
              Suggested, not confirmed
            </span>
          )}
        </div>
      )}

      {neighbours.length > 0 && (
        <div className="synonym-card-chips">
          <SynonymChips neighbours={neighbours} variant="page" onResolved={onResolved} />
        </div>
      )}
    </section>
  )
}

function GraphNode({ node }: { node: EgoNode }): React.JSX.Element {
  const label = truncateLabel(node.danish, LABEL_MAX)
  const width = boxWidth(label, node.confirmed ? 18 : 26, NODE_MAX_WIDTH)
  return (
    <g className={node.confirmed ? 'synonym-node confirmed' : 'synonym-node unconfirmed'}>
      <rect
        x={node.x - width / 2}
        y={node.y - NODE_HEIGHT / 2}
        width={width}
        height={NODE_HEIGHT}
        rx={NODE_HEIGHT / 2}
        stroke={kindColor(node.kind)}
        strokeDasharray={node.confirmed ? undefined : '3 3'}
      />
      <text x={node.x} y={node.y}>
        {node.confirmed ? label : `? ${label}`}
      </text>
    </g>
  )
}
