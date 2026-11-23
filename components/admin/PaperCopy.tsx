import { timeAgo } from '@/lib/library';

/* The admin page's "Paper copy" panel: how big our own copy of papers is
   against its limits, and how far each background download has got. */

export type CopyDownload = { source: string; target: number; fetched: number; done: boolean; ranAt: number | null; lastError: string | null };

export type PaperCopyStats = { enabled: boolean; searchFirst: boolean; rows: number; liveBytes: number; maxRows: number; maxBytes: number; downloads: CopyDownload[] };

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024).toLocaleString()} MB`;

export function PaperCopy({ stats: s }: { stats: PaperCopyStats }) {
  return (
    <section className="panel" id="paper-copy" style={{ marginBottom: 22 }}>
      <div className="adm-head">
        <h2>Paper copy</h2>
        <small>{s.enabled ? (s.searchFirst ? 'kept and searched first' : 'kept; not searched first (PAPERS_LOCAL_FIRST)') : 'off (PAPERS_LOCAL_COPY)'}</small>
      </div>
      <p className="small">
        {s.rows.toLocaleString()} papers of at most {s.maxRows.toLocaleString()} · {mb(s.liveBytes)} of {mb(s.maxBytes)}
      </p>
      {s.downloads.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Downloaded</th>
                <th>Status</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {s.downloads.map((d) => (
                <tr key={d.source}>
                  <td>
                    <b>{d.source}</b>
                  </td>
                  <td>
                    {d.fetched.toLocaleString()} <small>of {d.target.toLocaleString()}</small>
                  </td>
                  <td>{d.lastError ? <small title={d.lastError}>failed last time: {d.lastError.slice(0, 80)}</small> : d.done ? 'complete, topping up' : d.ranAt ? 'downloading' : 'waiting'}</td>
                  <td>{d.ranAt ? timeAgo(d.ranAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
