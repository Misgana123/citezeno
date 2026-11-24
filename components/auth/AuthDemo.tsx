'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '../Icon';

/* The sign-in and sign-up pages' right side: a short, quiet demo of the
   research assistant, played by a pointer in a small window of the app. It
   asks a question, runs a deep research (plan, searches, reading, references),
   answers with citations, opens a cited paper, asks it to save papers to the
   shelf, and shares the chat. It loops; with reduced motion, or on small
   screens where it is hidden, it doesn't play. Nothing here is live data. */

const CAPTIONS = [
  'Ask a research question in your own words.',
  'It plans, searches papers and the web, and reads them in full.',
  'Every claim is cited. Open the paper to see the passage.',
  'Ask it to keep papers on your shelf.',
  'Share a read-only link to the chat.',
];

const STEPS: { run: string; did: string; about: string; meta: string; icon: 'search' | 'globe' | 'book' | 'map' | 'shield' }[] = [
  { run: 'Searching papers for “AI use and critical thinking”', did: 'Searched papers', about: 'AI use and critical thinking', meta: '1,284 papers', icon: 'search' },
  { run: 'Searching the web for “cognitive offloading study 2025”', did: 'Searched the web', about: 'cognitive offloading study 2025', meta: '6 results', icon: 'globe' },
  { run: 'Reading 3 papers', did: 'Read 3 papers', about: 'Gerlich 2025 · Zhai 2024 · Lee 2025', meta: 'full text', icon: 'book' },
  { run: 'Tracing the references of “AI Tools in Society”', did: 'Traced the references', about: 'of “AI Tools in Society”', meta: '41 papers', icon: 'map' },
  { run: 'Checking retraction notices', did: 'Checked retractions', about: '3 cited papers', meta: 'none retracted', icon: 'shield' },
];

const PLAN = ['Does AI use change critical thinking?', 'Who is affected most?', 'Is the effect lasting?'];

