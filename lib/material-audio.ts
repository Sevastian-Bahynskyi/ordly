export function hasWordRecording(
  entry: { audio_path: string | null; catalog_lemma: string | null },
  catalogAudio: Readonly<Record<string, string | null>>,
): boolean {
  return Boolean(entry.audio_path?.trim() || (entry.catalog_lemma && catalogAudio[`${entry.catalog_lemma}:word`]?.trim()))
}
