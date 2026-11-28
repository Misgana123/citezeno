import type { Capability } from '@/lib/providers/connectors/types';

/* What the assistant may do with a connected app, per kind of action:
   always, after asking the user, or never (its tools aren't offered).
   Set per connection in Settings → Customize → Connectors. */

export type Permission = 'allow' | 'ask' | 'never';
export type ActionKind = 'read' | 'write';
export const PERMISSIONS = ['allow', 'ask', 'never'] as const satisfies readonly Permission[];

/* Reading is allowed and changes ask first, until the user says otherwise. */
export const DEFAULT_PERMISSION: Record<ActionKind, Permission> = { read: 'allow', write: 'ask' };

export type PermissionKey = `${Capability}.${ActionKind}`;

/* Each kind of action the assistant has tools for, as Settings lists it. */
export const PERMISSION_ROWS: Record<Capability, Partial<Record<ActionKind, { label: string; hint: string }>>> = {
  files: { read: { label: 'Read files', hint: 'Search, open and quote the files you picked' }, write: { label: 'Save files', hint: 'Save a file from the chat to your storage' } },
  documents: { write: { label: 'Make documents', hint: 'Save a draft as a new document' } },
  sheets: { read: { label: 'Read spreadsheets', hint: 'Open and quote a sheet you picked' }, write: { label: 'Change spreadsheets', hint: 'Add rows, or make a new sheet' } },
  pages: { read: { label: 'Read pages', hint: 'Search and read the pages you shared' }, write: { label: 'Write pages', hint: 'Make pages and add rows to databases' } },
  references: { read: { label: 'Read your library', hint: 'Search references and collections' }, write: { label: 'Import and add references', hint: 'Import onto your shelf, or add papers to your library' } },
};

export const permissionKey = (cap: Capability, kind: ActionKind): PermissionKey => `${cap}.${kind}`;

/* The setting for one kind of action (the default when the user never changed it). */
export function permissionOf(saved: Readonly<Record<string, string>> | null | undefined, cap: Capability, kind: ActionKind): Permission {
  const v = saved?.[permissionKey(cap, kind)];
  return v === 'allow' || v === 'ask' || v === 'never' ? v : DEFAULT_PERMISSION[kind];
}

/* The rows for an app's capabilities, with this connection's settings. */
export function permissionRows(caps: readonly Capability[], saved: Readonly<Record<string, string>> | null | undefined) {
  return caps.flatMap((cap) =>
    (['read', 'write'] as const).flatMap((kind) => {
      const row = PERMISSION_ROWS[cap]?.[kind];
      return row ? [{ key: permissionKey(cap, kind), ...row, value: permissionOf(saved, cap, kind) }] : [];
    }),
  );
}

export type PermissionRow = ReturnType<typeof permissionRows>[number];

/* Only known keys and values are kept. */
export function cleanPermissions(input: Record<string, unknown>): Record<string, Permission> {
  const out: Record<string, Permission> = {};
  for (const [k, v] of Object.entries(input)) {
    const [cap, kind] = k.split('.') as [Capability, ActionKind];
    if (PERMISSION_ROWS[cap]?.[kind] && (v === 'allow' || v === 'ask' || v === 'never')) out[k] = v;
  }
  return out;
}
