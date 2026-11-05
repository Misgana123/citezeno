import { describe, expect, it } from 'vitest';
import { sanitizeRendered } from '@/lib/sanitize';

describe('sanitizeRendered', () => {
  it('keeps the markup the renderer produces', () => {
    const html = '<p class="ref">Oke, T. R. (1982). <i>Title</i>. <a href="https://doi.org/10.1/x" target="_blank" rel="noopener">link</a></p>';
    const out = sanitizeRendered(html);
    expect(out).toContain('<p class="ref">');
    expect(out).toContain('<i>Title</i>');
    expect(out).toContain('href="https://doi.org/10.1/x"');
  });
  it('drops scripts, event handlers and javascript: links', () => {
    const out = sanitizeRendered('<p onclick="x()">a<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">b</a></p>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(out).toContain('<a target="_blank" rel="noopener noreferrer nofollow">b</a>');
  });
  it('strips contenteditable', () => {
    expect(sanitizeRendered('<div class="annot" contenteditable="true">x</div>')).toBe('<div class="annot">x</div>');
  });
});
