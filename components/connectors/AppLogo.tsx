/* Small marks for the apps users connect (and the ones coming), drawn here
   so there are no image files. Unknown apps get their first letter. */

type Mark = { bg: string; draw: React.ReactNode } | { bg: string; letter: string };

const MARKS: Record<string, Mark> = {
  drive: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M8.6 3h6.8l6.6 11.4h-6.8z" fill="#fbbc04" />
        <path d="M8.6 3 2 14.4l3.4 5.9L12 8.9z" fill="#188038" />
        <path d="M5.4 20.3h13.2l3.4-5.9H8.8z" fill="#1967d2" />
      </>
    ),
  },
  docs: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M6 2.5h8.5L19 7v14.5H6z" fill="#4285f4" />
        <path d="M14.5 2.5V7H19z" fill="#a1c2fa" />
        <path d="M8.5 11h7.5M8.5 14h7.5M8.5 17h5" stroke="#fff" strokeWidth="1.4" />
      </>
    ),
  },
  sheets: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M6 2.5h8.5L19 7v14.5H6z" fill="#0f9d58" />
        <path d="M14.5 2.5V7H19z" fill="#87ceac" />
        <path d="M8.5 11h7.5v7H8.5zM8.5 14.5h7.5M12.25 11v7" stroke="#fff" strokeWidth="1.3" fill="none" />
      </>
    ),
  },
  notion: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M4.5 4.2 15.8 3.3l3.7 2.6v14.2l-12 .8-3-3.8z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9 8.3v9M9 8.3l6 9M15 7.8v9.5" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  'google-calendar': {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M4.5 5.5h15v14h-15z" fill="#fff" stroke="#4285f4" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M4.5 5.5h15v3.5h-15z" fill="#4285f4" />
        <path d="M8 3.5v3.5M16 3.5v3.5" stroke="#1967d2" strokeWidth="1.6" strokeLinecap="round" />
        <text x="12" y="17.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#1967d2" fontFamily="Arial, sans-serif">31</text>
      </>
    ),
  },
  microsoft: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M3 3h8.5v8.5H3z" fill="#f25022" />
        <path d="M12.5 3H21v8.5h-8.5z" fill="#7fba00" />
        <path d="M3 12.5h8.5V21H3z" fill="#00a4ef" />
        <path d="M12.5 12.5H21V21h-8.5z" fill="#ffb900" />
      </>
    ),
  },
  outlook: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M9 5h12v14H9z" fill="#28a8ea" />
        <path d="M9 9l6 4 6-4" fill="none" stroke="#fff" strokeWidth="1.4" />
        <path d="M2.5 6.5 12 5v14l-9.5-1.5z" fill="#0364b8" />
        <ellipse cx="7.2" cy="12" rx="2.4" ry="3" fill="none" stroke="#fff" strokeWidth="1.6" />
      </>
    ),
  },
  'outlook-calendar': {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M4 5.5h16v14H4z" fill="#fff" stroke="#0364b8" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M4 5.5h16v3.5H4z" fill="#0364b8" />
        <path d="M8 12h2.5M13.5 12H16M8 15.5h2.5M13.5 15.5H16" stroke="#28a8ea" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  onedrive: {
    bg: '#ffffff',
    draw: <path d="M9.5 8.5a5 5 0 0 1 9 2.2 3.8 3.8 0 0 1 .5 7.6H6a4 4 0 0 1-.4-8 5 5 0 0 1 3.9-1.8Z" fill="#0f78d4" />,
  },
  github: {
    bg: '#24292f',
    draw: <path d="M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.43v-1.6c-2.5.54-3.03-1.07-3.03-1.07-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.07 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.32-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.39 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.5 0c1.72-1.16 2.48-.92 2.48-.92.49 1.24.18 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.43A9 9 0 0 0 12 3Z" fill="#fff" />,
  },
  slack: {
    bg: '#ffffff',
    draw: (
      <>
        <path d="M9.5 3.5a1.8 1.8 0 1 0 0 3.6h1.8V5.3a1.8 1.8 0 0 0-1.8-1.8Zm0 4.8H4.7a1.8 1.8 0 1 0 0 3.6h4.8a1.8 1.8 0 1 0 0-3.6Z" fill="#36c5f0" />
        <path d="M20.5 10.1a1.8 1.8 0 1 0-3.6 0v1.8h1.8a1.8 1.8 0 0 0 1.8-1.8Zm-4.8 0V5.3a1.8 1.8 0 1 0-3.6 0v4.8a1.8 1.8 0 1 0 3.6 0Z" fill="#2eb67d" />
        <path d="M13.9 20.5a1.8 1.8 0 1 0 0-3.6h-1.8v1.8a1.8 1.8 0 0 0 1.8 1.8Zm0-4.8h4.8a1.8 1.8 0 1 0 0-3.6h-4.8a1.8 1.8 0 1 0 0 3.6Z" fill="#ecb22e" />
        <path d="M3.5 13.9a1.8 1.8 0 1 0 3.6 0v-1.8H5.3a1.8 1.8 0 0 0-1.8 1.8Zm4.8 0v4.8a1.8 1.8 0 1 0 3.6 0v-4.8a1.8 1.8 0 1 0-3.6 0Z" fill="#e01e5a" />
      </>
    ),
  },
  todoist: {
    bg: '#e44332',
    draw: <path d="M5.5 8.5 11 11.5l7.5-4M5.5 12.5 11 15.5l7.5-4M5.5 16.5 11 19.5l7.5-4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  },
  linear: {
    bg: '#5e6ad2',
    draw: <path d="M4.2 13.6 10.4 19.8A8.2 8.2 0 0 1 4.2 13.6Zm-.2-2.5 8.9 8.9a8.2 8.2 0 0 0 1.9-.3L4.3 9.2a8 8 0 0 0-.3 1.9Zm1.2-3.6 11.3 11.3a8.3 8.3 0 0 0 1.4-1L6.2 6.1a8.3 8.3 0 0 0-1 1.4Zm2.4-2.6a8.2 8.2 0 1 1 11.5 11.5Z" fill="#fff" />,
  },
  google: { bg: '#4285f4', letter: 'G' },
  zotero: { bg: '#cc2936', letter: 'Z' },
  mendeley: { bg: '#9d1620', letter: 'M' },
  overleaf: { bg: '#47a141', letter: 'O' },
  dropbox: { bg: '#0061fe', letter: 'D' },
};

export function AppLogo({ app, size = 44, className = '' }: { app: string; size?: number; className?: string }) {
  const m = MARKS[app] ?? { bg: '#44526a', letter: (app[0] ?? '?').toUpperCase() };
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.23), background: m.bg, fontSize: Math.round(size * 0.42) } as const;
  return (
    <span className={`st-logo ${className}`} style={style} aria-hidden="true">
      {'draw' in m ? (
        <svg viewBox="0 0 24 24" style={{ width: Math.round(size * 0.62), height: Math.round(size * 0.62) }}>
          {m.draw}
        </svg>
      ) : (
        m.letter
      )}
    </span>
  );
}
