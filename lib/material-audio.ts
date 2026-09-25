/** Whether a saved word or phrase has a recording, its own or its catalog row's (`lemma:kind`). */
export function hasWordRecording(
  entry: { audio_path: string | null; catalog_lemma: string | null },
  catalogAudio: Readonly<Record<string, string | null>>,
  kind: 'word' | 'phrase' = 'word',
): boolean {
  return Boolean(entry.audio_path?.trim() || (entry.catalog_lemma && catalogAudio[`${entry.catalog_lemma}:${kind}`]?.trim()))
}
