/* arXiv identifiers: new style "2101.00001" and old style "hep-th/9901001",
   with or without a version ("v2"), an "arXiv:" prefix, or a link to the
   abstract or PDF. The version is dropped: a paper is all its versions. */

const NEW = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const OLD = /^([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/i;

export function toArxivId(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim();
  s = s.replace(/^https?:\/\/(www\.|export\.)?arxiv\.org\/(abs|pdf)\//i, '').replace(/\.pdf$/i, '');
  s = s.replace(/^arxiv:\s*/i, '').replace(/^10\.48550\/arxiv\./i, '');
  const m = s.match(NEW) ?? s.match(OLD);
  return m ? m[1] : null;
}

export const absUrl = (id: string) => `https://arxiv.org/abs/${id}`;

/* arXiv's own DOI for a paper (DataCite), used when the paper has no journal DOI. */
export const arxivDoi = (id: string) => `10.48550/arxiv.${id.toLowerCase()}`;
