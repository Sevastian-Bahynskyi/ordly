import Link from 'next/link'

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Ordly home">
      <span className="brand-mark">ø</span>
      <span>ordly</span>
    </Link>
  )
}
