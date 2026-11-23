/* Semantic Scholar identifiers: its 40-character paper ID, "CorpusId:123",
   or a link to the paper's page (semanticscholar.org/paper/<title>/<ID>). */
export function toS2Id(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?(api\.)?semanticscholar\.org\/(graph\/v1\/)?paper\/(?:[^/]+\/)?/i, '').replace(/[/?#].*$/, '');
  if (/^[0-9a-f]{40}$/i.test(s)) return s.toLowerCase();
  const corpus = s.match(/^corpusid:(\d+)$/i);
  return corpus ? `CorpusId:${corpus[1]}` : null;
}

export const s2Url = (id: string) => `https://www.semanticscholar.org/paper/${id.startsWith('CorpusId:') ? id.slice(9) : id}`;
