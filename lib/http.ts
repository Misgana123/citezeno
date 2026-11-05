import 'server-only';

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export function clientIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || '').trim() || 'unknown';
}

/* Reject cross-site form posts: the browser always sends Origin on POST. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return false;
  }
}
