import type { ReactNode } from 'react';

/* Illustrations for the landing page's "What your credits buy" tiles. */

export type CreditArtName = 'assistant' | 'research' | 'reader' | 'pdf' | 'sources' | 'free';

const ART: Record<CreditArtName, ReactNode> = {
  assistant: (
    <>
      <defs>
      <linearGradient id="buy-a1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#dcd8ff"/></linearGradient>
      <linearGradient id="buy-a2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a"/><stop offset="1" stopColor="#f6a723"/></linearGradient>
      <linearGradient id="buy-a3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9d97ff"/><stop offset="1" stopColor="#5f57d9"/></linearGradient>
      </defs>
      <path d="M22 34c0-9 7-16 16-16h44c9 0 16 7 16 16v28c0 9-7 16-16 16H54L36 94c-2 2-5 .5-5-2V78c-5-3-9-8-9-15z" fill="url(#buy-a1)"/>
      <path d="M28 30c2-5 6-7 11-7h40" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".9"/>
      <circle cx="44" cy="49" r="6.5" fill="url(#buy-a3)"/><circle cx="60" cy="49" r="6.5" fill="url(#buy-a3)"/><circle cx="76" cy="49" r="6.5" fill="url(#buy-a3)"/>
      <path d="M98 6c1.5 8 4 10.5 12 12-8 1.5-10.5 4-12 12-1.5-8-4-10.5-12-12 8-1.5 10.5-4 12-12z" fill="url(#buy-a2)"/>
      <path d="M84 26c.8 4 2 5.2 6 6-4 .8-5.2 2-6 6-.8-4-2-5.2-6-6 4-.8 5.2-2 6-6z" fill="url(#buy-a2)" opacity=".9"/>
    </>
  ),
  research: (
    <>
      <defs>
      <linearGradient id="buy-b1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#d9e9fb"/></linearGradient>
      <linearGradient id="buy-b2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd36b"/><stop offset="1" stopColor="#ee9a1a"/></linearGradient>
      <radialGradient id="buy-b3" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#ffffff" stopOpacity=".95"/><stop offset=".5" stopColor="#cfe8ff" stopOpacity=".75"/><stop offset="1" stopColor="#7cb6f5" stopOpacity=".7"/></radialGradient>
      <linearGradient id="buy-b4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b5a86"/><stop offset="1" stopColor="#13213a"/></linearGradient>
      </defs>
      <rect x="30" y="16" width="52" height="68" rx="8" fill="#c3dcf8" transform="rotate(-10 56 50)"/>
      <rect x="24" y="20" width="54" height="70" rx="8" fill="url(#buy-b1)"/>
      <rect x="33" y="31" width="30" height="5" rx="2.5" fill="#6fadf7"/>
      <rect x="33" y="42" width="36" height="4" rx="2" fill="#b9d6f6"/><rect x="33" y="51" width="28" height="4" rx="2" fill="#b9d6f6"/><rect x="33" y="60" width="32" height="4" rx="2" fill="#b9d6f6"/>
      <path d="M83 84l20 20" stroke="url(#buy-b4)" strokeWidth="11" strokeLinecap="round"/>
      <circle cx="70" cy="70" r="22" fill="url(#buy-b2)"/>
      <circle cx="70" cy="70" r="15.5" fill="url(#buy-b3)"/>
      <path d="M60 64c2-5 6-7 10-7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
    </>
  ),
  reader: (
    <>
      <defs>
      <linearGradient id="buy-c1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff8a8f"/><stop offset="1" stopColor="#d9464f"/></linearGradient>
      <linearGradient id="buy-c2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#efe7e3"/></linearGradient>
      <linearGradient id="buy-c3" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#efe7e3"/></linearGradient>
      <linearGradient id="buy-c4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd36b"/><stop offset="1" stopColor="#ee9a1a"/></linearGradient>
      </defs>
      <path d="M10 36c18-6 34-6 50 4 16-10 32-10 50-4v56c-18-6-34-6-50 4-16-10-32-10-50-4z" fill="url(#buy-c1)"/>
      <path d="M16 32c15-5 30-4 42 6v52c-12-9-27-10-42-5z" fill="url(#buy-c2)"/>
      <path d="M104 32c-15-5-30-4-42 6v52c12-9 27-10 42-5z" fill="url(#buy-c3)"/>
      <path d="M60 38v52" stroke="#e4d6d0" strokeWidth="2"/>
      <g stroke="#f2b9bb" strokeWidth="3.2" strokeLinecap="round"><path d="M24 46c9-2 18-1 26 3"/><path d="M24 56c9-2 18-1 26 3"/><path d="M24 66c9-2 18-1 20 1"/><path d="M70 49c8-4 17-5 26-3"/><path d="M70 59c8-4 17-5 26-3"/></g>
      <path d="M84 24h12v34l-6-5-6 5z" fill="url(#buy-c4)"/>
    </>
  ),
  pdf: (
    <>
      <defs>
      <linearGradient id="buy-d1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#f6e7d8"/></linearGradient>
      <linearGradient id="buy-d2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7a6b"/><stop offset="1" stopColor="#e2453a"/></linearGradient>
      <linearGradient id="buy-d3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b7fb5"/><stop offset="1" stopColor="#1d3a63"/></linearGradient>
      </defs>
      <path d="M28 14h40l22 22v62c0 5-4 9-9 9H28c-5 0-9-4-9-9V23c0-5 4-9 9-9z" fill="url(#buy-d1)"/>
      <path d="M68 14v14c0 5 3 8 8 8h14z" fill="#f0d6bd"/>
      <rect x="12" y="50" width="54" height="24" rx="7" fill="url(#buy-d2)"/>
      <text x="39" y="67.5" textAnchor="middle" style={{ fontFamily: 'var(--f-ui)' }} fontWeight="800" fontSize="15" fill="#fff" letterSpacing="1">PDF</text>
      <rect x="30" y="84" width="40" height="4" rx="2" fill="#f1d3b6"/><rect x="30" y="93" width="28" height="4" rx="2" fill="#f1d3b6"/>
      <circle cx="90" cy="88" r="18" fill="url(#buy-d3)"/>
      <path d="M90 97V80m-7 6l7-7 7 7" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </>
  ),
  sources: (
    <>
      <defs>
      <linearGradient id="buy-e1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#d4f3ee"/></linearGradient>
      <linearGradient id="buy-e2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3fd0bd"/><stop offset="1" stopColor="#14968a"/></linearGradient>
      <linearGradient id="buy-e3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd36b"/><stop offset="1" stopColor="#ee9a1a"/></linearGradient>
      </defs>
      <rect x="14" y="18" width="80" height="70" rx="20" fill="url(#buy-e1)"/>
      <path d="M30 96l6-14h16z" fill="#e6f7f4"/>
      <path d="M22 30c3-6 8-8 14-8" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M34 66V54c0-9 5-15 13-17l2 6c-4 2-6 5-6 9h6v14zm26 0V54c0-9 5-15 13-17l2 6c-4 2-6 5-6 9h6v14z" fill="url(#buy-e2)"/>
      <circle cx="94" cy="84" r="17" fill="url(#buy-e3)"/>
      <path d="M86 84l6 6 10-12" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </>
  ),
  free: (
    <>
      <defs>
      <linearGradient id="buy-f1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff8a8f"/><stop offset="1" stopColor="#e0525a"/></linearGradient>
      <linearGradient id="buy-f2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa3a7"/><stop offset="1" stopColor="#f06a72"/></linearGradient>
      <linearGradient id="buy-f3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffe27a"/><stop offset="1" stopColor="#f2a524"/></linearGradient>
      </defs>
      <rect x="20" y="52" width="80" height="54" rx="10" fill="url(#buy-f1)"/>
      <rect x="14" y="38" width="92" height="22" rx="9" fill="url(#buy-f2)"/>
      <rect x="52" y="38" width="16" height="68" fill="url(#buy-f3)"/>
      <path d="M18 44c2-3 5-4 9-4h30" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity=".7"/>
      <path d="M60 38c-6-14-26-22-28-10-2 9 16 10 28 10zm0 0c6-14 26-22 28-10 2 9-16 10-28 10z" fill="url(#buy-f3)"/>
      <circle cx="60" cy="37" r="6" fill="#f2a524"/>
    </>
  ),
};

export function CreditArt({ name }: { name: CreditArtName }) {
  return (
    <svg className="lp-tile-art" viewBox="0 0 120 120" aria-hidden="true">
      {ART[name]}
    </svg>
  );
}
