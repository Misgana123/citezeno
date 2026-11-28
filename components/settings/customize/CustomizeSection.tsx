'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectorView } from '@/lib/connectors/catalog';
import type { Skill } from '@/lib/skills/types';
import { AppLogo } from '../../connectors/AppLogo';
import { setAssistant, signInHref } from '../../connectors/actions';
import { useConnectors } from '../../connectors/useConnectors';
import { Icon } from '../../Icon';
import { addBuiltinSkill, updateSkill, uploadSkill } from '../../skills/api';
import { reloadSkills, useSkills } from '../../skills/useSkills';
import { toast } from '../../toast';
import type { CustomizeKind, CustomizeView } from '../open';
import { cardsFor, COMING_SOON, logoFor } from './cards';
import { ConnectorDetail } from './ConnectorDetail';
import { SkillDetail } from './SkillDetail';

/* Customize: the apps the assistant can reach (Connectors) and the ways of
   working it can follow (Skills). "Yours" is what you have; "Discover" is
   everything you can add. */

type Detail = { type: 'connector'; name: string; keyForm?: boolean } | { type: 'skill'; id: string } | { type: 'builtin'; slug: string } | { type: 'new-skill' } | null;
type Filter = 'all' | 'on' | 'off';

const FILTERS: Record<CustomizeKind, [Filter, string][]> = {
  connectors: [
    ['all', 'All connectors'],
    ['on', 'Connected'],
    ['off', 'Not connected'],
  ],
  skills: [
    ['all', 'All skills'],
    ['on', 'By Citezeno'],
    ['off', 'Made by you'],
  ],
};

