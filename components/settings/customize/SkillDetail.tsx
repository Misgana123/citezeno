'use client';

import { useState } from 'react';
import { SKILL_LIMITS, type SkillCatalog } from '@/lib/skills/types';
import { confirmDialog } from '../../confirm';
import { Icon } from '../../Icon';
import { addBuiltinSkill, createSkill, removeSkill, updateSkill } from '../../skills/api';
import { reloadSkills } from '../../skills/useSkills';
import { useLab } from '../../labs/useLab';
import { toast } from '../../toast';

type Detail = { type: 'skill'; id: string } | { type: 'builtin'; slug: string } | { type: 'new-skill' };

/* One skill: a Citezeno skill (add, switch on or off, remove) or one of your
   own (write it, change it, delete it). */
export function SkillDetail({ detail, catalog, onBack, onOpen }: { detail: Detail; catalog: SkillCatalog | null; onBack(): void; onOpen(id: string): void }) {
  const mine = detail.type === 'skill' ? catalog?.mine.find((s) => s.id === detail.id) : undefined;
  const listing = detail.type === 'builtin' ? catalog?.discover.find((l) => l.slug === detail.slug) : undefined;
  const added = listing ? catalog?.mine.find((s) => s.by === 'citezeno' && s.name === listing.slug) : undefined;
  const own = detail.type === 'new-skill' || mine?.by === 'you' || (mine?.by === 'lab' && !!mine.canEdit);
  const { lab } = useLab();
  const canShare = detail.type === 'new-skill' && (lab?.role === 'owner' || lab?.role === 'admin');
  const [forLab, setForLab] = useState(false);

  const [name, setName] = useState(mine?.name ?? '');
  const [description, setDescription] = useState(mine?.description ?? '');
  const [instructions, setInstructions] = useState(mine?.instructions ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await reloadSkills();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (detail.type === 'new-skill') {
      let id = '';
      if (await run(async () => (id = (await createSkill({ name, description, instructions, ...(forLab ? { forLab: true } : {}) })).id), forLab ? 'Lab skill saved' : 'Skill saved')) onOpen(id);
    } else if (mine) await run(() => updateSkill(mine.id, { name, description, instructions }), 'Skill saved');
  };

  const remove = async (id: string, label: string, own: boolean) => {
    const ok = await confirmDialog({ title: `${own ? 'Delete' : 'Remove'} “${label}”?`, body: own ? 'Its instructions are deleted. This can’t be undone.' : 'You can add it again from Discover.', confirmLabel: own ? 'Delete' : 'Remove', danger: own });
    if (ok && (await run(() => removeSkill(id), own ? 'Skill deleted' : 'Skill removed'))) onBack();
  };

  const header = (title: string, sub: string, action?: React.ReactNode) => (
    <>
      <button type="button" className="st-back" onClick={onBack}>
        <Icon name="arrow" />
        Skills
      </button>
      <div className="st-dhead">
        <span className="st-logo is-plain">
          <Icon name={own ? 'pencil' : 'skill'} />
        </span>
        <div className="st-txt">
          <h3>{title}</h3>
          <small>{sub}</small>
        </div>
        {action}
      </div>
    </>
  );

  if (own) {
    return (
      <section>
        {header(detail.type === 'new-skill' ? 'New skill' : mine!.name, mine?.by === 'lab' ? 'A lab skill: every member of your lab can pick it in the + menu.' : 'Your own instructions. Pick the skill in the chat’s + menu to use it for a message.', mine && (
          <button type="button" className="st-btn is-danger" disabled={busy} onClick={() => remove(mine.id, mine.name, true)}>
            Delete
          </button>
        ))}
        <form onSubmit={save}>
          <label className="st-field">
            Name
            <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-lab-apa-style" maxLength={SKILL_LIMITS.nameMax + 20} required />
          </label>
          <label className="st-field">
            What it does (one line)
            <input className="st-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={SKILL_LIMITS.descriptionMax} placeholder="Formats references the way my lab asks" />
          </label>
          <label className="st-field">
            Instructions
            <textarea className="st-input" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={SKILL_LIMITS.instructionsMax} required placeholder={'Write the steps the assistant should follow, for example:\n1. Use APA 7 with the DOI as a link.\n2. Put the reference list at the end, sorted by author.'} />
          </label>
          {canShare && (
            <label className="st-check">
              <input type="checkbox" checked={forLab} onChange={(e) => setForLab(e.target.checked)} /> Share with my lab ({lab?.lab?.name}): every member sees it in the + menu
            </label>
          )}
          <div className="st-acts">
            <button type="button" className="st-btn" onClick={onBack}>
              Cancel
            </button>
            <button className="st-btn is-dark" disabled={busy || !name.trim() || !instructions.trim()}>
              {busy ? 'Saving…' : 'Save skill'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  const skill = mine ?? added;
  const slug = listing?.slug ?? mine?.name ?? '';
  const about = listing?.description ?? mine?.description ?? '';
  const category = listing?.category ?? mine?.category ?? '';
  // a lab skill a member can't change: shown as it is, nothing to switch or remove
  if (mine?.by === 'lab')
    return (
      <section>
        {header(mine.name, 'Shared by your lab. Its admins can change it.')}
        <div className="st-group">
          <h4>What it does</h4>
          <p className="st-hint" style={{ margin: 0 }}>
            {mine.description || 'Your lab’s own instructions.'}
          </p>
        </div>
        {mine.instructions && (
          <div className="st-group">
            <h4>Instructions</h4>
            <pre className="st-pre">{mine.instructions}</pre>
          </div>
        )}
      </section>
    );
  return (
    <section>
      {header(
        slug,
        `by Citezeno${category ? ` · ${category}` : ''}`,
        skill ? (
          <button type="button" className="st-btn" disabled={busy} onClick={() => remove(skill.id, slug, false)}>
            Remove
          </button>
        ) : (
          <button type="button" className="st-btn is-dark" disabled={busy || !slug} onClick={() => run(() => addBuiltinSkill(slug), `Skill “${slug}” added`)}>
            <Icon name="plus" /> Add skill
          </button>
        ),
      )}
      <div className="st-group">
        <h4>What it does</h4>
        <p className="st-hint" style={{ margin: 0 }}>
          {about}
        </p>
      </div>
      {skill && (
        <div className="st-group">
          <div className="st-box">
            <div className="st-line">
              <div className="st-txt">
                <b>Show in the + menu</b>
                <small>{skill.uses ? `Used in ${skill.uses} message${skill.uses === 1 ? '' : 's'}.` : 'Pick it in the chat’s + menu to use it for a message.'}</small>
              </div>
              <button type="button" className={`st-switch${skill.enabled ? ' is-on' : ''}`} role="switch" aria-checked={skill.enabled} aria-label={`${slug} is on`} disabled={busy} onClick={() => run(() => updateSkill(skill.id, { enabled: !skill.enabled }))} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
