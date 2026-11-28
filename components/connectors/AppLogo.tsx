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
  google: { bg: '#4285f4', letter: 'G' },
  github: { bg: '#24292f', letter: 'G' },
  zotero: { bg: '#cc2936', letter: 'Z' },
  mendeley: { bg: '#9d1620', letter: 'M' },
  overleaf: { bg: '#47a141', letter: 'O' },
  microsoft: { bg: '#2b579a', letter: 'M' },
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
