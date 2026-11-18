import type { ShareTheme } from '@/lib/share-themes';
import type { ShareView } from '@/lib/share-view';
import { LinkHighlights } from './LinkHighlights';
import type { ToolsProps } from './ShareControls';
import { Cyanotype, Dossier, Monograph, Reading, Threads, type ThemeProps } from './themes';

const THEMES: Record<ShareTheme, (p: ThemeProps) => React.JSX.Element> = {
  dossier: Dossier,
  reading: Reading,
  cyanotype: Cyanotype,
  monograph: Monograph,
  threads: Threads,
};

/* A shared trace in one of the designs. The same component serves the public
   page (server-rendered) and the live preview in the share dialog. */
export function SharedTrace({ theme, view, tools }: { theme: ShareTheme; view: ShareView; tools: ToolsProps }) {
  const Theme = THEMES[theme] || Dossier;
  return (
    <LinkHighlights className="sh" data-sh={theme}>
      <Theme v={view} tools={tools} />
    </LinkHighlights>
  );
}
