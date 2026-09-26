'use client'

import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, Plus, Trash2 } from 'lucide-react'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { OverflowMenu, type OverflowMenuItem } from '@/components/OverflowMenu'
import { useI18n } from '@/components/I18nProvider'
import { PARTS_OF_SPEECH } from '@/lib/senses'
import type { EntrySense, NounGender, PartOfSpeech } from '@/lib/types'

/**
 * One meaning row of the entry editor (D2, D10): the sense text, its part of speech and gender
 * chips, reordering, removal, and — once the entry exists — its own example sentence.
 */

export interface SenseExampleState {
  onChange: (patch: Pick<Partial<EntrySense>, 'example' | 'example_translation'>) => void
  onClear: () => void
}

export function SenseRow({
  sense, index, total, isPrimary, showGrammar, allowRemove, placeholder, exampleState,
  onText, onPos, onGender, onMove, onRemove,
}: {
  sense: EntrySense
  index: number
  total: number
  isPrimary: boolean
  showGrammar: boolean
  allowRemove: boolean
  placeholder: string
  exampleState: SenseExampleState | null
  onText: (value: string) => void
  onPos: (value: PartOfSpeech | null) => void
  onGender: (value: NounGender | null) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const n = index + 1
  // Reordering and removal are rare, so they live behind ⋯ and the meaning text gets the width.
  const menuItems: (OverflowMenuItem | 'separator')[] = [
    ...(index > 0 ? [{ label: t.sense.moveUp, icon: <ArrowUp size={16} />, onSelect: () => onMove(-1) }] : []),
    ...(index < total - 1 ? [{ label: t.sense.moveDown, icon: <ArrowDown size={16} />, onSelect: () => onMove(1) }] : []),
    ...(allowRemove ? ['separator' as const, { label: t.sense.removeMeaning, icon: <Trash2 size={16} />, onSelect: onRemove, danger: true }] : []),
  ]

  return (
    <div className={`sense-row${isPrimary ? ' primary' : ''}`}>
      <div className="sense-row-main">
        <AutoGrowTextarea
          className="sense-text"
          value={sense.text}
          onChange={(e) => onText(e.target.value)}
          placeholder={placeholder}
          aria-label={t.sense.meaningAria(n)}
        />
        {menuItems.length > 0 && (
          <OverflowMenu
            items={menuItems}
            label={t.sense.moreFor(n)}
            className="sense-more"
            trigger={<Ellipsis size={18} />}
          />
        )}
      </div>

      {showGrammar && (
        <div className="sense-row-grammar">
          {/* Primary only means something when there is more than one meaning. */}
          {isPrimary && total > 1 && <span className="pill pill-primary">{t.sense.primary}</span>}
          <label className={`pill pill-pos pos-${sense.pos || 'none'}`}>
            {sense.pos ? t.pos[sense.pos] : t.sense.partOfSpeech}
            <ChevronDown size={11} aria-hidden="true" />
            {/* The native picker sits invisibly on top: the real iOS wheel, at 16px so the page
                never zooms, while the pill keeps the same size as its neighbours. */}
            <select
              value={sense.pos || ''}
              onChange={(e) => onPos(e.target.value ? (e.target.value as PartOfSpeech) : null)}
              aria-label={t.sense.posFor(n)}
            >
              <option value="">{t.sense.partOfSpeech}</option>
              {PARTS_OF_SPEECH.map((pos) => <option key={pos} value={pos}>{t.pos[pos]}</option>)}
            </select>
          </label>

          {sense.pos === 'noun' && (
            <span className="gender-chip-group" role="group" aria-label={t.sense.genderFor(n)}>
              {(['en', 'et'] as const).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  className={`gender-chip${sense.gender === gender ? ' active' : ''}`}
                  onClick={() => onGender(sense.gender === gender ? null : gender)}
                >
                  {gender}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {exampleState && (
        <SenseExample
          sense={sense}
          index={index}
          state={exampleState}
        />
      )}
    </div>
  )
}

/** A non-primary sense's own example (D10), written by the learner and shown once asked for. */
function SenseExample({ sense, index, state }: {
  sense: EntrySense
  index: number
  state: SenseExampleState
}): React.JSX.Element {
  const { t } = useI18n()
  const n = index + 1
  // An empty string is an example being written; only null has none yet.
  if (sense.example == null) {
    return (
      <div className="sense-example">
        <button
          type="button"
          className="sense-example-add"
          disabled={!sense.text.trim()}
          onClick={() => state.onChange({ example: '' })}
        >
          <Plus size={12} /> {t.sense.exampleForMeaning}
        </button>
      </div>
    )
  }

  return (
    <div className="sense-example filled">
      <div className="sense-example-head">
        <small>{t.sense.exampleForMeaning}</small>
        <span className="sense-example-actions">
          <button type="button" className="icon-button danger" onClick={state.onClear} aria-label={t.sense.removeExampleFor(n)}>
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      <textarea
        rows={2}
        className="sense-example-text"
        value={sense.example}
        onChange={(e) => state.onChange({ example: e.target.value })}
        aria-label={t.sense.exampleFor(n)}
        placeholder="Jeg synes, det er godt."
      />
      <AutoGrowTextarea
        className="sense-example-translation"
        value={sense.example_translation || ''}
        onChange={(e) => state.onChange({ example_translation: e.target.value })}
        aria-label={t.sense.exampleTranslationFor(n)}
        placeholder={t.editor.placeholders.exampleTranslation}
      />
    </div>
  )
}
