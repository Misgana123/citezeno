/* Words for the row under an answer: when it was written, and the answer as plain words to read aloud. */

/* "just now", "5 minutes ago", "3 hours ago", "2 days ago", then the date */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const units: [number, string][] = [
    [60 * 60 * 24 * 7, 'week'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];
  if (s >= 60 * 60 * 24 * 30) return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  for (const [size, name] of units) {
    const n = Math.floor(s / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/* An answer as plain words, for reading aloud: no markdown marks or citation numbers. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(\d+)\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
