import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/* The brand mark as a PNG for iOS home screens and anywhere SVG icons aren't used. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#133a63' }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M21.5 10.2A8 8 0 1 0 21.5 21.8" fill="none" stroke="#e9f1f6" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M21.5 21.8c1.6-1.4 2.4-3.4 2.6-5.6" fill="none" stroke="#e2a01b" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.8 2.2" />
          <circle cx="24.2" cy="13.6" r="2.4" fill="#e2a01b" />
        </svg>
      </div>
    ),
    size,
  );
}
