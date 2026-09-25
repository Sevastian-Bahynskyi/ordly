/**
 * Supabase Storage for the catalog scripts, through the Storage REST API of the linked project.
 *
 * The CLI's `storage cp -r` appends the staging directory's name to the destination and its `rm`
 * reports success without deleting, so uploads and removals go through the API instead. The
 * service key is read from the linked CLI (`supabase projects api-keys`) in this process only:
 * never printed, never written to disk, never committed.
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

let credentials: Promise<{ url: string; key: string }> | null = null
function linked(): Promise<{ url: string; key: string }> {
  credentials ||= (async () => {
    const ref = (await readFile('supabase/.temp/project-ref', 'utf8')).trim()
    const { stdout } = await run('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { maxBuffer: 1 << 20 })
    const keys = JSON.parse(stdout.slice(stdout.indexOf('['))) as { name: string; api_key: string }[]
    const key = keys.find((entry) => entry.name === 'service_role')?.api_key
    if (!key) throw new Error('No service key for the linked project')
    return { url: `https://${ref}.supabase.co`, key }
  })()
  return credentials
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = await linked()
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${url}/storage/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers || {}) } })
    if (res.ok || attempt >= 5 || (res.status < 500 && res.status !== 429)) return res
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
}

/** Upload one object; an existing object with the same key is left alone and reported as such. */
export async function uploadObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<'uploaded' | 'exists'> {
  const res = await call(`object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' },
    body: new Uint8Array(body),
  })
  if (res.ok) return 'uploaded'
  const text = await res.text()
  if (res.status === 409 || /already exists|Duplicate/iu.test(text)) return 'exists'
  throw new Error(`upload ${key}: HTTP ${res.status} ${text.slice(0, 200)}`)
}

/** Remove objects by key, 100 per request. Returns how many the API reported removed. */
export async function removeObjects(bucket: string, keys: readonly string[]): Promise<number> {
  let removed = 0
  for (let at = 0; at < keys.length; at += 100) {
    const res = await call(`object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: keys.slice(at, at + 100) }) })
    if (!res.ok) throw new Error(`remove: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    removed += ((await res.json()) as unknown[]).length
  }
  return removed
}
