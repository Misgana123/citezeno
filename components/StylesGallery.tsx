'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SPECIMENS, STYLE_GROUPS, plain, specimen } from '@/lib/styles';
import { Icon } from './Icon';
import { KindSwitch, copyText } from './Specimens';

const FAMILY_NOTE: Record<string, string> = {
  'Author–date': 'Cite by surname and year in the text; the list is alphabetical.',
  Numeric: 'Cite by number in order of first use; the list is numbered.',
  Notes: 'Cite in footnotes or endnotes; a bibliography follows.',
};

export function StylesGallery() {
  const [kind, setKind] = useState<keyof typeof SPECIMENS>('article');
  return (
    <>
      <div className="gallery-bar">
        <KindSwitch kind={kind} setKind={setKind} />
      </div>
      {STYLE_GROUPS.map(([group, ids]) => (
        <section key={group} className="gallery-group">
          <div className="gallery-group-head">
            <h2 className="h3">{group}</h2>
            <p className="small">{FAMILY_NOTE[group]}</p>
          </div>
          <div className="gallery-grid">
            {ids.map((id) => {
              const sp = specimen(id, SPECIMENS[kind]);
              return (
                <article key={id} className="gcard">
                  <header>
                    <b>
                      <Link href={`/styles/${id}`} className="gcard-link">
                        {sp.style.name}
                      </Link>
                    </b>
                    <span>{sp.style.edition}</span>
                    <button
                      className="icon-btn"
                      aria-label={`Copy the ${sp.style.name} reference`}
                      onClick={() => copyText(plain(sp.entry), sp.entry)}
                    >
                      <Icon name="copy" />
                    </button>
                  </header>
                  <p className="gcard-ref" dangerouslySetInnerHTML={{ __html: sp.entry }} />
                  <p className="gcard-in">
                    <span>{sp.inTextLabel}</span>
                    <span dangerouslySetInnerHTML={{ __html: sp.style.marker === 'sup' && sp.style.family === 'numeric' ? `claim<sup>${sp.inText}</sup>` : sp.inText }} />
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