export function CustomizeSection({ kind: kind0, view: view0 }: { kind?: CustomizeKind; view?: CustomizeView }) {
  const [kind, setKind] = useState<CustomizeKind>(kind0 ?? 'connectors');
  const [view, setView] = useState<CustomizeView>(view0 ?? 'discover');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<'add' | 'filter' | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const { connectors } = useConnectors();
  const { catalog } = useSkills();
  const bar = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => setFilter('all'), [kind]);
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

  const back = () => setDetail(null);
  if (detail?.type === 'connector') {
    const c = connectors?.find((x) => x.name === detail.name);
    if (c) return <ConnectorDetail connector={c} keyForm={detail.keyForm} onBack={back} />;
  }
  if (detail && detail.type !== 'connector') return <SkillDetail detail={detail} catalog={catalog} onBack={back} onOpen={(id) => setDetail({ type: 'skill', id })} />;

  const uploadFile = async (f: File | undefined) => {
    if (!f) return;
    setMenu(null);
    try {
      const s = await uploadSkill(await f.text(), f.name);
      toast(`Skill “${s.name}” added`);
      await reloadSkills();
      setKind('skills');
      setView('yours');
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const keyApp = connectors?.find((c) => c.apiKey);

  return (
    <section>
      <div className="st-ctabs" ref={bar}>
        <div className="st-tabs" role="tablist">
          {(['connectors', 'skills'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : undefined} onClick={() => setKind(k)}>
              {k === 'connectors' ? 'Connectors' : 'Skills'}
            </button>
          ))}
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${kind}`} aria-label={`Search ${kind}`} />
        </label>
        <div className="st-filter">
          <button type="button" className="st-ib" aria-label="Filter" aria-haspopup="menu" aria-expanded={menu === 'filter'} onClick={() => setMenu(menu === 'filter' ? null : 'filter')}>
            <Icon name="filter" />
          </button>
          {menu === 'filter' && (
            <div className="st-pop" role="menu">
              {FILTERS[kind].map(([f, label]) => (
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
              {kind === 'connectors' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => (setView('discover'), setMenu(null))}>
                    <Icon name="apps" /> Browse connectors
                  </button>
                  {keyApp && (
                    <button type="button" role="menuitem" onClick={() => (setDetail({ type: 'connector', name: keyApp.name, keyForm: true }), setMenu(null))}>
                      <Icon name="key" /> Connect {keyApp.label} with an API key
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => (setDetail({ type: 'new-skill' }), setMenu(null))}>
                    <Icon name="pencil" /> Write a skill
                  </button>
                  <button type="button" role="menuitem" onClick={() => upload.current?.click()}>
                    <Icon name="upload" /> Upload a skill (.md)
                  </button>
                  <button type="button" role="menuitem" onClick={() => (setView('discover'), setMenu(null))}>
                    <Icon name="plus" /> Browse skills
                  </button>
                </>
              )}
            </div>
          )}
          <input ref={upload} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => (uploadFile(e.target.files?.[0]), (e.target.value = ''))} />
        </div>
      </div>

      {kind === 'connectors' ? (
        connectors == null ? (
          <div className="st-loading">Loading…</div>
        ) : connectors.length === 0 ? (
          <div className="st-empty">Connecting apps isn’t set up on this site yet.</div>
        ) : view === 'discover' ? (
          <ConnectorsDiscover connectors={connectors} filter={filter} matches={matches} onOpen={(name) => setDetail({ type: 'connector', name })} />
        ) : (
          <ConnectorsYours connectors={connectors} filter={filter} matches={matches} onOpen={(name, keyForm) => setDetail({ type: 'connector', name, keyForm })} onBrowse={() => setView('discover')} />
        )
      ) : catalog == null ? (
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

const isOn = (c: ConnectorView) => c.connection?.status === 'ok';

function ConnectorsDiscover({ connectors, filter, matches, onOpen }: { connectors: ConnectorView[]; filter: Filter; matches: Matches; onOpen(name: string): void }) {
  const cards = connectors.filter((c) => filter === 'all' || (filter === 'on') === !!c.connection).flatMap((c) => cardsFor(c).map((card) => ({ card, c })));
  const shown = cards.filter(({ card }) => matches(card.title, card.description));
  const soon = filter === 'on' ? [] : COMING_SOON.filter((s) => matches(s.title, s.description));
  const connect = (c: ConnectorView) => {
    if (c.signIn) window.location.href = signInHref(c.name);
    else onOpen(c.name);
  };
  return (
    <>
      <div className="st-sec">
        <h4>Top connectors</h4>
        <span className="st-count">{shown.length}</span>
      </div>
      {shown.length ? (
        <div className="st-cards">
          {shown.map(({ card, c }) => (
            <div key={card.key} className="st-card is-link" role="button" tabIndex={0} onClick={() => onOpen(c.name)} onKeyDown={(e) => e.key === 'Enter' && onOpen(c.name)}>
              <AppLogo app={card.logo} />
              <div>
                <h5>
                  {card.title} <Icon name="verified" className="st-ver" />
                  {c.connection?.status === 'needs_reconnect' && <span className="st-tag is-bad">Connect again</span>}
                </h5>
                <p>{card.description}</p>
                <div className="st-by">{card.by}</div>
              </div>
              <Corner done={isOn(c)} label={isOn(c) ? 'Connected' : `Connect ${c.label}`} onAdd={() => connect(c)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="st-empty">No connectors match.</div>
      )}
      {soon.length > 0 && (
        <>
          <div className="st-sec">
            <h4>Coming soon</h4>
            <span className="st-count">{soon.length}</span>
          </div>
          <div className="st-cards">
            {soon.map((s) => (
              <div key={s.title} className="st-card">
                <AppLogo app={s.logo} />
                <div>
                  <h5>
                    {s.title} <span className="st-soon">Soon</span>
                  </h5>
                  <p>{s.description}</p>
                  <div className="st-by">by Citezeno</div>
                </div>
                <button type="button" className="st-plus" disabled aria-label={`${s.title} is coming soon`}>
                  <Icon name="plus" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ConnectorsYours({ connectors, filter, matches, onOpen, onBrowse }: { connectors: ConnectorView[]; filter: Filter; matches: Matches; onOpen(name: string, keyForm?: boolean): void; onBrowse(): void }) {
  const found = connectors.filter((c) => matches(c.label, c.description, ...c.services));
  const linked = filter === 'off' ? [] : found.filter((c) => c.connection);
  const open = filter === 'on' ? [] : found.filter((c) => !c.connection);
  const card = (c: ConnectorView, side: React.ReactNode, tag: React.ReactNode, sub: string, by: string) => (
    <div key={c.name} className="st-card is-link" role="button" tabIndex={0} onClick={() => onOpen(c.name)} onKeyDown={(e) => e.key === 'Enter' && onOpen(c.name)}>
      <AppLogo app={logoFor(c)} />
      <div>
        <h5>
          {c.label} {tag}
        </h5>
        <p>{sub}</p>
        <div className="st-by">{by}</div>
      </div>
      <span onClick={(e) => e.stopPropagation()}>{side}</span>
    </div>
  );
  return (
    <>
      <div className="st-sec">
        <h4>Connected</h4>
        <span className="st-count">{linked.length}</span>
      </div>
      {linked.length ? (
        <div className="st-cards">
          {linked.map((c) =>
            c.connection!.status === 'ok'
              ? card(
                  c,
                  <button type="button" className={`st-switch${c.connection!.assistant ? ' is-on' : ''}`} role="switch" aria-checked={c.connection!.assistant} aria-label={`The assistant can use ${c.label}`} title="The assistant can use it" onClick={() => setAssistant(c, !c.connection!.assistant)} />,
                  <span className="st-tag is-ok">Connected</span>,
                  c.services.length ? `${c.services.join(', ')}` : c.description,
                  c.connection!.label,
                )
              : card(
                  c,
                  c.signIn ? (
                    <a className="st-btn" href={signInHref(c.name)}>
                      Reconnect
                    </a>
                  ) : (
                    <button type="button" className="st-btn" onClick={() => onOpen(c.name, true)}>
                      Reconnect
                    </button>
                  ),
                  <span className="st-tag is-bad">Connect again</span>,
                  'The connection stopped working (access was withdrawn or expired).',
                  c.connection!.label,
                ),
          )}
        </div>
      ) : (
        <div className="st-empty">
          No apps connected yet.
          <button type="button" onClick={onBrowse}>
            Browse connectors
          </button>
        </div>
      )}
      {open.length > 0 && (
        <>
          <div className="st-sec">
            <h4>Not connected</h4>
            <span className="st-count">{open.length}</span>
          </div>
          <div className="st-cards">
            {open.map((c) =>
              card(
                c,
                c.signIn ? (
                  <a className="st-btn" href={signInHref(c.name)}>
                    Connect
                  </a>
                ) : (
                  <button type="button" className="st-btn" onClick={() => onOpen(c.name, true)}>
                    Connect
                  </button>
                ),
                null,
                c.signIn && c.apiKey ? `Sign in with ${c.label}, or paste an API key.` : c.description,
                'by Citezeno',
              ),
            )}
          </div>
        </>
      )}
    </>
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
        <Icon name={s.by === 'you' ? 'pencil' : 'skill'} />
      </span>
      <div>
        <h5>{s.name}</h5>
        <p>{s.description || 'Your own instructions'}</p>
        <div className="st-by">
          {s.by === 'you' ? 'by you' : 'by Citezeno'}
          {s.uses ? ` · used in ${s.uses} message${s.uses === 1 ? '' : 's'}` : ''}
        </div>
      </div>
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
    </>
  );
}
