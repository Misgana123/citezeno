import type { ShareTheme } from '@/lib/share-themes';

/* Small wireframe of each design for the picker, in the brand palette. */
const P = { ground: '#e8ece9', sheet: '#fafbf8', ink: '#13213a', ink3: '#8c98ad', rule: '#cbd3d5', blue: '#133a63', deep: '#0b2645', navy: '#0a1a2d', card: '#0f233a', saffron: '#e2a01b', verify: '#2e7d5b', paper: '#f6f5f0', wash: '#9dc2d4' };

type Num = number | string;
const Lines = ({ x, y, w, n, gap = 5, c = P.rule, h = 2 }: { x: Num; y: Num; w: Num; n: number; gap?: number; c?: string; h?: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <rect key={i} x={Number(x)} y={Number(y) + i * gap} width={i === n - 1 ? Number(w) * 0.6 : Number(w)} height={h} rx={1} fill={c} />
    ))}
  </>
);

export function ThemeThumb({ id }: { id: ShareTheme }) {
  const common = { viewBox: '0 0 160 100', 'aria-hidden': true as const, focusable: 'false' as const };
  switch (id) {
    case 'reading':
      return (
        <svg {...common}>
          <rect width="160" height="100" fill={P.ground} />
          <rect width="160" height="9" fill={P.sheet} />
          <rect x="54" y="17" width="52" height="4" rx="2" fill={P.ink} />
          <rect x="64" y="24" width="32" height="2.5" rx="1" fill={P.ink3} />
          <rect x="18" y="34" width="80" height="60" rx="4" fill={P.sheet} />
          <rect x="26" y="42" width="10" height="10" rx="1" fill={P.blue} />
          <Lines x="40" y="43" w="48" n={3} />
          <Lines x="26" y="60" w="62" n={6} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="106" y={34 + i * 20} width="36" height="16" rx="3" fill={P.sheet} />
              <circle cx="112" cy={41 + i * 20} r="2.5" fill={P.blue} />
              <Lines x="117" y={38 + i * 20} w="20" n={2} gap={4} />
            </g>
          ))}
        </svg>
      );
    case 'dossier':
      return (
        <svg {...common}>
          <rect width="160" height="100" fill={P.ground} />
          <rect width="160" height="46" fill={P.deep} />
          <rect x="14" y="12" width="60" height="5" rx="2" fill="#fff" />
          <rect x="14" y="20" width="44" height="2.5" rx="1" fill={P.wash} />
          <rect x="14" y="29" width="10" height="5" rx="1" fill="#7fd3a8" />
          <rect x="28" y="29" width="8" height="5" rx="1" fill="#fff" opacity=".8" />
          <rect x="40" y="29" width="8" height="5" rx="1" fill="#fff" opacity=".8" />
          <rect x="112" y="26" width="34" height="8" rx="4" fill="none" stroke={P.wash} strokeWidth="1" />
          <rect x="16" y="40" width="80" height="54" rx="3" fill={P.sheet} />
          <rect x="24" y="48" width="64" height="40" fill="#fff" />
          <Lines x="30" y="54" w="52" n={6} gap={5} />
          <rect x="104" y="40" width="42" height="54" rx="3" fill={P.sheet} />
          <circle cx="114" cy="50" r="6" fill="none" stroke={P.verify} strokeWidth="2.5" />
          <Lines x="124" y="47" w="16" n={2} gap={4} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Lines x="110" y={62 + i * 10} w="28" n={1} />
              <rect x="110" y={66 + i * 10} width="18" height="1.5" rx="1" fill={P.wash} />
            </g>
          ))}
        </svg>
      );
    case 'cyanotype':
      return (
        <svg {...common}>
          <defs>
            <radialGradient id="cyg" cx="25%" cy="0%" r="80%">
              <stop offset="0" stopColor="#2b5a8a" />
              <stop offset="1" stopColor={P.deep} />
            </radialGradient>
          </defs>
          <rect width="160" height="100" fill={P.ground} />
          <rect width="160" height="64" fill="url(#cyg)" />
          <rect x="60" y="10" width="40" height="5" rx="2.5" fill="none" stroke={P.wash} strokeWidth="1" />
          <rect x="34" y="21" width="92" height="6" rx="2" fill="#fff" />
          <rect x="50" y="30" width="60" height="2.5" rx="1" fill={P.wash} />
          <path d="M0,46 C40,34 80,52 120,42 S150,38 160,44" fill="none" stroke={P.saffron} strokeWidth="1" strokeDasharray="3 3" />
          <rect x="44" y="40" width="72" height="8" rx="4" fill="#1a3f66" stroke={P.wash} strokeWidth=".6" />
          <rect x="34" y="52" width="92" height="48" rx="2" fill="#fff" />
          <rect x="34" y="52" width="92" height="1.5" fill={P.saffron} />
          <Lines x="44" y="62" w="72" n={6} gap={5.5} />
        </svg>
      );
    case 'monograph':
      return (
        <svg {...common}>
          <rect width="160" height="100" fill={P.paper} />
          <rect x="0" y="12" width="160" height=".6" fill={P.rule} />
          <Lines x="12" y="22" w="26" n={3} gap={6} c={P.ink3} h={1.5} />
          <rect x="12" y="42" width="26" height=".6" fill={P.rule} />
          <Lines x="12" y="48" w="26" n={4} gap={5} c={P.rule} h={1.2} />
          <rect x="52" y="20" width="84" height="7" rx="1" fill="none" stroke={P.ink} strokeWidth="1.2" />
          <rect x="52" y="30" width="54" height="6" rx="1" fill="none" stroke={P.ink} strokeWidth="1.2" />
          <rect x="52" y="46" width="84" height=".8" fill={P.ink} />
          <Lines x="52" y="54" w="54" n={7} gap={5} />
          <rect x="112" y="54" width=".8" height="22" fill={P.rule} />
          <Lines x="116" y="55" w="20" n={4} gap={4} c={P.ink3} h={1.2} />
        </svg>
      );
    case 'threads':
      return (
        <svg {...common}>
          <rect width="160" height="100" fill={P.navy} />
          <rect x="0" y="0" width="160" height="12" fill="#0e2136" />
          <rect x="8" y="4" width="40" height="3" rx="1.5" fill="#e4ecf2" />
          <rect x="12" y="20" width="78" height="80" rx="3" fill="#fbfaf6" />
          <Lines x="20" y="28" w="62" n={8} gap={6} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="108" y={22 + i * 24} width="40" height="18" rx="3" fill={P.card} stroke="#1a3149" strokeWidth=".8" />
              <rect x="108" y={26 + i * 24} width="1.5" height="10" rx="1" fill={P.saffron} />
              <Lines x="114" y={26 + i * 24} w="28" n={2} gap={4} c="#7489a0" />
              <rect x="114" y={35 + i * 24} width="22" height="1.5" rx="1" fill={P.saffron} />
              <path d={`M74,${34 + i * 18} L90,${34 + i * 18} C98,${34 + i * 18} 100,${31 + i * 24} 108,${31 + i * 24}`} fill="none" stroke={P.saffron} strokeWidth={1.8 - i * 0.4} opacity=".85" />
            </g>
          ))}
        </svg>
      );
  }
}
