import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|mjs)$/.test(f)) out.push(p);
  }
  return out;
}
const source = [...files('app'), ...files('components'), ...files('lib')];

describe('the .docx preview library', () => {
  it('is pinned to exact versions', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies['docx-preview']).toBe('0.4.1');
    expect(pkg.dependencies.jszip).toBe('3.10.1');
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(lock.packages['node_modules/docx-preview'].version).toBe('0.4.1');
    expect(lock.packages['node_modules/docx-preview'].license).toBe('Apache-2.0');
  });

  it('is only ever loaded with a dynamic import, from the preview component', () => {
    const users = source.filter((p) => /docx-preview/.test(readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(users).toEqual(['components/studio/DocxPreview.tsx']);
    const code = readFileSync('components/studio/DocxPreview.tsx', 'utf8');
    expect(code).toMatch(/await import\('docx-preview'\)/);
    expect(code).not.toMatch(/^import .*docx-preview/m);
  });

  it('keeps the original file in memory only', () => {
    // never sent to the server or written to storage
    const preview = readFileSync('components/studio/DocxPreview.tsx', 'utf8');
    const editor = readFileSync('components/studio/Editor.tsx', 'utf8');
    for (const code of [preview, editor]) {
      expect(code).not.toMatch(/fetch\(|localStorage|sessionStorage|indexedDB/);
    }
    const lib = readFileSync('lib/library.ts', 'utf8');
    expect(lib).not.toMatch(/original|arrayBuffer/i);
  });

  it('the editor still imports .docx as plain text first', () => {
    const editor = readFileSync('components/studio/Editor.tsx', 'utf8');
    const load = editor.slice(editor.indexOf('const load = async'), editor.indexOf('/* place the "cite this"'));
    expect(load.indexOf('readDraftFile(f)')).toBeGreaterThan(-1);
    expect(load.indexOf('readDraftFile(f)')).toBeLessThan(load.indexOf('onOriginal('));
  });
});
