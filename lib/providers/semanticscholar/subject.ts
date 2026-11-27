import { toSubject } from '@/lib/papers/subjects';

/* Semantic Scholar's fields of study → our broad subjects (lib/papers/subjects.ts). */
const FIELDS: Record<string, string> = {
  Biology: 'Biochemistry, Genetics and Molecular Biology',
  Physics: 'Physics and Astronomy',
  Economics: 'Economics, Econometrics and Finance',
  Business: 'Business, Management and Accounting',
  Geology: 'Earth and Planetary Sciences',
  Geography: 'Social Sciences',
  Sociology: 'Social Sciences',
  'Political Science': 'Social Sciences',
  Education: 'Social Sciences',
  Law: 'Social Sciences',
  'Agricultural and Food Sciences': 'Agricultural and Biological Sciences',
  Art: 'Arts and Humanities',
  History: 'Arts and Humanities',
  Philosophy: 'Arts and Humanities',
  Linguistics: 'Arts and Humanities',
};

export function s2Subject(fields: string[] | null | undefined): string | null {
  for (const f of fields ?? []) {
    const s = toSubject(FIELDS[f] ?? f);
    if (s) return s;
  }
  return null;
}
