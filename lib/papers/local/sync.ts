import type { Queryable } from './types';

/* Where the background download of each source has got (table paper_sync). */

export type SyncState = { source: string; cursor: string | null; fetched: number; doneAt: Date | null; ranAt: Date | null; lastError: string | null };

export async function syncState(db: Queryable, source: string): Promise<SyncState> {
  const { rows } = await db.query<SyncState>(`select source, cursor, fetched, "doneAt", "ranAt", "lastError" from paper_sync where source = $1`, [source]);
  return rows[0] ?? { source, cursor: null, fetched: 0, doneAt: null, ranAt: null, lastError: null };
}

export async function allSyncStates(db: Queryable): Promise<SyncState[]> {
  return (await db.query<SyncState>(`select source, cursor, fetched, "doneAt", "ranAt", "lastError" from paper_sync order by source`)).rows;
}

/* `ranAt` is the job's own clock (the same one it compares with), not the database's. */
export async function saveSyncState(db: Queryable, s: SyncState, ranAt: Date = new Date()): Promise<void> {
  await db.query(
    `insert into paper_sync (source, cursor, fetched, "doneAt", "ranAt", "lastError") values ($1, $2, $3, $4, $6, $5)
     on conflict (source) do update set cursor = $2, fetched = $3, "doneAt" = $4, "ranAt" = $6, "lastError" = $5`,
    [s.source, s.cursor, s.fetched, s.doneAt, s.lastError, ranAt],
  );
}
