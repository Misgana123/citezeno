import type { Pool } from 'pg';
import type { Db } from '@/lib/shelf/db';
import { ShelfError } from '@/lib/shelf/errors';
import { memberIn, projectAccess } from './store';
import type { LabRole } from './types';

/* The shelf's lab space: a request with `x-cz-space: lab:<labId>` works on the
   lab's own shelf account instead of the user's. Members see all of it; a
   guest only the projects shared with them, through an allow-list of calls. */

export const SPACE_HEADER = 'x-cz-space';

export type LabSpace = {
  labId: string;
  shelfUserId: string;
  ownerId: string;
  role: LabRole;
  /* a guest's projects and what they may do there; null for members */
  guest: Map<string, 'view' | 'edit'> | null;
};

/* The lab a request asks for (the header, or ?space= on links that can't carry
   one), checked against the user's membership (null: their own shelf). */
export async function spaceOf(db: Db, req: Request, userId: string): Promise<LabSpace | null> {
  const raw = (req.headers.get(SPACE_HEADER) ?? new URL(req.url).searchParams.get('space'))?.trim();
  if (!raw || raw === 'personal') return null;
  const labId = raw.startsWith('lab:') ? raw.slice(4) : '';
  const m = labId ? await memberIn(db, labId, userId) : null;
  if (!m) throw new ShelfError('forbidden', 'You aren’t in that lab.');
  return { labId: m.lab.id, shelfUserId: m.lab.shelfUserId, ownerId: m.lab.ownerId, role: m.role, guest: m.role === 'guest' ? await projectAccess(db, m.lab.id, userId) : null };
}

/* A database handle that records who is acting: rows added to shelf_item get
   "addedBy" from the session setting cz.actor (lib/labs/schema.ts). One
   connection for the request, reset before it goes back to the pool. */
export async function actorDb(pool: Pool, actorId: string): Promise<{ db: Db; release(): Promise<void> }> {
  const client = await pool.connect();
  await client.query(`select set_config('cz.actor', $1, false)`, [actorId]);
  const query = client.query.bind(client) as Db['query'];
  // tx() takes a connection and releases it: here it's the same one, kept until the request ends
  const db = { query, connect: async () => ({ query, release: () => {} }) } as unknown as Db;
  return {
    db,
    async release() {
      try {
        await client.query(`select set_config('cz.actor', '', false)`);
      } finally {
        client.release();
      }
    },
  };
}

const GUEST_FORBIDDEN = 'Guests can open only the projects shared with them.';

/* What a guest may call, and on which projects. Members pass straight through. */
export async function guestGate(db: Db, space: LabSpace, req: Request): Promise<void> {
  const access = space.guest;
  if (!access) return;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/shelf/, '');
  const method = req.method.toUpperCase();
  const read = method === 'GET' || method === 'HEAD';
  const canEdit = (projectId: string | null | undefined) => !!projectId && access.get(projectId) === 'edit';
  const itemProjects = async (itemId: string) => {
    const { rows } = await db.query<{ projectId: string }>(`select ip."projectId" from shelf_item_project ip join shelf_item i on i.id = ip."itemId" where ip."itemId" = $1 and i."userId" = $2`, [itemId, space.shelfUserId]);
    return rows.map((r) => r.projectId).filter((p) => access.has(p));
  };

  // the lab's projects, folders and tags: the response is cut down to the guest's projects
  if (path === '/groups' && read) return;
  if (path === '/lookup' && read) return;
  if (path === '/saved' && read) return;
  if (path === '/papers' && read) {
    if (!access.has(url.searchParams.get('project') ?? '')) throw new ShelfError('forbidden', GUEST_FORBIDDEN);
    return;
  }
  if (path === '/papers' && method === 'POST') {
    const body = (await req.clone().json().catch(() => null)) as { projectId?: string } | null;
    if (!canEdit(body?.projectId)) throw new ShelfError('forbidden', 'You can add papers only to a project you may edit.');
    return;
  }
  const item = /^\/papers\/([^/]+)$/.exec(path)?.[1];
  if (item && (read || method === 'PATCH')) {
    const projects = await itemProjects(decodeURIComponent(item));
    if (!projects.length) throw new ShelfError('not_found', 'That paper isn’t in a project shared with you.');
    if (!read && !projects.some(canEdit)) throw new ShelfError('forbidden', 'You can only read this project.');
    // a guest edits the note and reading status, never which projects a paper is in
    if (!read) {
      const body = ((await req.clone().json().catch(() => null)) ?? {}) as Record<string, unknown>;
      if (Object.keys(body).some((k) => k !== 'note' && k !== 'readingStatus')) throw new ShelfError('forbidden', 'Guests can change a paper’s note and reading status only.');
    }
    return;
  }
  throw new ShelfError('forbidden', GUEST_FORBIDDEN);
}

/* Reading a paper from a lab's shelf: a guest may only open papers in the
   projects shared with them (reading is enough; their highlights are their own). */
export async function guestMayRead(db: Db, space: LabSpace, paperId: string): Promise<boolean> {
  if (!space.guest) return true;
  const projects = [...space.guest.keys()];
  if (!projects.length) return false;
  const { rowCount } = await db.query(
    `select 1 from shelf_item i join shelf_item_project ip on ip."itemId" = i.id where i."userId" = $1 and i."paperId" = $2 and ip."projectId" = any($3::text[]) limit 1`,
    [space.shelfUserId, paperId, projects],
  );
  return (rowCount ?? 0) > 0;
}
