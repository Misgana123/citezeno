/* PubMed identifiers (PMIDs): "12345678", "PMID: 12345678", or a link to the
   PubMed record. */
export function toPmid(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().replace(/^https?:\/\/(www\.)?(pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\//i, '').replace(/\/+$/, '').replace(/^pmid:\s*/i, '');
  return /^\d{1,9}$/.test(s) ? s : null;
}

export const pubmedUrl = (pmid: string) => `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
