import { redirect } from 'next/navigation'

/** Sentences now live in Material. Old links and installed bookmarks land on its Sentences filter. */
export default async function SentencesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<never> {
  const { q } = await searchParams
  redirect(q ? `/words?kind=sentences&q=${encodeURIComponent(q)}` : '/words?kind=sentences')
}
