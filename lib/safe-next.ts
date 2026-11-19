/* Where people land after signing in, unless they were on their way somewhere. */
export const AFTER_SIGN_IN = '/chat';

/* Only follow redirects to paths on this site ("/studio"), never "//evil.com", "/\evil.com" or full URLs. */
export function safeNext(v: string | string[] | undefined | null, fallback = AFTER_SIGN_IN) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : fallback;
}
