/* Broad subjects: the one list every paper source maps its own categories to,
   so a paper from arXiv and one from OpenAlex land under the same subject.
   The names are OpenAlex's 26 research fields; each has a short label for
   chips and a colour for cards. No imports: safe for client components. */

export type Subject = { name: string; label: string; color: string };

export const SUBJECTS: readonly Subject[] = [
  { name: 'Medicine', label: 'Medicine', color: '#2e7d5b' },
  { name: 'Computer Science', label: 'Computer science', color: '#133a63' },
  { name: 'Biochemistry, Genetics and Molecular Biology', label: 'Biology', color: '#6b8f3a' },
  { name: 'Physics and Astronomy', label: 'Physics', color: '#5b4ea8' },
  { name: 'Engineering', label: 'Engineering', color: '#3f6f8f' },
  { name: 'Social Sciences', label: 'Social sciences', color: '#8a5a8f' },
  { name: 'Mathematics', label: 'Mathematics', color: '#3b5bbf' },
  { name: 'Chemistry', label: 'Chemistry', color: '#a8642a' },
  { name: 'Environmental Science', label: 'Environment', color: '#2a8a9a' },
  { name: 'Neuroscience', label: 'Neuroscience', color: '#b4472f' },
  { name: 'Psychology', label: 'Psychology', color: '#9a4f7a' },
  { name: 'Economics, Econometrics and Finance', label: 'Economics', color: '#8a6a1f' },
  { name: 'Agricultural and Biological Sciences', label: 'Agriculture & ecology', color: '#5f8a3a' },
  { name: 'Materials Science', label: 'Materials', color: '#6a6f7a' },
  { name: 'Earth and Planetary Sciences', label: 'Earth sciences', color: '#7a5a3a' },
  { name: 'Immunology and Microbiology', label: 'Immunology', color: '#3a8a6a' },
  { name: 'Pharmacology, Toxicology and Pharmaceutics', label: 'Pharmacology', color: '#4a7a9a' },
  { name: 'Arts and Humanities', label: 'Humanities', color: '#9a6a4a' },
  { name: 'Business, Management and Accounting', label: 'Business', color: '#6a5a2a' },
  { name: 'Energy', label: 'Energy', color: '#c2861a' },
  { name: 'Chemical Engineering', label: 'Chemical engineering', color: '#8a6a4a' },
  { name: 'Decision Sciences', label: 'Decision sciences', color: '#5a6a9a' },
  { name: 'Health Professions', label: 'Health professions', color: '#3a7a5a' },
  { name: 'Nursing', label: 'Nursing', color: '#4a8a7a' },
  { name: 'Dentistry', label: 'Dentistry', color: '#5a7a8a' },
  { name: 'Veterinary', label: 'Veterinary', color: '#6a7a4a' },
];

const BY_NAME = new Map(SUBJECTS.map((s) => [s.name.toLowerCase(), s]));

/* A source's field name → our subject name, when it is one of ours. */
export const toSubject = (name: string | null | undefined): string | null => (name ? (BY_NAME.get(name.trim().toLowerCase())?.name ?? null) : null);

export const subjectLabel = (name: string | null | undefined): string | null => (name ? (BY_NAME.get(name.toLowerCase())?.label ?? name) : null);

export const subjectColor = (name: string | null | undefined): string => (name ? (BY_NAME.get(name.toLowerCase())?.color ?? '#75819a') : '#75819a');
