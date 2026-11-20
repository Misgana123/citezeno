/* Whether an open-access PDF's license lets us keep one shared copy and serve
   it to every user. CC BY, CC BY-SA, CC0 and public domain do; NonCommercial
   and NoDerivatives licenses, publisher-specific terms and unknown licenses
   don't: those files are fetched fresh for each open and never stored (their
   extracted text, passages and summary are still kept, shared). */

const REUSABLE = new Set(['cc-by', 'cc-by-sa', 'cc0', 'public-domain', 'pd', 'cc-pd', 'pdm']);

export function isReusableLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  const l = license
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-\d+(\.\d+)?$/, ''); // "cc-by-4.0" → "cc-by"
  return REUSABLE.has(l);
}
