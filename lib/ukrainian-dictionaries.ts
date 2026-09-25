import nspell from 'nspell'
import type { SpellCheckers } from './ukrainian'

/**
 * Ukrainian and Russian Hunspell dictionaries for the Ukrainian language check (issue #24).
 *
 * Offline pipeline only: scripts and tests import this, the app never does. `dictionary-uk`
 * (GPL-3.0) and `dictionary-ru` (BSD-3-Clause) are dev dependencies, used as tools and never
 * shipped. Building both takes a few seconds, so it happens once per process.
 */
let loaded: Promise<SpellCheckers> | null = null

/** Hunspell morphological fields confuse nspell; the word and its flags are all it needs. */
function clean(dic: Uint8Array): Buffer {
  return Buffer.from(Buffer.from(dic).toString('utf8').split('\n').map((line) => line.split(/[ \t]/)[0]).join('\n'))
}

async function build(): Promise<SpellCheckers> {
  const [{ default: uk }, { default: ru }] = await Promise.all([import('dictionary-uk'), import('dictionary-ru')])
  const ukrainian = nspell(Buffer.from(uk.aff), clean(uk.dic))
  const russian = nspell(Buffer.from(ru.aff), clean(ru.dic))
  return { uk: (word) => ukrainian.correct(word), ru: (word) => russian.correct(word) }
}

export function loadUkrainianCheckers(): Promise<SpellCheckers> {
  loaded ??= build()
  return loaded
}
