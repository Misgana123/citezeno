import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('allows same-site paths', () => {
    expect(safeNext('/app/account')).toBe('/app/account');
    expect(safeNext(['/app/library', '/x'])).toBe('/app/library');
  });
  it('falls back to the studio for anything off-site', () => {
    for (const bad of ['//evil.com', String.raw`/\evil.com`, 'https://evil.com', 'javascript:alert(1)', '', undefined, null]) {
      expect(safeNext(bad as string)).toBe('/app/chat');
    }
  });
});
