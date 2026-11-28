/* Skills made by Citezeno. A skill is a set of instructions the assistant
   follows for one message: how to do one kind of research work well, with the
   tools it already has. Users add the ones they want (Settings → Customize →
   Skills) and pick one in the chat's + menu. New built-in skills go here. */

export type BuiltinSkill = {
  /* stable ID, shown as the skill's name ("literature-review") */
  slug: string;
  /* one sentence: what using it gets the user */
  description: string;
  category: 'Writing' | 'Method' | 'Citations' | 'Publishing' | 'Funding' | 'Reading' | 'Analysis';
  instructions: string;
};

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  {
    slug: 'literature-review',
    description: 'Finds papers, groups them by theme, and writes a cited review with gaps and open questions.',
    category: 'Writing',
    instructions: `Write a literature review on the user's topic.
1. If the topic is broad, say in one line how you'll narrow it (years, field, population), then go on.
2. Search papers with two or three focused queries; prefer recent work and well-cited reviews. Check the user's shelf too (list_library) and include relevant saved papers.
3. Group the papers into 3–6 themes. For each theme: what the studies found, where they agree, where they disagree, with every claim cited by its ref number.
4. End with "Gaps and open questions" (what isn't studied yet or is contested) and a short conclusion.
5. Use only papers the tools returned. Flag retracted papers. Offer to save the papers to a project or make a Word document of the review.`,
  },
  {
    slug: 'prisma-review',
    description: 'Search strings, screening criteria and a PRISMA flow you fill in as you go.',
    category: 'Method',
    instructions: `Help the user plan and run a systematic review the PRISMA 2020 way.
1. Turn their question into PICO (or PEO) parts and write it out.
2. Write search strings for the main databases (Boolean, with synonyms and truncation) and run one search here to show what comes back.
3. Propose inclusion and exclusion criteria as a short list.
4. Keep a PRISMA flow table (identified, duplicates removed, screened, excluded with reasons, full texts assessed, included) and update the numbers whenever the user screens papers.
5. Say plainly which numbers come from searches here and which the user must fill in from other databases. Never invent counts.`,
  },
  {
    slug: 'check-citations',
    description: 'Checks each reference in a draft against the paper database: wrong years, missing DOIs, retractions.',
    category: 'Citations',
    instructions: `Check the references in the user's draft or reference list.
1. Use check_references on the list (or on each reference you can read from the attached file).
2. Report a table: reference, status (found / mismatch / not found / retracted), what's wrong (year, title, authors, DOI) and the corrected reference.
3. Put retracted papers first and say they are retracted.
4. Never "fix" a reference to a paper the tools didn't return; if a reference can't be found, say so.
5. Offer to give the corrected list in the user's citation style, or as BibTeX or RIS.`,
  },
  {
    slug: 'reviewer-reply',
    description: 'Turns reviewer comments into a point-by-point response letter.',
    category: 'Publishing',
    instructions: `Write a response to reviewers from the comments the user gives.
1. Number every comment (Reviewer 1, comment 1…) and quote it briefly.
2. For each: a polite, specific reply, and what changed in the manuscript (section, page or line if the user gave them). If the user hasn't said how they'll address a comment, write a placeholder in [brackets] instead of inventing a change.
3. Where a reviewer asks for literature, search papers and cite real ones by ref number.
4. Open with a short thank-you paragraph to the editor. Keep the tone respectful, never defensive.
5. Offer to make it a Word document.`,
  },
  {
    slug: 'methods-section',
    description: 'Drafts a reproducible methods section from your notes and the papers you followed.',
    category: 'Writing',
    instructions: `Draft a methods section from the user's notes.
1. Use the usual subsections where they apply: design, participants or data, materials, procedure, measures, analysis, ethics.
2. Write in the past tense, precisely enough that someone could repeat the study.
3. Where the user followed a published method, find and cite that paper.
4. Put anything the user hasn't told you (sample size, software version, ethics approval number) in [brackets] as a question; never make up details.
5. Offer a reporting checklist that fits the design (CONSORT, STROBE, PRISMA…).`,
  },
  {
    slug: 'grant-proposal',
    description: 'Specific aims, significance and innovation, backed by citations from your shelf.',
    category: 'Funding',
    instructions: `Help the user write a grant proposal.
1. Ask for (or use) the funder, the page limit and the research idea. If the funder isn't given, use a common structure: summary, specific aims, significance, innovation, approach, timeline.
2. Ground significance in real papers: check the shelf first (list_library), then search papers. Cite by ref number.
3. Keep aims concrete and testable, two or three of them, each with its expected outcome.
4. Mark anything that needs the user's input (budget, preliminary data, team) in [brackets].
5. Offer to make it a Word document.`,
  },
  {
    slug: 'explain-simply',
    description: 'A plain-language summary of one paper: what they did, what they found, the catch.',
    category: 'Reading',
    instructions: `Explain one paper in plain language.
1. Find the paper (lookup_paper or search_papers), or use the one open in the reader (ask_paper for its text).
2. Write four short parts: what question it asks, what they did, what they found (with the main numbers), and the catch (limits, who it may not apply to).
3. Use everyday words and short sentences; explain any term you must keep.
4. Only use what the paper's text or abstract says. If you only have the abstract, say so.`,
  },
  {
    slug: 'stats-check',
    description: 'Re-runs reported tests in Python and flags numbers that don’t add up.',
    category: 'Analysis',
    instructions: `Check the statistics the user gives (from a paper or their own draft).
1. List each reported result: the test, its numbers (means, SDs, n, t/F/χ², df, p, CI).
2. Recompute what can be recomputed with run_python (for example the p value from the test statistic and df, or a t test from means, SDs and n). Show the code.
3. Report a table: reported, recomputed, consistent or not. Explain inconsistencies plainly (rounding, one- vs two-sided, typo).
4. Never claim misconduct; say what the numbers show and what would explain a gap.`,
  },
];

const BY_SLUG = new Map(BUILTIN_SKILLS.map((s) => [s.slug, s]));
export const builtinSkill = (slug: string): BuiltinSkill | null => BY_SLUG.get(slug) ?? null;
