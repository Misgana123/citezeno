/* The parts of a Europe PMC "core" result we read. */
export type EpmcAuthor = { fullName?: string; firstName?: string; lastName?: string; collectiveName?: string; authorId?: { type?: string; value?: string } };
export type EpmcResult = {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorList?: { author?: EpmcAuthor[] };
  pubYear?: string;
  firstPublicationDate?: string;
  journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
  pubTypeList?: { pubType?: string[] };
  language?: string;
  abstractText?: string;
  citedByCount?: number;
  isOpenAccess?: string;
  license?: string;
  fullTextUrlList?: { fullTextUrl?: { availabilityCode?: string; documentStyle?: string; url?: string }[] };
  keywordList?: { keyword?: string[] };
  meshHeadingList?: { meshHeading?: { descriptorName?: string }[] };
};
export type EpmcSearch = { hitCount?: number; nextCursorMark?: string; request?: { cursorMark?: string }; resultList?: { result?: EpmcResult[] } };
