import { toDoi, toWorkId } from '@/lib/papers/ids';

/* What the user pasted into "Add a paper": a DOI, a link, or a title.
   Links are read for an ID only; the page itself is never fetched.

   - doi.org links, "doi:…" and bare DOIs
   - OpenAlex links and IDs (W123…)
   - arXiv links and IDs → the arXiv DOI (10.48550/arXiv.<id>)
   - PubMed and PubMed Central links → PMID / PMCID
   - any other link with a DOI in its address (most publisher pages) */

export type ParsedInput =
  | { kind: 'doi'; doi: string; fromLink: boolean }
  | { kind: 'openalex'; id: string; fromLink: boolean }
  | { kind: 'pmid'; id: string }
  | { kind: 'pmcid'; id: string }
  | { kind: 'title'; title: string }
  | { kind: 'unreadable_link' }
  | { kind: 'empty' };

const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"'<>?#]+)/i;
const ARXIV_NEW = /^(\d{4}\.\d{4,5})(v\d+)?$/i;
const ARXIV_OLD = /^([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/i;

export const arxivDoi = (id: string) => `10.48550/arxiv.${id.toLowerCase()}`;

function arxivId(raw: string): string | null {
  const s = raw.trim().replace(/^arxiv:\s*/i, '').replace(/\.pdf$/i, '');
  const m = s.match(ARXIV_NEW) ?? s.match(ARXIV_OLD);
  return m ? m[1] : null;
}

/* Trailing punctuation from a sentence or a copied link is not part of a DOI. */
const cleanDoi = (d: string) => toDoi(decodeURIComponent(d).replace(/[.,;:)\]}]+$/, ''));

function fromUrl(url: URL): ParsedInput {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = decodeURIComponent(url.pathname);

  if (host === 'doi.org' || host === 'dx.doi.org') {
    const doi = cleanDoi(path.slice(1));
    return doi ? { kind: 'doi', doi, fromLink: true } : { kind: 'unreadable_link' };
  }
  if (host === 'openalex.org' || host === 'api.openalex.org' || host.endsWith('.openalex.org')) {
    const id = toWorkId(path.split('/').filter(Boolean).pop());
    return id ? { kind: 'openalex', id, fromLink: true } : { kind: 'unreadable_link' };
  }
  if (host === 'arxiv.org' || host.endsWith('.arxiv.org')) {
    const m = path.match(/^\/(?:abs|pdf|html)\/(.+?)\/?$/);
    const id = m ? arxivId(m[1]) : null;
    return id ? { kind: 'doi', doi: arxivDoi(id), fromLink: true } : { kind: 'unreadable_link' };
  }
  if (host === 'pubmed.ncbi.nlm.nih.gov' || host === 'ncbi.nlm.nih.gov' || host === 'pmc.ncbi.nlm.nih.gov') {
    const pmc = path.match(/\b(PMC\d{4,10})\b/i);
    if (pmc) return { kind: 'pmcid', id: pmc[1].toUpperCase() };
    const pmid = path.match(/(?:^\/|\/pubmed\/)(\d{4,10})\/?$/);
    if (pmid) return { kind: 'pmid', id: pmid[1] };
    return { kind: 'unreadable_link' };
  }
  const inPath = (path + (url.search ? decodeURIComponent(url.search) : '')).match(DOI_IN_TEXT);
  const doi = inPath ? cleanDoi(inPath[1]) : null;
  return doi ? { kind: 'doi', doi, fromLink: true } : { kind: 'unreadable_link' };
}

export function parseInput(raw: string): ParsedInput {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'empty' };

  if (/^https?:\/\//i.test(text) || /^(www\.|doi\.org\/|dx\.doi\.org\/|arxiv\.org\/|openalex\.org\/|pubmed\.ncbi)/i.test(text)) {
    try {
      return fromUrl(new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`));
    } catch {
      return { kind: 'unreadable_link' };
    }
  }

  const doi = toDoi(text.replace(/[.,;)\]]+$/, ''));
  if (doi) return { kind: 'doi', doi, fromLink: false };
  const work = toWorkId(text);
  if (work) return { kind: 'openalex', id: work, fromLink: false };
  const arxiv = /^arxiv:/i.test(text) || ARXIV_NEW.test(text) ? arxivId(text) : null;
  if (arxiv) return { kind: 'doi', doi: arxivDoi(arxiv), fromLink: false };
  const pmid = text.match(/^pmid:?\s*(\d{4,10})$/i);
  if (pmid) return { kind: 'pmid', id: pmid[1] };
  const pmcid = text.match(/^(?:pmcid:?\s*)?(PMC\d{4,10})$/i);
  if (pmcid) return { kind: 'pmcid', id: pmcid[1].toUpperCase() };
  // a DOI somewhere in a pasted citation
  const inside = text.match(DOI_IN_TEXT);
  if (inside && text.length < 400) {
    const d = cleanDoi(inside[1]);
    if (d) return { kind: 'doi', doi: d, fromLink: false };
  }
  return { kind: 'title', title: text.slice(0, 500) };
}
