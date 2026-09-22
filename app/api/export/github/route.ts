import { createSign } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMaterialCsv, normalizeExportPracticeAttempt, normalizeExportReviewLog } from '@/lib/material-export'
import type { ReviewCard, VocabularyEntry } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const githubApi = 'https://api.github.com'
const githubApiVersion = '2022-11-28'
const repository = process.env.GITHUB_EXPORT_REPOSITORY || 'Sevastian-Bahynskyi/ordly-exercises'
const branch = process.env.GITHUB_EXPORT_BRANCH || 'main'
const exportPath = 'learning-stats.csv'

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function githubJwt(): string {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n')
  if (!appId || !privateKey) throw new Error('GitHub export is not configured.')
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(privateKey, 'base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

async function githubRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${githubApi}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': githubApiVersion,
      'User-Agent': 'Ordly Export',
      ...init.headers,
    },
    cache: 'no-store',
  })
}

async function installationToken(): Promise<string> {
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID
  if (!installationId) throw new Error('GitHub export is not configured.')
  const response = await githubRequest(`/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: { Authorization: `Bearer ${githubJwt()}` } })
  if (!response.ok) throw new Error('GitHub authentication failed.')
  const body: unknown = await response.json()
  const token = typeof body === 'object' && body !== null && 'token' in body && typeof body.token === 'string' ? body.token : null
  if (!token) throw new Error('GitHub authentication failed.')
  return token
}

function repositoryPath(): string {
  const [owner, name] = repository.split('/')
  if (!owner || !name || repository.split('/').length !== 2) throw new Error('GitHub export is not configured.')
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${exportPath}`
}

async function readAllRows(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, table: 'review_logs' | 'practice_attempts', entryIds: string[], select: string): Promise<unknown[]> {
  const rows: unknown[] = []
  const pageSize = 1_000
  for (let from = 0; ; from += pageSize) {
    const query = supabase.from(table).select(select).eq('user_id', userId).in('entry_id', entryIds).range(from, from + pageSize - 1)
    const { data, error } = await query
    if (error) throw new Error('Could not read learning history.')
    const page = Array.isArray(data) ? data : []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  try {
    const [{ data: entries, error: entriesError }, { data: cards, error: cardsError }] = await Promise.all([
      supabase.from('vocabulary_entries').select('*').eq('user_id', user.id).neq('entry_kind', 'sentence'),
      supabase.from('review_cards').select('*').eq('user_id', user.id),
    ])
    if (entriesError || cardsError) throw new Error('Could not read your material.')
    const material = (entries || []) as VocabularyEntry[]
    const entryIds = material.map((entry) => entry.id)
    if (!entryIds.length) return NextResponse.json({ error: 'Add a word or phrase before exporting.' }, { status: 400 })
    const [rawLogs, rawAttempts] = await Promise.all([
      readAllRows(supabase, user.id, 'review_logs', entryIds, 'entry_id, rating, answer_result, answer_text, previous_state, stability, difficulty, scheduled_days, reviewed_at, study_date'),
      readAllRows(supabase, user.id, 'practice_attempts', entryIds, 'entry_id, payload, created_at'),
    ])
    const csv = buildMaterialCsv({
      entries: material,
      cards: (cards || []) as ReviewCard[],
      reviewLogs: rawLogs.flatMap((row) => { const normalized = normalizeExportReviewLog(row); return normalized ? [normalized] : [] }),
      practiceAttempts: rawAttempts.flatMap((row) => { const normalized = normalizeExportPracticeAttempt(row); return normalized ? [normalized] : [] }),
    })

    const token = await installationToken()
    const path = repositoryPath()
    const existing = await githubRequest(path, { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
    let sha: string | undefined
    if (existing.ok) {
      const body: unknown = await existing.json()
      if (typeof body === 'object' && body !== null && 'sha' in body && typeof body.sha === 'string') sha = body.sha
    } else if (existing.status !== 404) {
      throw new Error('Could not access the GitHub export file.')
    }

    const upload = await githubRequest(path, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update Ordly learning stats', content: Buffer.from(csv, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) }),
    })
    if (!upload.ok) throw new Error('GitHub rejected the learning-stats upload.')
    const result: unknown = await upload.json()
    const commitUrl = typeof result === 'object' && result !== null && 'commit' in result && typeof result.commit === 'object' && result.commit !== null && 'html_url' in result.commit && typeof result.commit.html_url === 'string' ? result.commit.html_url : null
    return NextResponse.json({ path: exportPath, commitUrl })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not upload learning stats.' }, { status: 503 })
  }
}
