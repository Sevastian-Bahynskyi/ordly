import { ImageResponse } from 'next/og'

export const size = {
  width: 512,
  height: 512,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #9a82ef 0%, #7557db 58%, #c77eaf 100%)',
        }}
      >
        <svg width="330" height="330" viewBox="0 0 512 512" fill="none">
          <path d="M111 157c54-14 101-2 145 30v198c-43-31-91-42-145-29V157Z" stroke="white" strokeWidth="27" strokeLinejoin="round"/>
          <path d="M401 157c-54-14-101-2-145 30v198c43-31 91-42 145-29V157Z" stroke="white" strokeWidth="27" strokeLinejoin="round"/>
          <path d="M256 187v198" stroke="white" strokeWidth="27" strokeLinecap="round"/>
        </svg>
      </div>
    ),
    size,
  )
}
