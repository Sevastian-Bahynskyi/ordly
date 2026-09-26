/**
 * Signing in to a test account on a local development server, for agents that check the app in a
 * browser (`app/dev/sign-in/route.ts`). The account and its password live only in the developer's
 * `.env.local` (`DEV_SIGN_IN_EMAIL`, `DEV_SIGN_IN_PASSWORD`); nothing here knows or stores them.
 *
 * It is closed unless every gate holds: a development server (`next build` always sets
 * `NODE_ENV=production`), a request addressed to this machine, and both variables set. There is
 * no "magic" account: a deployed app has no such route, whatever its environment holds.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface DevSignInTarget { email: string; password: string }

export function devSignInTarget(env: Readonly<Record<string, string | undefined>>, host: string | null): DevSignInTarget | null {
  if (env.NODE_ENV !== 'development' || !host) return null
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  if (!LOCAL_HOSTS.has(hostname.toLowerCase())) return null
  const email = env.DEV_SIGN_IN_EMAIL?.trim()
  const password = env.DEV_SIGN_IN_PASSWORD
  return email && password ? { email, password } : null
}

/** Where to go after signing in: a path inside the app, never another origin. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}
