/* The parts of a ClinicalTrials.gov study we read. */
export type CtStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[]; keywords?: string[] };
    designModule?: { phases?: string[] };
    contactsLocationsModule?: { overallOfficials?: { name?: string }[] };
  };
};
export type CtSearch = { totalCount?: number; nextPageToken?: string; studies?: CtStudy[] };
