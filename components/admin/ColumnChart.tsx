'use client';

import { useState } from 'react';

/* A single-series daily column chart: one hue (validated against both surfaces),
   columns capped at 24px with 4px rounded tops and a 2px gap, a hairline
   baseline, a hover tooltip on every day, and a table view for the numbers. */
export function ColumnChart({ title, unit, data }: { title: string; unit: string; data: { day: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const tick = niceMax(max);
  const fmt = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <figure className="cchart">
      <figcaption>
        <b>{title}</b>
        <span>
          {total.toLocaleString()} {unit} in the last {data.length} days
        </span>
      </figcaption>
      <div className="cchart-plot" onMouseLeave={() => setHover(null)}>
        <div className="cchart-axis" aria-hidden="true">
          <span>{tick.toLocaleString()}</span>
          <span>0</span>
        </div>
        <div className="cchart-cols" role="img" aria-label={`${title}: ${total} ${unit} over ${data.length} days, peak ${data[peak]?.value ?? 0} on ${data[peak] ? fmt(data[peak].day) : ''}`}>
          {data.map((d, i) => (
            <div key={d.day} className={`cchart-col${hover === i ? ' on' : ''}`} onMouseEnter={() => setHover(i)}>
              <span className="cchart-bar" style={{ height: d.value ? `max(2px, ${(d.value / tick) * 100}%)` : 0 }} />
              {i === peak && d.value > 0 && hover == null && (
                <span className="cchart-peak" style={{ bottom: `${(d.value / tick) * 100}%` }}>
                  {d.value.toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {hover != null && data[hover] && (
            <div className="cchart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
              <b>{data[hover].value.toLocaleString()}</b> {unit}
              <span>{fmt(data[hover].day)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="cchart-x" aria-hidden="true">
        <span>{data[0] ? fmt(data[0].day) : ''}</span>
        <span>{data.length ? fmt(data[data.length - 1].day) : ''}</span>
      </div>
      <details className="cchart-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>{unit[0].toUpperCase() + unit.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{fmt(d.day)}</td>
                <td>{d.value.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/* Round the axis top up to a clean number: 1, 2, 5 × 10ⁿ. */
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
