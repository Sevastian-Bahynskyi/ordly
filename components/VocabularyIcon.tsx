type VocabularyIconProps = {
  name?: string | null
  fallback?: string
  size?: number
  className?: string
}

function iconUrl(name: string) {
  const match = name.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i)
  if (!match) return ''
  const [, prefix, icon] = match
  return `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(icon)}.svg?color=%236c51c8`
}

export function VocabularyIcon({ name, fallback = '•', size = 20, className = '' }: VocabularyIconProps) {
  const src = name ? iconUrl(name) : ''

  return (
    <span
      className={`vocabulary-icon ${className}`.trim()}
      aria-hidden="true"
      style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: '0 0 auto' }}
    >
      {src
        ? <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', display: 'block' }} />
        : <span style={{ fontSize: Math.max(10, Math.round(size * 0.52)), fontWeight: 750 }}>{fallback}</span>}
    </span>
  )
}
