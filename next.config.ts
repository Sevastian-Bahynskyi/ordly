import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * `dictionary-da` reads its own `.aff`/`.dic` files relative to `import.meta.url`. Bundled into
   * a route's chunk that URL points at the chunk, not at the package, and the Danish spell check
   * (issue #5 §3) silently finds nothing. Kept external, it resolves from node_modules as usual.
   */
  serverExternalPackages: ['dictionary-da'],
}

export default nextConfig
