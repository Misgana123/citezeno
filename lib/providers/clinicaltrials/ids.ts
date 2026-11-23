/* ClinicalTrials.gov identifiers: "NCT01234567", or a link to the study. */
export function toNctId(raw: string | null | undefined): string | null {
  const m = (raw ?? '').trim().match(/(?:^|\/)(NCT\d{8})(?:[/?#]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

export const studyUrl = (nct: string) => `https://clinicaltrials.gov/study/${nct}`;
