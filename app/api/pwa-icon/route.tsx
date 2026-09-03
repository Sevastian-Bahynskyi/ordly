import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get('size') || 512)
  const size = requested === 180 || requested === 192 || requested === 512 ? requested : 512

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(138deg, #9888ff 0%, #7558f4 34%, #5d3ee9 68%, #d865e8 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background: 'radial-gradient(circle at 23% 13%, rgba(255,255,255,.22), transparent 31%), radial-gradient(circle at 72% 72%, rgba(104,70,242,.32), transparent 44%)',
        }}
      />
      <div
        style={{
          width: '74%',
          height: '64%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'drop-shadow(0 13px 12px rgba(49, 28, 142, .28))',
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 240 190" fill="none">
          <defs>
            <linearGradient id="bookFill" x1="120" y1="25" x2="120" y2="170" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="0.62" stopColor="#FAF8FF" />
              <stop offset="1" stopColor="#E9E1FF" />
            </linearGradient>
            <linearGradient id="bookEdge" x1="24" y1="46" x2="212" y2="157" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" />
              <stop offset="0.5" stopColor="#F4EFFF" />
              <stop offset="1" stopColor="#D9CEFF" />
            </linearGradient>
          </defs>

          <path
            d="M26 48C57 40 88 45 120 67V161C90 140 57 134 26 143V48Z"
            stroke="url(#bookEdge)"
            strokeWidth="19"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M214 48C183 40 152 45 120 67V161C150 140 183 134 214 143V48Z"
            stroke="url(#bookEdge)"
            strokeWidth="19"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M120 67V161"
            stroke="url(#bookFill)"
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M27 46C58 39 89 44 120 64"
            stroke="white"
            strokeOpacity="0.68"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M213 46C182 39 151 44 120 64"
            stroke="white"
            strokeOpacity="0.68"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>,
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  )
}
