import { ImageResponse } from 'next/og';

export const ogSize = { width: 1200, height: 630 };

/* The social-share card (Open Graph / Twitter): brand colours, a headline and a sample reference. */
export function ogCard(o: { kicker: string; title: string; sample?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px',
          background: 'linear-gradient(160deg, #133a63 0%, #0b2645 100%)', color: '#e9f1f6', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#0b2645" stroke="rgba(233,241,246,.35)" />
            <path d="M21.5 10.2A8 8 0 1 0 21.5 21.8" fill="none" stroke="#e9f1f6" strokeWidth="2.8" strokeLinecap="round" />
            <circle cx="24.2" cy="13.6" r="2.4" fill="#e2a01b" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>Citezeno</span>
          <span style={{ marginLeft: 'auto', fontSize: 24, color: '#a9c3d6' }}>{o.kicker}</span>
        </div>
        <div style={{ display: 'flex', fontSize: o.title.length > 60 ? 60 : 72, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, maxWidth: 1000 }}>{o.title}</div>
        <div
          style={{
            display: 'flex', background: '#fdfcf7', color: '#13213a', borderRadius: 10, padding: '22px 28px', fontSize: 24, lineHeight: 1.45,
            borderLeft: '8px solid #e2a01b', fontFamily: 'serif',
          }}
        >
          {o.sample ||
            'Esteva, A., Kuprel, B., … Thrun, S. (2017). Dermatologist-level classification of skin cancer with deep neural networks. Nature, 542(7639), 115–118.'}
        </div>
      </div>
    ),
    ogSize,
  );
}
