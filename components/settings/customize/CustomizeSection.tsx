'use client';

import { useEffect, useRef, useState } from 'react';
import type { Skill } from '@/lib/skills/types';
import { Icon } from '../../Icon';
import { addBuiltinSkill, updateSkill, uploadSkill } from '../../skills/api';
import { reloadSkills, useSkills } from '../../skills/useSkills';
import { toast } from '../../toast';
import type { CustomizeView } from '../open';
import { SkillDetail } from './SkillDetail';

/* Customize: the ways of working the assistant can follow (skills). "Yours" is
   what you have; "Discover" is everything you can add. */

type Detail = { type: 'skill'; id: string } | { type: 'builtin'; slug: string } | { type: 'new-skill' } | null;
type Filter = 'all' | 'on' | 'off';

const FILTERS: [Filter, string][] = [
  ['all', 'All skills'],
  ['on', 'By Citezeno'],
  ['off', 'Made by you'],
];

export function CustomizeSection({ view: view0 }: { view?: CustomizeView }) {
  const [view, setView] = useState<CustomizeView>(view0 ?? 'discover');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<'add' | 'filter' | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const { catalog } = useSkills();
  const bar = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        setMenu(null);
      } else if (!bar.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close, true);
    };
  }, [menu]);

  const q = query.trim().toLowerCase();
  const matches = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));

  if (detail) return <SkillDetail detail={detail} catalog={catalog} onBack={() => setDetail(null)} onOpen={(id) => setDetail({ type: 'skill', id })} />;

  const uploadFile = async (f: File | undefined) => {
    if (!f) return;
    setMenu(null);
    try {
      const s = await uploadSkill(await f.text(), f.name);
      toast(`Skill “${s.name}” added`);
      await reloadSkills();
      setView('yours');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <section>
      <div className="st-ctabs" ref={bar}>
        <div className="st-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="true" className="is-on">
            Skills
          </button>
        </div>
        <span className="st-vsep" />
        <div className="st-seg">
          {(['yours', 'discover'] as const).map((v) => (
            <button key={v} type="button" className={view === v ? 'is-on' : undefined} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'yours' ? 'Yours' : 'Discover'}
            </button>
          ))}
        </div>
        <label className="st-cfind">
          <Icon name="search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skills" aria-label="Search skills" />
        </label>
        <div className="st-filter">
          <button type="button" className="st-ib" aria-label="Filter" aria-haspopup="menu" aria-expanded={menu === 'filter'} onClick={() => setMenu(menu === 'filter' ? null : 'filter')}>
            <Icon name="filter" />
          </button>
          {menu === 'filter' && (
            <div className="st-pop" role="menu">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  role="menuitemradio"
                  aria-checked={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setMenu(null);
                  }}
                >
                  {label}
                  {filter === f && <Icon name="check" className="st-pop-tick" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="st-filter">
          <button type="button" className="st-btn is-dark" aria-haspopup="menu" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}>
            <Icon name="plus" />
            Add
            <Icon name="chevron" style={{ transform: 'rotate(90deg)' }} />
          </button>
          {menu === 'add' && (
            <div className="st-pop" role="menu">
              <button type="button" role="menuitem" onClick={() => (setDetail({ type: 'new-skill' }), setMenu(null))}>
                <Icon name="pencil" /> Write a skill
              </button>
              <button type="button" role="menuitem" onClick={() => upload.current?.click()}>
                <Icon name="upload" /> Upload a skill (.md)
              </button>
              <button type="button" role="menuitem" onClick={() => (setView('discover'), setMenu(null))}>
                <Icon name="plus" /> Browse skills
              </button>
            </div>
          )}
          <input ref={upload} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => (uploadFile(e.target.files?.[0]), (e.target.value = ''))} />
        </div>
      </div>

      {catalog == null ? (
        <div className="st-loading">Loading…</div>
      ) : view === 'discover' ? (
        <SkillsDiscover listings={catalog.discover} filter={filter} matches={matches} onOpen={(slug) => setDetail({ type: 'builtin', slug })} />
      ) : (
        <SkillsYours skills={catalog.mine} filter={filter} matches={matches} onOpen={(id) => setDetail({ type: 'skill', id })} onBrowse={() => setView('discover')} onWrite={() => setDetail({ type: 'new-skill' })} />
      )}
    </section>
  );
}

type Matches = (...texts: string[]) => boolean;

