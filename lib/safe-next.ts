/* Only follow redirects to paths on this site ("/studio"), never "//evil.com", "/\evil.com" or full URLs. */
export function safeNext(v: string | string[] | undefined | null, fallback = '/studio') {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}
