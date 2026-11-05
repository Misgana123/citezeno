export type Name = { family: string; given?: string; suffix?: string; literal?: boolean };

export type SourceType =
  | 'article' | 'book' | 'chapter' | 'web' | 'preprint'
  | 'proceedings' | 'dataset' | 'thesis' | 'report';

export type Source = {
  id?: string;
  provider: string;
  providers?: string[];
  providerId?: string;
  type: SourceType;
  title: string;
  authors: Name[];
  editors?: Name[];
  year: number | null;
  month?: number | null;
  date?: string;
  container?: string;
  publisher?: string;
  place?: string;
  site?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  isbn?: string;
  accessed?: string;
  citedBy?: number;
  oa?: boolean;
  /* flagged as retracted by OpenAlex; never picked automatically */
  retracted?: boolean;
  abstract?: string;
  keywords?: string[];
};

export type Sentence = {
  text: string;
  para: number;
  index: number;
  tokens?: Set<string>;
  score?: number;
  keywords?: string[];
  query?: string;
};

export type Analysis = {
  sentences: Sentence[];
  paraCount: number;
  topic: string[];
  wordCount: number;
};

export type Candidate = { id: string; score: number };

/* anchor: when set, the citation sits right after this passage instead of at the end of the sentence */
export type Claim = { sid: number; text: string; ids: string[]; cands: Candidate[]; anchor?: string };

export type Result = {
  analysis: Analysis;
  claims: Claim[];
  db: Map<string, Source>;
  extra: string[];
  requested: number;
  /* pinpoint pages per source id, e.g. "437" or "12–15" */
  pins?: Record<string, string>;
};

export type Mode = 'intext' | 'footnotes' | 'endnotes' | 'list' | 'annotated';
export type Kind = 'any' | 'scholarly' | 'books';
export type ProviderKey = 'openalex' | 'crossref' | 'openlibrary' | 'wikipedia';

export type Prefs = {
  style: string;
  mode: Mode;
  count: number;
  providers: Record<ProviderKey, boolean>;
  yearFrom: string;
  yearTo: string;
  kind: Kind;
  oaOnly: boolean;
  minRel: number;
};

export type ApiSettings = { email?: string; openalexKey?: string };

export const DEFAULT_PREFS: Prefs = {
  style: 'apa',
  mode: 'intext',
  count: 8,
  providers: { openalex: true, crossref: true, openlibrary: true, wikipedia: false },
  yearFrom: '',
  yearTo: '',
  kind: 'any',
  oaOnly: false,
  minRel: 0.22,
};