/* A card's corner: ✓ once added, + to add. */
function Corner({ done, onAdd, label }: { done: boolean; onAdd?(): void; label: string }) {
  return done ? (
    <span className="st-plus is-done" aria-label={label}>
      <Icon name="check" />
    </span>
  ) : (
    <button
      type="button"
      className="st-plus"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onAdd?.();
      }}
    >
      <Icon name="plus" />
    </button>
  );
}

function SkillsDiscover({ listings, filter, matches, onOpen }: { listings: { slug: string; description: string; category: string; added: boolean }[]; filter: Filter; matches: Matches; onOpen(slug: string): void }) {
  const shown = filter === 'off' ? [] : listings.filter((l) => matches(l.slug, l.description, l.category));
  const add = async (slug: string) => {
    try {
      await addBuiltinSkill(slug);
      toast(`Skill “${slug}” added`);
      await reloadSkills();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <>
      <div className="st-sec">
        <h4>Top skills</h4>
        <span className="st-count">{shown.length}</span>
      </div>
      {shown.length ? (
        <div className="st-cards">
          {shown.map((l) => (
            <div key={l.slug} className="st-card is-link" role="button" tabIndex={0} onClick={() => onOpen(l.slug)} onKeyDown={(e) => e.key === 'Enter' && onOpen(l.slug)}>
              <span className="st-logo is-plain">
                <Icon name="skill" />
              </span>
              <div>
                <h5>
                  {l.slug} <Icon name="verified" className="st-ver" />
                </h5>
                <p>{l.description}</p>
                <div className="st-by">by Citezeno · {l.category}</div>
              </div>
              <Corner done={l.added} label={l.added ? 'Added' : `Add ${l.slug}`} onAdd={() => add(l.slug)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="st-empty">No skills match.</div>
      )}
    </>
  );
}

function SkillsYours({ skills, filter, matches, onOpen, onBrowse, onWrite }: { skills: Skill[]; filter: Filter; matches: Matches; onOpen(id: string): void; onBrowse(): void; onWrite(): void }) {
  const found = skills.filter((s) => matches(s.name, s.description));
  const added = filter === 'off' ? [] : found.filter((s) => s.by === 'citezeno');
  const own = filter === 'on' ? [] : found.filter((s) => s.by === 'you');
  const lab = filter === 'on' ? [] : found.filter((s) => s.by === 'lab');
  const toggle = async (s: Skill) => {
    try {
      await updateSkill(s.id, { enabled: !s.enabled });
      await reloadSkills();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const card = (s: Skill) => (
    <div key={s.id} className="st-card is-link" role="button" tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(s.id)}>
      <span className="st-logo is-plain">
        <Icon name={s.by === 'you' ? 'pencil' : s.by === 'lab' ? 'users' : 'skill'} />
      </span>
      <div>
        <h5>{s.name}</h5>
        <p>{s.description || 'Your own instructions'}</p>
        <div className="st-by">
          {s.by === 'you' ? 'by you' : s.by === 'lab' ? 'shared by your lab' : 'by Citezeno'}
          {s.uses ? ` · used in ${s.uses} message${s.uses === 1 ? '' : 's'}` : ''}
        </div>
      </div>
      {(s.by !== 'lab' || s.canEdit) && (
        <button
          type="button"
          className={`st-switch${s.enabled ? ' is-on' : ''}`}
          role="switch"
          aria-checked={s.enabled}
          aria-label={`${s.name} is on`}
          onClick={(e) => {
            e.stopPropagation();
            void toggle(s);
          }}
        />
      )}
    </div>
  );
  return (
    <>
      {filter !== 'off' && (
        <>
          <div className="st-sec">
            <h4>Added</h4>
            <span className="st-count">{added.length}</span>
          </div>
          {added.length ? (
            <div className="st-cards">{added.map(card)}</div>
          ) : (
            <div className="st-empty">
              No Citezeno skills added yet.
              <button type="button" onClick={onBrowse}>
                Browse skills
              </button>
            </div>
          )}
        </>
      )}
      {filter !== 'on' && (
        <>
          <div className="st-sec">
            <h4>Made by you</h4>
            <span className="st-count">{own.length}</span>
          </div>
          {own.length ? (
            <div className="st-cards">{own.map(card)}</div>
          ) : (
            <div className="st-empty">
              Write your own instructions, like your lab’s citation style.
              <button type="button" onClick={onWrite}>
                Write a skill
              </button>
            </div>
          )}
        </>
      )}
      {lab.length > 0 && (
        <>
          <div className="st-sec">
            <h4>Lab skills</h4>
            <span className="st-count">{lab.length}</span>
          </div>
          <div className="st-cards">{lab.map(card)}</div>
        </>
      )}
    </>
  );
}
