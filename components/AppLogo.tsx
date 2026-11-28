/* Small marks for the accounts people sign in with (Settings → Security),
   drawn here so there are no image files. Others get their first letter. */

type Mark = { bg: string; draw: React.ReactNode } | { bg: string; letter: string };

const MARKS: Record<string, Mark> = {
  github: {
    bg: '#24292f',
    draw: <path d="M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.43v-1.6c-2.5.54-3.03-1.07-3.03-1.07-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.07 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.32-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.08-2.39 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.5 0c1.72-1.16 2.48-.92 2.48-.92.49 1.24.18 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.43A9 9 0 0 0 12 3Z" fill="#fff" />,
  },
  google: { bg: '#4285f4', letter: 'G' },
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
