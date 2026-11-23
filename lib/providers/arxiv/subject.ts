/* arXiv's categories ("cs.LG", "q-bio.GN", "hep-th"…) → our broad subjects
   (lib/papers/subjects.ts), by the archive before the dot. */

const ARCHIVES: [RegExp, string][] = [
  [/^cs$/, 'Computer Science'],
  [/^(math|stat)$/, 'Mathematics'],
  [/^q-bio$/, 'Biochemistry, Genetics and Molecular Biology'],
  [/^(q-fin|econ)$/, 'Economics, Econometrics and Finance'],
  [/^eess$/, 'Engineering'],
  [/^(physics|astro-ph|cond-mat|gr-qc|hep-.+|nucl-.+|quant-ph|nlin|math-ph)$/, 'Physics and Astronomy'],
];

/* The subject of a paper's first (primary) category; null when unknown. */
export function arxivSubject(categories: string[]): string | null {
  const archive = categories[0]?.split('.')[0]?.toLowerCase();
  if (!archive) return null;
  return ARCHIVES.find(([re]) => re.test(archive))?.[1] ?? null;
}
