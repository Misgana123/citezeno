/* OpenAlex work IDs. */

const WORK_ID = /^W\d{1,12}$/;

/* "W123", "w123", "https://openalex.org/W123" or "https://api.openalex.org/works/W123" → "W123"; anything else → null. */
export function toWorkId(value: string | null | undefined): string | null {
  if (!value) return null;
  let tail = value.trim();
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*openalex\.org\//i.test(tail)) {
    tail = tail.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? '';
  }
  tail = tail.toUpperCase();
  return WORK_ID.test(tail) ? tail : null;
}

export const workUrl = (workId: string) => `https://openalex.org/${workId}`;
