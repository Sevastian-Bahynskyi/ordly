import { splitDefiniteForm } from '@/lib/cor'
import type { NounGender } from '@/lib/types'

/**
 * A noun in its definite singular, with the article that carries the gender tinted: `gulv` is
 * shown as `gulvet`, with the `et` in the noun blue.
 *
 * `en`/`et` printed beside a word is a label a learner has to remember separately. The definite
 * form is the word itself, and Danish puts the article on the end of it, so this teaches the
 * gender by showing it in use. The form comes from COR (`fetchCorDefiniteForms`), never from
 * appending an article: `menneske` becomes `mennesket`, not `menneskeet`.
 */
export function DefiniteNoun({ definite, gender }: { definite: string; gender: NounGender }): React.JSX.Element | null {
  const split = splitDefiniteForm(definite, gender)
  if (!split) return null
  return (
    <span className="definite-noun" lang="da" title={`${gender} ${split.stem}`}>
      {split.stem}<b>{split.article}</b>
    </span>
  )
}
