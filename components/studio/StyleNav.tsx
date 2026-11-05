'use client';

import { useMemo } from 'react';
import { SPECIMENS, STYLES, STYLE_GROUPS, plain, specimen } from '@/lib/styles';

const GROUP_NOTE: Record<string, string> = {
  'Author–date': 'Name and year in the text',
  Numeric: 'Numbered in order of use',
  Notes: 'Footnotes and a bibliography',
};

/* Side navigation listing every citation style. */
export function StyleNav({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const example = useMemo(() => {
    const sp = specimen(value, SPECIMENS.article);
    return {
      inText: sp.style.family === 'notes' ? plain(sp.inText) : sp.style.family === 'numeric' ? `…a claim ${plain(sp.inText)}` : plain(sp.inText),
      label: sp.style.family === 'notes' ? 'First note' : 'In the text',
    };
  }, [value]);

  return (
    <nav className="snav" aria-label="Citation style">
      <div className="snav-head">
        <h2>Citation style</h2>
        <p>{STYLES[value].name}, {STYLES[value].edition}</p>
      </div>
      <div className="snav-groups">
        {STYLE_GROUPS.map(([g, ids]) => (
          <div className="snav-group" key={g}>
            <h3 title={GROUP_NOTE[g]}>{g}</h3>
            <ul>
              {ids.map((id) => (
                <li key={id}>
                  <button className="snav-item" aria-current={id === value ? 'true' : undefined} onClick={() => onChange(id)}>
                    <span className="snav-name">{STYLES[id].name}</span>
                    <span className="snav-ed">{STYLES[id].edition}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="snav-ex">
        <span>{example.label}</span>
        <p className="serif">{example.inText}</p>
      </div>
    </nav>
  );
}