const QUESTION = 'How does using AI affect critical thinking?';
const FOLLOW_UP = 'Save the first two to my shelf';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AuthDemo() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = root.current;
    if (!panel) return;
    const q = (k: string) => panel.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
    const all = (k: string) => [...panel.querySelectorAll<HTMLElement>(`[data-k="${k}"]`)];
    // the pointer moves over the stage; positions are measured from it
    const box = q('stage');
    const cur = q('cursor');
    const caption = q('caption');
    let alive = true;
    const pause = async (ms: number) => {
      await wait(ms);
      if (!alive) throw new Error('stopped');
    };

    const show = (k: string, on = true) => all(k).forEach((el) => el.classList.toggle('is-on', on));
    const scene = (i: number) => (caption.textContent = CAPTIONS[i]);
    const at = (el: HTMLElement) => {
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
    };
    const point = async (el: HTMLElement) => {
      const p = at(el);
      cur.style.transform = `translate(${p.x - 3}px, ${p.y - 2}px)`;
      await pause(850);
    };
    const click = async (el: HTMLElement) => {
      await point(el);
      cur.classList.add('is-down');
      const p = at(el);
      const ripple = document.createElement('span');
      ripple.className = 'ad-ripple';
      ripple.style.left = `${p.x}px`;
      ripple.style.top = `${p.y}px`;
      box.append(ripple);
      setTimeout(() => ripple.remove(), 520);
      await pause(140);
      cur.classList.remove('is-down');
      await pause(220);
    };
    const type = async (text: string) => {
      const field = q('typed');
      field.textContent = '';
      for (const ch of text) {
        field.textContent += ch;
        await pause(36);
      }
    };
    const toast = async (k: string) => {
      show(k);
      await pause(1900);
      show(k, false);
    };
    // the chat's content slides up so its newest part is in view
    const scrollChat = () => {
      const flow = q('flow');
      const off = Math.max(0, flow.scrollHeight - q('chat').clientHeight);
      flow.style.transform = `translateY(${-off}px)`;
    };
    const step = (i: number, state: 'run' | 'done' | 'off') => {
      const row = q(`step-${i}`);
      row.classList.toggle('is-on', state !== 'off');
      row.classList.toggle('is-done', state === 'done');
    };

    const reset = () => {
      panel.querySelectorAll('.is-on, .is-done, .is-open, .is-focus').forEach((el) => el.classList.remove('is-on', 'is-done', 'is-open', 'is-focus'));
      q('typed').textContent = '';
      q('title').textContent = 'New chat';
      q('flow').style.transform = '';
      cur.style.transform = 'translate(440px, 400px)';
    };

    const play = async () => {
      show('veil');
      await pause(450);
      reset();
      await pause(300);
      show('veil', false);
      await pause(600);

      // 1 · ask, with deep research on
      scene(0);
      await click(q('input'));
      q('input').classList.add('is-focus');
      await type(QUESTION);
      await click(q('deep'));
      show('deep');
      await click(q('send'));
      q('input').classList.remove('is-focus');
      q('typed').textContent = '';
      show('user');

      // 2 · the research: its plan, then each step runs and is ticked off
      scene(1);
      await pause(400);
      show('work');
      show('plan');
      await pause(900);
      for (let i = 0; i < STEPS.length; i++) {
        step(i, 'run');
        if (i < PLAN.length) q(`plan-${i}`).classList.add('is-on');
        await pause(i === 2 ? 1500 : 1050);
        step(i, 'done');
        if (i < PLAN.length) q(`plan-${i}`).classList.add('is-done');
        await pause(220);
      }
      q('title').textContent = 'AI and critical thinking';
      show('work-done');
      await pause(500);

      // 3 · the cited answer, and the paper behind a citation
      scene(2);
      show('answer');
      await pause(500);
      scrollChat();
      await pause(1600);
      await click(q('read'));
      q('pdf').classList.add('is-open');
      await pause(3200);
      await click(q('pdf-close'));
      q('pdf').classList.remove('is-open');
      await pause(500);

      // 4 · the assistant saves papers when asked
      scene(3);
      await click(q('input'));
      q('input').classList.add('is-focus');
      show('deep', false);
      await type(FOLLOW_UP);
      await click(q('send'));
      q('input').classList.remove('is-focus');
      q('typed').textContent = '';
      show('user-2');
      await pause(200);
      scrollChat();
      await pause(500);
      show('save-step');
      await pause(1300);
      q('save-step').classList.add('is-done');
      show('save-reply');
      scrollChat();
      await toast('saved');

      // 5 · share a link
      scene(4);
      await click(q('share'));
      q('pop').classList.add('is-open');
      await pause(500);
      await click(q('switch'));
      show('switch');
      show('link');
      await pause(400);
      await click(q('copy'));
      await toast('copied');
      q('pop').classList.remove('is-open');
      await pause(1800);
    };

    const small = window.matchMedia('(max-width: 900px)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (small) return;
    if (still) {
      // the finished answer, without motion
      ['user', 'work', 'work-done', 'answer'].forEach((k) => show(k));
      q('title').textContent = 'AI and critical thinking';
      scene(2);
      return;
    }
    (async () => {
      try {
        for (;;) await play();
      } catch {
        /* stopped: the page was left */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <aside className="ad" aria-label="A short demo of the research assistant" ref={root}>
      <div className="ad-stage" data-k="stage">
        <div className="ad-win" aria-hidden="true">
          <div className="ad-top">
            <span className="ad-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="ad-title" data-k="title">
              New chat
            </span>
            <span className="ad-share" data-k="share">
              <Icon name="upload" /> Share
            </span>
          </div>

          <div className="ad-chat" data-k="chat">
            <div className="ad-flow" data-k="flow">
            <div className="ad-user" data-k="user">
              {QUESTION}
            </div>

            <div className="ad-work" data-k="work">
              <div className="ad-work-head">
                <Icon name="compass" /> <b>Deep research</b>
                <span className="ad-work-done" data-k="work-done">
                  · 5 steps · 3 papers read
                </span>
              </div>
              <ol className="ad-plan" data-k="plan">
                {PLAN.map((p, i) => (
                  <li key={p} data-k={`plan-${i}`}>
                    {p}
                  </li>
                ))}
              </ol>
              <ol className="ad-steps">
                {STEPS.map((s, i) => (
                  <li key={s.did} className="ad-step" data-k={`step-${i}`}>
                    <span className="ad-spin" />
                    <Icon name={s.icon} className="ad-step-ic" />
                    <span className="ad-run">{s.run}</span>
                    <span className="ad-did">
                      <b>{s.did}</b> {s.about}
                    </span>
                    <span className="ad-meta">{s.meta}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="ad-answer" data-k="answer">
              <p className="ad-h">What the research says</p>
              <ul>
                <li>
                  Heavy, passive use of AI goes with weaker critical thinking, largely through <em>cognitive offloading</em> <span className="ad-cite">1</span>.
                </li>
                <li>
                  Younger users who lean on AI for ready answers show the strongest effect <span className="ad-cite">1</span>
                  <span className="ad-cite">2</span>.
                </li>
                <li>
                  Using AI to check your own reasoning, not replace it, keeps critical thinking intact <span className="ad-cite">3</span>.
                </li>
              </ul>
              <ol className="ad-refs">
                <li>
                  <span className="ad-n">1</span>
                  <span>
                    <b>AI Tools in Society: Impacts on Cognitive Offloading and the Future of Critical Thinking</b>
                    <small>Gerlich · 2025 · Societies</small>
                  </span>
                  <span className="ad-btn" data-k="read">
                    <Icon name="book" /> Read
                  </span>
                </li>
                <li>
                  <span className="ad-n">2</span>
                  <span>
                    <b>The Effects of Over-Reliance on AI Dialogue Systems on Students’ Cognitive Abilities</b>
                    <small>Zhai et al. · 2024 · Smart Learning Environments</small>
                  </span>
                  <span className="ad-btn">
                    <Icon name="book" /> Read
                  </span>
                </li>
                <li>
                  <span className="ad-n">3</span>
                  <span>
                    <b>The Impact of Generative AI on Critical Thinking: Self-Reported Reductions in Cognitive Effort and Confidence Effects</b>
                    <small>Lee et al. · 2025 · CHI</small>
                  </span>
                  <span className="ad-btn">
                    <Icon name="book" /> Read
                  </span>
                </li>
              </ol>
            </div>

            <div className="ad-user" data-k="user-2">
              {FOLLOW_UP}
            </div>
            <div className="ad-step ad-save" data-k="save-step">
              <span className="ad-spin" />
              <Icon name="layers" className="ad-step-ic" />
              <span className="ad-run">Saving 2 papers to your shelf</span>
              <span className="ad-did">
                <b>Saved 2 papers</b> to your shelf
              </span>
              <span className="ad-meta">Thesis</span>
            </div>
            <p className="ad-reply" data-k="save-reply">
              Done: both papers are on your shelf, in your Thesis project.
            </p>
            </div>
          </div>

          <div className="ad-input" data-k="input">
            <span className="ad-typed" data-k="typed" />
            <span className="ad-pill" data-k="deep">
              <Icon name="compass" /> Deep research
            </span>
            <span className="ad-send" data-k="send">
              <Icon name="send" />
            </span>
          </div>

          {/* the cited paper, opened beside the chat */}
          <div className="ad-pdf" data-k="pdf">
            <div className="ad-pdf-bar">
              <Icon name="pdf" />
              <span>Gerlich 2025 · Societies · page 6 of 28</span>
              <span className="ad-x" data-k="pdf-close">
                <Icon name="x" />
              </span>
            </div>
            <div className="ad-pdf-scroll">
              <div className="ad-page">
                <p className="ad-journal">Societies 2025, 15, 6 · Article</p>
                <p className="ad-ptitle">AI Tools in Society: Impacts on Cognitive Offloading and the Future of Critical Thinking</p>
                <p className="ad-authors">Michael Gerlich</p>
                <p className="ad-sec">Abstract</p>
                <p>
                  This study investigates the relationship between the use of AI tools and critical thinking skills, focusing on cognitive offloading as a mediating factor. Using a mixed-methods
                  design, it surveys and interviews participants across age groups and levels of education.
                </p>
                <p className="ad-sec">4. Results</p>
                <p>
                  <mark>Frequent use of AI tools was negatively associated with critical thinking, and this relationship was mediated by cognitive offloading.</mark> Younger participants
                  reported greater dependence on AI tools and scored lower on critical thinking than older participants.
                </p>
                <p>Higher education levels were associated with stronger critical thinking regardless of how often AI tools were used.</p>
              </div>
            </div>
          </div>

          {/* the share panel */}
          <div className="ad-pop" data-k="pop">
            <p className="ad-pop-h">Share</p>
            <div className="ad-acc">
              <Icon name="globe" />
              <span>
                <b>Anyone with the link</b>
                <small>Can read, can’t reply</small>
              </span>
              <span className="ad-switch" data-k="switch" />
            </div>
            <div className="ad-link" data-k="link">
              <span>citezeno.com/c/q8Hn2kLx0pR4</span>
              <span className="ad-copy" data-k="copy">
                Copy
              </span>
            </div>
          </div>

          <div className="ad-note" data-k="saved">
            <Icon name="layers" /> 2 papers saved to your shelf
          </div>
          <div className="ad-toast" data-k="copied">
            Link copied
          </div>
          <div className="ad-veil" data-k="veil" />
        </div>
        <div className="ad-cursor" data-k="cursor">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 3l14 8-6 1.6L10 19z" fill="#fff" stroke="#13213a" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <p className="ad-caption" data-k="caption" aria-live="off">
        {CAPTIONS[0]}
      </p>
    </aside>
  );
}
