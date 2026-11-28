import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Capability } from '@/lib/providers/connectors/types';

/* The cards Customize → Connectors shows. One Google sign-in covers Drive,
   Docs and Sheets, so Google gets a card per service (all open the same
   connection), and so does Microsoft 365. Apps that aren't built yet are listed as coming soon. */

export type AppCard = { key: string; connector: string; logo: string; title: string; description: string; by: string };

type Service = { logo: string; title: string; description: string; caps: Capability[] };

/* Apps where one sign-in covers several services, a card each. */
const SERVICE_CARDS: Record<string, { by: string; services: Service[] }> = {
  google: {
    by: 'by Citezeno · one Google sign-in',
    services: [
      { logo: 'drive', title: 'Google Drive', description: 'Add files from Drive to your shelf and chats, and save your work back to Drive.', caps: ['files'] },
      { logo: 'docs', title: 'Google Docs', description: 'Read Docs you pick, and save a draft as a new Doc.', caps: ['documents'] },
      { logo: 'sheets', title: 'Google Sheets', description: 'Read a sheet, add your shelf as rows, or make a new sheet from a table.', caps: ['sheets'] },
    ],
  },
  microsoft: {
    by: 'by Citezeno · one Microsoft sign-in',
    services: [
      { logo: 'outlook', title: 'Outlook mail', description: 'Find and read emails and attachments, and write drafts you send yourself.', caps: ['mail'] },
      { logo: 'outlook-calendar', title: 'Outlook calendar', description: 'See your events and free time, and add events to your calendar.', caps: ['calendar'] },
      { logo: 'onedrive', title: 'OneDrive', description: 'Add files from OneDrive to your shelf and chats, and save your work to OneDrive.', caps: ['files'] },
    ],
  },
};

export function cardsFor(c: ConnectorView): AppCard[] {
  const group = SERVICE_CARDS[c.name];
  if (group) return group.services.map((s) => ({ key: `${c.name}:${s.logo}`, connector: c.name, logo: s.logo, title: s.title, description: s.description, by: group.by }));
  return [{ key: c.name, connector: c.name, logo: c.name, title: c.label, description: c.description, by: 'by Citezeno' }];
}

/* The connector's own logo (its first card's). */
export const logoFor = (c: Pick<ConnectorView, 'name'>) => {
  const group = SERVICE_CARDS[c.name];
  return group ? (c.name === 'microsoft' ? 'microsoft' : group.services[0].logo) : c.name;
};

/* What to call an app for one capability ("Google Drive" / "OneDrive" for files), and its logo. */
export function serviceFor(c: Pick<ConnectorView, 'name' | 'label'>, cap: Capability): { title: string; logo: string } {
  const s = SERVICE_CARDS[c.name]?.services.find((x) => x.caps.includes(cap));
  return s ? { title: s.title, logo: s.logo } : { title: c.label, logo: c.name };
}

export const COMING_SOON: { logo: string; title: string; description: string }[] = [
  { logo: 'mendeley', title: 'Mendeley', description: 'Bring your Mendeley library onto the shelf.' },
  { logo: 'overleaf', title: 'Overleaf', description: 'Send a draft and its .bib straight to a LaTeX project.' },
  { logo: 'dropbox', title: 'Dropbox', description: 'Add PDFs from Dropbox to your shelf and chats.' },
];
