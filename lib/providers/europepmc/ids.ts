/* Europe PMC identifiers: a source and its ID, "MED:12345678" (a PubMed
   record), "PMC:PMC1234567", "PPR:PPR123456" (a preprint)… Also accepted: a
   bare "PMC1234567" or "PPR123456", a bare PMID, and links to europepmc.org. */

const SOURCES = ['MED', 'PMC', 'PPR', 'AGR', 'CBA', 'CTX', 'ETH', 'HIR', 'PAT', 'NBK'];

export function toEpmcId(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?europepmc\.org\/(article|abstract|api\/fulltextRepo\?pprId=)\/?/i, '').replace(/\/+$/, '');
  s = s.replace('/', ':');
  const m = s.match(/^([a-z]{3}):([a-z]*\d+)$/i);
  if (m && SOURCES.includes(m[1].toUpperCase())) return `${m[1].toUpperCase()}:${m[2].toUpperCase()}`;
  if (/^pmc\d+$/i.test(s)) return `PMC:${s.toUpperCase()}`;
  if (/^ppr\d+$/i.test(s)) return `PPR:${s.toUpperCase()}`;
  if (/^\d{1,9}$/.test(s)) return `MED:${s}`;
  return null;
}

export const splitEpmcId = (id: string) => {
  const [source, ext] = id.split(':');
  return { source, ext };
};

export const epmcUrl = (id: string) => {
  const { source, ext } = splitEpmcId(id);
  return `https://europepmc.org/article/${source}/${ext}`;
};
