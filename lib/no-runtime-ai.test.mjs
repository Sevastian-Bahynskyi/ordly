import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Ordly calls no model at runtime (issue #25). Paid services are allowed only in the offline
 * content pipeline (`scripts/`), never in anything the running app can load.
 *
 * "Anything the app can load" is computed, not listed: every file under `app/` and
 * `components/`, `proxy.ts` and the service worker, plus every module they import, transitively.
 * A `lib/` helper that only a script imports may name a provider; the moment a page, route or
 * component imports it, this fails.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = /\.(ts|tsx|mjs|js)$/u

/** Provider hosts, SDKs and keys. Any of these in runtime code is a model call waiting to happen. */
const PROVIDERS = [
  /openrouter/iu,
  /groq/iu,
  /deepseek/iu,
  /api\.openai\.com|from ['"]openai['"]/iu,
  /api\.anthropic\.com|@anthropic-ai\//iu,
  /generativelanguage\.googleapis\.com/iu,
  /api\.mistral\.ai|api\.cohere\.|api\.together\.xyz/iu,
  /cognitiveservices|microsofttranslator|tts\.speech\.microsoft|stt\.speech\.microsoft/iu,
  /AZURE_(SPEECH|TRANSLATOR)_/u,
  /\/api\/ai\//u,
]

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : SOURCE.test(name) ? [path] : []
  })
}

function resolveImport(from, specifier) {
  const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null
  if (!base) return null
  for (const candidate of [base, ...['.ts', '.tsx', '.mjs', '.js'].map((ext) => base + ext), ...['index.ts', 'index.tsx'].map((file) => join(base, file))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function runtimeFiles() {
  const queue = [...walk(join(root, 'app')), ...walk(join(root, 'components')), join(root, 'proxy.ts'), join(root, 'public/sw.js')]
  const seen = new Set()
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu)) {
      const target = resolveImport(file, match[1] || match[2])
      if (target) queue.push(target)
    }
  }
  return [...seen]
}

test('there is no AI route', () => {
  assert.equal(existsSync(join(root, 'app/api/ai')), false, 'app/api/ai must not exist')
})

test('nothing the app loads names a model provider, its key or an AI route', () => {
  const files = runtimeFiles()
  assert.ok(files.some((file) => file.endsWith('components/EntryEditor.tsx')), 'the import walk reaches the editor')
  assert.ok(files.some((file) => file.endsWith('lib/cor.ts')), 'the import walk follows @/ imports into lib')
  const offenders = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8')
    return PROVIDERS.filter((pattern) => pattern.test(text)).map((pattern) => `${relative(root, file)} matches ${pattern}`)
  })
  assert.deepEqual(offenders, [])
})

test('the environment template carries no model provider key', () => {
  const template = readFileSync(join(root, '.env.example'), 'utf8')
  assert.doesNotMatch(template, /OPENROUTER|GROQ|DEEPSEEK|OPENAI|ANTHROPIC/u)
})
