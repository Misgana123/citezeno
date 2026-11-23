/* The admin page's "Outside services" table: what the gateway did for each
   provider over the last day, from the hourly counts in provider_stats. */

export type ProviderCounts = Map<string, { count: number; totalMs: number }>;

export type ProviderHealthRow = { provider: string; counts: ProviderCounts; spentTodayUsd: number };

const n = (c: ProviderCounts, name: string) => c.get(name)?.count ?? 0;
const avgMs = (c: ProviderCounts, name: string) => {
  const v = c.get(name);
  return v && v.count ? v.totalMs / v.count : 0;
};
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const secs = (ms: number) => (ms ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : '—');

export function ProviderHealth({ rows, hours }: { rows: ProviderHealthRow[]; hours: number }) {
  return (
    <section className="panel" id="services" style={{ marginBottom: 22 }}>
      <div className="adm-head">
        <h2>Outside services</h2>
        <small>last {hours} hours</small>
      </div>
      {!rows.length ? (
        <p className="small">No calls to outside services yet.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Service</th>
                <th title="Answered from saved answers, without calling the service">Reused</th>
                <th title="Calls that reached the service, and their average time">Calls sent</th>
                <th title="Identical calls that shared one call already on its way">Shared</th>
                <th title="The service failed and an older saved answer was shown">Older answer shown</th>
                <th title="Callers who waited for their turn, and the average wait">Waited</th>
                <th title="Our waiting line was too long: the user was told to try again">Turned away</th>
                <th title="Failed calls; how many the service refused for going too fast (429)">Errors</th>
                <th title="Times calls were paused after repeated failures, and calls refused while paused">Paused</th>
                <th>Spent today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ provider, counts: c, spentTodayUsd }) => {
                const hits = n(c, 'cache_hit');
                const asked = hits + n(c, 'cache_miss');
                return (
                  <tr key={provider}>
                    <td>
                      <b>{provider}</b>
                    </td>
                    <td>
                      {hits.toLocaleString()} <small>{pct(hits, asked)}</small>
                    </td>
                    <td>
                      {n(c, 'call').toLocaleString()} <small>{secs(avgMs(c, 'call'))}</small>
                    </td>
                    <td>{n(c, 'shared').toLocaleString()}</td>
                    <td>{n(c, 'cache_stale').toLocaleString()}</td>
                    <td>
                      {n(c, 'waited').toLocaleString()} <small>{secs(avgMs(c, 'waited'))}</small>
                    </td>
                    <td>{(n(c, 'turned_away') + n(c, 'budget_stop')).toLocaleString()}</td>
                    <td>
                      {n(c, 'call_error').toLocaleString()} <small>{n(c, 'rate_limited') ? `${n(c, 'rate_limited')} × 429` : ''}</small>
                    </td>
                    <td>
                      {n(c, 'paused').toLocaleString()} <small>{n(c, 'paused_refused') ? `${n(c, 'paused_refused')} refused` : ''}</small>
                    </td>
                    <td>{spentTodayUsd ? `$${spentTodayUsd.toFixed(3)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
