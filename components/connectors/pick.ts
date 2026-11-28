'use client';

import type { FilePicker } from '@/lib/providers/connectors/types';
import { ConnectorApiError, connectorFetch } from './api';
import { browseCloudFiles } from './FileBrowser';
import { googlePick, type PickedFile } from './pickers/google';

/* Open a connected app's own file picker (Google's), or our file browser for
   apps without one (OneDrive). On Drive the chosen files become the ones
   Citezeno (and the assistant) may open. [] when the user cancels. */
export async function pickCloudFiles(connector: string, opts: { mimeTypes?: string[]; multiple?: boolean; title?: string; label?: string; logo?: string } = {}): Promise<PickedFile[]> {
  const { picker } = await connectorFetch<{ picker: FilePicker | null }>(`/api/connectors/${encodeURIComponent(connector)}/picker`);
  if (!picker) return browseCloudFiles(connector, { ...opts, label: opts.label ?? 'your files', logo: opts.logo ?? connector });
  try {
    if (picker.type === 'google-picker') return await googlePick(picker, opts);
  } catch (e) {
    throw new ConnectorApiError('unavailable', (e as Error).message);
  }
  throw new ConnectorApiError('not_set_up', 'Picking files from this app isn’t supported yet.');
}

export type { PickedFile };

/* Google's own document types, and PDFs. */
export const PICK_PDF = ['application/pdf', 'application/vnd.google-apps.document'];
