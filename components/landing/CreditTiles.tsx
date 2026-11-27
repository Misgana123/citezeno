import { Archivo, Dancing_Script } from 'next/font/google';
import { CreditArt, type CreditArtName } from './CreditArt';
import './credit-tiles.css';

/* the tiles' own type, loaded only where the tiles are: a script for titles, a wide grotesque for the rest */
const script = Dancing_Script({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-script', display: 'swap' });
const wide = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-wide', display: 'swap' });

/* what credits pay for, in plain words; the app shows what an action will cost right before it runs */
const BUYS: [CreditArtName, string, string, string, string][] = [
  ['assistant', 'blue', 'Assistant', 'Answers', 'Each answer with its searches and steps. Lighter models use fewer credits.'],
  ['research', 'amber', 'Deep research', 'Reports', 'A full report with numbered sources. You see the estimate and confirm first.'],
  ['reader', 'wash', 'Paper reader', 'Help with papers', 'Summaries, questions and explanations. A summary that already exists is free.'],
  ['pdf', 'amber', 'Your PDFs', 'Ready to question', 'Each upload is prepared once so you can ask it anything.'],
  ['sources', 'wash', 'Sources', 'For your claims', 'Trace a draft in the studio, or “Cite this claim”. The cost is shown first.'],
  ['free', 'blue', 'Free', 'Always', 'Styles, editing, exports, imports, citation checks, share links and reading.'],
];

export function CreditTiles() {
  return (
    <ul className={`lp-tiles ${script.variable} ${wide.variable}`}>
      {BUYS.map(([art, tone, title, sub, body]) => (
        <li key={art} className={`lp-tile t-${tone}`}>
          <span className="lp-tile-ring" />
          <b>{title}</b>
          <em>{sub}</em>
          <p>{body}</p>
          <CreditArt name={art} />
        </li>
      ))}
    </ul>
  );
}
