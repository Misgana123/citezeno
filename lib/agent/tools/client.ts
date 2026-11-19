import { z } from 'zod';

/* Tools that run in the user's browser, not on the server. The citation
   feature searches OpenAlex, Crossref, Open Library and Wikipedia from the
   browser and stays unchanged, so the agent asks the open chat page to run it
   and send the results back. */

export type ClientTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  kind: 'client';
  label(input: z.infer<S>): string;
};

export const findCitationsInput = z.object({
  text: z.string().min(3).max(1500).describe('The claim or short passage to find sources for (one claim per call works best).'),
  count: z.number().int().min(1).max(5).optional().describe('How many sources to find (default 3).'),
  style: z.string().max(20).optional().describe('Citation style for the formatted references, e.g. "apa", "mla", "chicago", "harvard", "ieee". Default: the user’s Studio style.'),
});

export const findCitations: ClientTool<typeof findCitationsInput> = {
  name: 'find_citations',
  description:
    'Find real published sources (articles, books, web pages) that support one claim or short passage, with the reference formatted in a citation style. Uses the Studio’s citation search in the user’s browser and costs the user 1 credit per call. For a paragraph with several claims, call it once per claim.',
  input: findCitationsInput,
  kind: 'client',
  label: (i) => `Finding sources for “${i.text.slice(0, 60)}${i.text.length > 60 ? '…' : ''}”`,
};

export const CLIENT_TOOLS: readonly ClientTool[] = [findCitations] as ClientTool[];

/* A source found by a client tool, as it is shown and sent back. */
export const citedSourceSchema = z.object({
  title: z.string().max(1000),
  authors: z.string().max(500),
  year: z.number().int().nullable(),
  venue: z.string().max(500).nullable(),
  link: z.string().max(2000).nullable(),
  reference: z.string().max(3000),
  retracted: z.boolean().optional(),
});
export type CitedSource = z.infer<typeof citedSourceSchema>;
