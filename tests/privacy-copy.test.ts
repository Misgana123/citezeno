import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* every .ts/.tsx/.md file the app ships, plus the README */
function files(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|md)$/.test(f)) out.push(p);
  }
  return out;
}

describe('privacy wording', () => {
  it('no longer claims nothing is stored on a server', () => {
    const all = [...files('app'), ...files('components'), ...files('lib'), 'README.md'];
    const bad = all.filter((p) => /nothing is (stored|saved) on (a|our|the) server/i.test(readFileSync(p, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('the trace settings panel says what is saved', () => {
    const controls = readFileSync('components/studio/Controls.tsx', 'utf8');
    expect(controls).toContain('Searches run in your browser. If you’re signed in, your drafts and results are saved to your account so you can find them later.');
  });
});
