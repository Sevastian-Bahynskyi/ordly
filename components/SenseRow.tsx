'use client'

import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
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
  loading: boolean
  disabled: boolean
  onGenerate: () => void
  onRegenerate: () => void
  onChange: (patch: Pick<Partial<EntrySense>, 'example' | 'example_translation'>) => void
  onClear: () => void
}

export interface SenseGrammarState {
  loading: boolean
  disabled: boolean
  onClassify: () => void
}

export function SenseRow({
  sense, index, total, isPrimary, showGrammar, allowRemove, placeholder, exampleState, grammarState,
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
  grammarState: SenseGrammarState | null
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
    ...(grammarState ? [{ label: t.sense.detectGrammar, icon: <Sparkles size={16} />, onSelect: grammarState.onClassify, disabled: grammarState.disabled }] : []),
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

          {grammarState && (
            <button
              type="button"
              className="pill pill-grammar"
              disabled={grammarState.disabled}
              onClick={grammarState.onClassify}
              aria-label={t.sense.detectFor(n)}
            >
              {grammarState.loading ? <Loader2 className="spin" size={12} /> : <Sparkles size={12} />} {t.sense.grammar}
            </button>
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

/**
 * A non-primary sense's own example (D10). It is generated only when asked for, never
 * eagerly: a word with four meanings would otherwise cost four example calls at save time.
 */
function SenseExample({ sense, index, state }: {
  sense: EntrySense
  index: number
  state: SenseExampleState
}): React.JSX.Element {
  const { t } = useI18n()
  const n = index + 1
  if (!sense.example) {
    return (
      <div className="sense-example">
        <button
          type="button"
          className="sense-example-add"
          disabled={state.disabled || !sense.text.trim()}
          onClick={state.onGenerate}
        >
          {state.loading ? <Loader2 className="spin" size={12} /> : <Sparkles size={12} />} {t.sense.exampleForMeaning}
        </button>
      </div>
    )
  }

  return (
    <div className="sense-example filled">
      <div className="sense-example-head">
        <small>{t.sense.exampleForMeaning}</small>
        <span className="sense-example-actions">
          <button type="button" className="ai-mini" disabled={state.disabled} onClick={state.onRegenerate} aria-label={t.sense.regenerateFor(n)}>
            {state.loading ? <Loader2 className="spin" size={12} /> : <RotateCcw size={12} />} {t.sense.regenerate}
          </button>
          <button type="button" className="icon-button danger" disabled={state.disabled} onClick={state.onClear} aria-label={t.sense.removeExampleFor(n)}>
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
