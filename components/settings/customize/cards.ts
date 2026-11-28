import type { ConnectorView } from '@/lib/connectors/catalog';

/* The cards Customize → Connectors shows. One Google sign-in covers Drive,
   Docs and Sheets, so Google gets a card per service (all open the same
   connection). Apps that aren't built yet are listed as coming soon. */

export type AppCard = { key: string; connector: string; logo: string; title: string; description: string; by: string };

const SERVICE_CARDS: Record<string, Omit<AppCard, 'key' | 'connector' | 'by'>[]> = {
  google: [
    { logo: 'drive', title: 'Google Drive', description: 'Add files from Drive to your shelf and chats, and save your work back to Drive.' },
    { logo: 'docs', title: 'Google Docs', description: 'Read Docs you pick, and save a draft as a new Doc.' },
    { logo: 'sheets', title: 'Google Sheets', description: 'Read a sheet, add your shelf as rows, or make a new sheet from a table.' },
  ],
};

export function cardsFor(c: ConnectorView): AppCard[] {
  const services = SERVICE_CARDS[c.name];
  if (services) return services.map((s) => ({ ...s, key: `${c.name}:${s.logo}`, connector: c.name, by: services.length > 1 ? 'by Citezeno · one Google sign-in' : 'by Citezeno' }));
  return [{ key: c.name, connector: c.name, logo: c.name, title: c.label, description: c.description, by: 'by Citezeno' }];
}

/* The connector's own logo (its first card's). */
export const logoFor = (c: ConnectorView) => cardsFor(c)[0].logo;

export const COMING_SOON: { logo: string; title: string; description: string }[] = [
  { logo: 'mendeley', title: 'Mendeley', description: 'Bring your Mendeley library onto the shelf.' },
  { logo: 'overleaf', title: 'Overleaf', description: 'Send a draft and its .bib straight to a LaTeX project.' },
  { logo: 'microsoft', title: 'Microsoft 365', description: 'OneDrive files, Word and Excel.' },
  { logo: 'dropbox', title: 'Dropbox', description: 'Add PDFs from Dropbox to your shelf and chats.' },
];
