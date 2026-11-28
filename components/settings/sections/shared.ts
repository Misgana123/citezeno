/* Small helpers the Settings sections share. */

export const PROVIDER_NAMES: Record<string, string> = { credential: 'Email and password', google: 'Google', github: 'GitHub' };

/* "Firefox on Linux", from a browser's user agent. */
export function deviceName(ua: string) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export const longDate = (t: number | string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (t: number | string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
