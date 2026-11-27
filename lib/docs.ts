import type { IconName } from '@/components/Icon';

/* The docs: categories, guides and the blocks a guide is written in.
   Everything on /docs and /docs/[slug] is rendered from this file, so changing
   the docs means editing the data below, not the pages.
   Facts here are taken from the app's code (lib/plans.ts, the chat, reader, shelf
   and studio components); keep them in step when those change. Per-feature credit
   costs are deliberately left out: the app shows them right before an action runs. */

export type DocBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'callout'; tone: 'tip' | 'note' | 'warn'; title: string; text: string }
  | { type: 'figure'; caption: string; src?: string; alt?: string; pins?: { x: number; y: number }[] }
  | { type: 'table'; head: string[]; rows: (string | boolean)[][] }
  | { type: 'keys'; items: { label: string; keys: string[] }[] }
  | { type: 'code'; file: string; code: string };

export type DocArticle = {
  slug: string;
  category: string;
  title: string;
  /* the title's last word(s), set in italic serif with a full stop */
  em?: string;
  summary: string;
  minutes: number;
  updated: string; // ISO date
  isNew?: boolean;
  blocks: DocBlock[];
};

export type DocCategory = {
  key: string;
  title: string;
  icon: IconName;
  blurb: string;
  /* the lead card's quick steps (first category only) */
  steps?: string[];
};

export const DOC_CATEGORIES: DocCategory[] = [
  { key: 'getting-started', title: 'Getting started', icon: 'rocket', blurb: 'Create your account and ask your first question in a few minutes.', steps: ['Sign up', 'Ask', 'Read the sources'] },
  { key: 'assistant', title: 'Research assistant', icon: 'chat', blurb: 'Ask questions and get answers built on real papers.' },
  { key: 'deep-research', title: 'Deep research', icon: 'layers', blurb: 'Turn a big question into a report with numbered sources.' },
  { key: 'papers', title: 'Papers & reader', icon: 'reader', blurb: 'Find papers, then read, highlight and question them.' },
  { key: 'shelf', title: 'Shelf', icon: 'folder', blurb: 'Keep papers and your own PDFs organised.' },
  { key: 'citations', title: 'Citation studio', icon: 'quote', blurb: 'Find sources for a draft and format them.' },
  { key: 'account', title: 'Account & plans', icon: 'user', blurb: 'Your account, security and what each plan includes.' },
];

const UPDATED = '2026-11-27';
const a = (slug: string, category: string, title: string, summary: string, minutes: number, blocks: DocBlock[], extra: Partial<DocArticle> = {}): DocArticle => ({
  slug,
  category,
  title,
  summary,
  minutes,
  updated: UPDATED,
  blocks,
  ...extra,
});

/* in reading order: the sidebar, prev/next and the topic counts all follow it */
export const DOC_ARTICLES: DocArticle[] = [
  /* ---------------- getting started ---------------- */
  a('welcome', 'getting-started', 'Welcome to Citezeno', 'What Citezeno does, and where each tool lives.', 2, [
    { type: 'p', text: 'Citezeno is a research platform built around one rule: every answer comes from sources that exist. You ask, it searches real papers and the open web, reads them, and answers with numbered references you can open and check.' },
    { type: 'h2', text: 'The tools' },
    {
      type: 'table',
      head: ['Tool', 'What it’s for', 'Where'],
      rows: [
        ['Research assistant', 'Ask questions and get answers with sources', '[Assistant](/app/chat)'],
        ['Deep research', 'A full report on a bigger question', 'In the assistant'],
        ['Explore', 'Search and browse papers', '[Explore](/app/papers)'],
        ['Reader', 'Read, highlight and question a paper', 'Read button on any paper'],
        ['Shelf', 'Your saved papers, uploads and notes', '[My shelf](/app/shelf)'],
        ['Citation studio', 'Find sources for a draft and format them', '[Citation studio](/app/citation)'],
      ],
    },
    { type: 'h2', text: 'How the docs are organised' },
    { type: 'p', text: 'Start with **Getting started**, then open the topic for the tool you’re using. Press `Ctrl K` (or `⌘ K` on a Mac) on any docs page to search every guide.' },
    { type: 'callout', tone: 'note', title: 'Check before you cite', text: 'Citezeno only cites sources it found, but you are still the author. Open the source and check that it says what you claim before you use it.' },
  ]),
  a('create-an-account', 'getting-started', 'Create an account', 'Sign up, confirm your email and sign in.', 2, [
    { type: 'h2', text: 'Sign up' },
    {
      type: 'steps',
      items: [
        { title: 'Open the sign-up page', text: 'Choose **Get started** at the top of any page.' },
        { title: 'Fill in your details', text: 'Enter your name, email and a password of 8 to 128 characters, agree to the terms and privacy policy, then choose **Create account**. You can also continue with Google or GitHub when they are offered.' },
        { title: 'Confirm your email', text: 'Open the link we email you. It works for 1 hour and signs you in straight away.' },
      ],
    },
    { type: 'p', text: 'After signing in you land in the research assistant, ready to ask.' },
    { type: 'h2', text: 'Signing in' },
    { type: 'list', items: ['Tick **Keep me signed in** to stay signed in on that device for up to 30 days.', 'Forgot it? Choose **Forgot password?** on the sign-in page.', 'If you signed up with Google or GitHub and later use the same email, the accounts are linked.'] },
    { type: 'callout', tone: 'tip', title: 'Turn on two-factor', text: 'Add an authenticator app under **Sign-in and security** on your [account page](/app/account). You also get 10 backup codes in case you lose your phone.' },
  ]),
  a('ask-your-first-question', 'getting-started', 'Ask your first question', 'What happens when you ask, and how to send a good question.', 3, [
    { type: 'h2', text: 'Ask' },
    {
      type: 'steps',
      items: [
        { title: 'Open the assistant', text: 'Go to [Assistant](/app/chat). You’ll see a greeting and a box that says “Ask about papers, citations or your shelf…”.' },
        { title: 'Type your question', text: 'Ask in plain words. Press `Enter` to send, or `Shift Enter` for a new line.' },
        { title: 'Watch it work', text: 'Each step appears as it happens: searching papers, searching the web, reading sources. When it’s done, the steps fold into one line.' },
        { title: 'Read the answer and its sources', text: 'Numbers in the answer link to the reference list underneath. Open any source to check it.' },
      ],
    },
    { type: 'h2', text: 'Starting points' },
    { type: 'p', text: 'Under the box are four shortcuts. Each fills in the start of a question for you to finish; nothing is sent until you press `Enter`.' },
    {
      type: 'table',
      head: ['Shortcut', 'Starts your question with'],
      rows: [
        ['Find papers', '“Find recent papers on …”'],
        ['Cite a claim', '“Find citations for this text: …”'],
        ['Ask my shelf', '“What’s on my shelf about …”'],
        ['Check retractions', '“Which papers on my shelf are retracted?”'],
      ],
    },
    { type: 'h2', text: 'Writing a good question' },
    { type: 'list', items: ['Name the topic, the population or field, and the time range if it matters.', 'Say what you want back: a summary, a list of papers, a comparison, or sources for a sentence.', 'Ask follow-ups in the same chat; the assistant keeps the conversation in mind.'] },
    { type: 'callout', tone: 'tip', title: 'Tip', text: 'For a big question that needs many sources, use [deep research](/docs/run-deep-research) instead of a single answer.' },
  ], { em: 'question' }),
  a('reading-an-answer', 'getting-started', 'Reading an answer', 'Steps, numbered sources and what you can do with an answer.', 3, [
    { type: 'h2', text: 'The steps' },
    { type: 'p', text: 'Above each answer is a timeline of what the assistant did, such as “Searched papers”, “Searched the web” or “Read 3 sources”. Open a step to see what it found; retracted papers are flagged **Retracted**.' },
    { type: 'h2', text: 'Sources' },
    { type: 'list', items: ['Numbers in the text, like [1], jump to that source in the list below. Hover a number to see the title.', 'Each source shows its title, authors, year and journal. The title opens the original.', '**Read** opens the paper in a panel beside the chat. **Save** adds it to your shelf; saved papers show **On your shelf**.', 'A citation with a page, like “p.3”, opens that page of the PDF.'] },
    { type: 'h2', text: 'Under the answer' },
    {
      type: 'table',
      head: ['Button', 'What it does'],
      rows: [
        ['Copy', 'Copies the answer'],
        ['Read aloud', 'Reads the answer out; choose it again to stop'],
        ['Good answer / Bad answer', 'Tells us how it did'],
        ['Try again', 'Writes the latest answer again'],
      ],
    },
    { type: 'callout', tone: 'note', title: 'When it asks first', text: 'Before anything that changes your things, like deleting papers, merging duplicates or a large export, the assistant asks and waits for you to choose **Yes** or **No**.' },
  ]),

  /* ---------------- research assistant ---------------- */
  a('choosing-a-model', 'assistant', 'Choosing a model', 'The AI model menu, model tiers and which plan includes which.', 3, [
    { type: 'p', text: 'The **AI model** menu in the message box lists every model, with popular ones first. With many models there’s a search box at the top.' },
    { type: 'h2', text: 'Model tiers' },
    { type: 'p', text: 'Models come in three tiers: **Economy**, **Standard** and **Premium**. Your plan decides which tiers you can use. Models outside your plan stay in the list, greyed out with the plan they need.' },
    {
      type: 'table',
      head: ['Plan', 'Economy', 'Standard', 'Premium', 'Starts on'],
      rows: [
        ['Starter', true, true, false, 'Economy'],
        ['Scholar', true, true, false, 'Standard'],
        ['Lab', true, true, true, 'Standard'],
      ],
    },
    { type: 'p', text: 'New chats use the last model you picked, as long as your plan still includes it.' },
    { type: 'callout', tone: 'tip', title: 'Which to pick', text: 'Economy models are quick and fine for finding papers and short answers. Choose a Standard or Premium model for long, careful writing and harder reasoning.' },
  ]),
  a('web-and-paper-search', 'assistant', 'Where answers come from', 'Paper search, web search, reading papers and your shelf.', 3, [
    { type: 'h2', text: 'Papers' },
    { type: 'p', text: 'The assistant searches scholarly databases, led by OpenAlex. It can open a paper, follow its reference list, find papers that cite it and find similar papers. Retracted papers are left out unless you ask for them.' },
    { type: 'h2', text: 'The web' },
    { type: 'p', text: 'Web search lets the assistant search the open web and read pages and online PDFs. It’s on for new chats; switch it with **Web search** in the **+** menu. While it’s on, a **Web** chip shows in the message box. The setting is kept for each chat.' },
    {
      type: 'table',
      head: ['Plan', 'Web searches in one answer'],
      rows: [
        ['Starter', '4'],
        ['Scholar', '8'],
        ['Lab', '15'],
      ],
    },
    { type: 'h2', text: 'Reading papers' },
    { type: 'p', text: 'When it reads a paper, the assistant uses the full text when there’s one, and otherwise the abstract. The step tells you which.' },
    { type: 'h2', text: 'Your shelf' },
    { type: 'p', text: 'Ask about the papers you’ve saved, search them, check for retraction notices, find duplicates, or have the assistant save, tag and sort papers for you.' },
    { type: 'callout', tone: 'note', title: 'Daily paper searches', text: 'Paper searches count toward a daily limit: 50 on Starter, 150 on Scholar and 400 on Lab. It resets at midnight UTC.' },
  ]),
  a('attach-files', 'assistant', 'Attach files to a chat', 'Add PDFs, images and data files to a message.', 2, [
    { type: 'steps', items: [{ title: 'Open the + menu', text: 'In the message box, choose **+**, then **Upload files**. Where your browser allows it, **Take a screenshot** is there too.' }, { title: 'Add up to 5 files', text: 'They appear as cards on your message. Nothing is uploaded until you send.' }, { title: 'Ask about them', text: 'Ask a question that refers to the files, then press `Enter`.' }] },
    { type: 'h2', text: 'What you can attach' },
    {
      type: 'table',
      head: ['Limit', 'Value'],
      rows: [
        ['Files per message', '5'],
        ['Size of each file', '25 MB'],
        ['Text read from a file', 'The first 60,000 characters'],
        ['Types', 'PDF, PNG, JPEG, WEBP, GIF, TXT, MD, CSV, TSV, JSON, TEX, BIB, RIS, XML, HTML'],
      ],
    },
    { type: 'callout', tone: 'warn', title: 'Scanned PDFs', text: 'A PDF that is only pictures of pages has no text to read, so it can’t be attached. Deep research doesn’t take attachments.' },
  ]),
  a('files-and-analysis', 'assistant', 'Make files and analyse data', 'Word, PDF, slides, spreadsheets, charts and Python.', 3, [
    { type: 'p', text: 'Ask the assistant to make something and it appears under the answer as a **Download** card with its name and size.' },
    { type: 'h2', text: 'What it can make' },
    { type: 'list', items: ['Word documents, PDFs, slides and spreadsheets.', 'Charts from your numbers: bar, line, area, pie, scatter (with a trend line), histogram, box plot and heatmap, with error bars on bar and line charts.', 'PDF work: merge, split or pull out the text.', 'File conversions, ZIPs (making one from several files, or opening one into its files), and exports of your shelf.', 'With web search on, files downloaded from a link, such as a dataset, a ZIP or a paper’s supplementary file, ready for the other tools.'] },
    { type: 'h2', text: 'Reference files, drafts and your shelf' },
    {
      type: 'list',
      items: [
        '**Clean up references**: attach BibTeX or RIS files and ask to merge them, remove duplicates, or turn them into a reference list in any of the 12 citation styles.',
        '**Check references**: paste a reference list or attach a file, and the assistant checks each DOI against the paper database, flagging wrong titles, far-off years and retracted papers.',
        '**Count a draft**: words, sentences, reading time, readability, long sentences and repeated phrases, or what changed since an earlier draft.',
        '**Shelf statistics**: papers per year and your top journals, authors and topics, ready to chart.',
      ],
    },
    { type: 'h2', text: 'Analysing data with Python' },
    { type: 'p', text: 'Attach a CSV or spreadsheet and ask for statistics or a plot. The assistant runs Python in a private sandbox with pandas, numpy and matplotlib, and shows the code and output in a **Python** step you can open. Each run is short, up to about 40 seconds; files and variables carry over between runs for a few minutes. A heavier run (a longer time limit, three or more files, or installing packages) asks you first, with a **Show code** link so you can see what it will run.' },
    { type: 'callout', tone: 'tip', title: 'Tip', text: 'Say what you want the result to look like, for example “a bar chart of mean scores by group, as a PNG”.' },
  ]),
  a('manage-and-share-chats', 'assistant', 'Manage and share chats', 'Find old chats, pin, rename, delete and share them.', 2, [
    { type: 'h2', text: 'Your chats' },
    { type: 'p', text: 'The sidebar lists your chats under **Pinned**, **Today**, **Previous 7 days** and **Older**, with **View all** for the rest. Chats about a paper carry a **Paper** tag and open in the reader. Start a fresh one with **New chat**.' },
    { type: 'p', text: 'Use a chat’s **More** menu, or the title at the top of the chat, to **Pin**, **Rename** or **Delete** it. Deleting can’t be undone.' },
    { type: 'h2', text: 'Share a chat' },
    {
      type: 'steps',
      items: [
        { title: 'Choose Share', text: 'At the top of the chat.' },
        { title: 'Create the link', text: 'Switch from **Only you** to **Anyone with the link**, then **Create public link**. People with the link can read the chat but can’t reply.' },
        { title: 'Keep it current', text: 'The link shows the chat as it was when shared. Choose **Update link** to add newer messages, or **Stop sharing** to turn it off.' },
      ],
    },
    { type: 'callout', tone: 'note', title: 'What stays private', text: 'Files you attached, files the assistant made, your shelf notes and the details of each step are never shown on a shared chat.' },
  ]),

  /* ---------------- deep research ---------------- */
  a('run-deep-research', 'deep-research', 'Run a deep research report', 'Turn a big question into a structured report with numbered sources.', 4, [
    { type: 'p', text: 'Deep research is for questions too big for one answer. It plans the research, investigates each part, looks for gaps, then writes a report with numbered sources.' },
    { type: 'h2', text: 'Start a report' },
    {
      type: 'steps',
      items: [
        { title: 'Turn on Deep research', text: 'In the message box, open **+** and choose **Deep research**. A **Deep research** chip appears; it applies to your next message.' },
        { title: 'Ask your question', text: 'The box now says “What should I research?”. Describe the question and any scope, like years or field.' },
        { title: 'Confirm', text: 'You’re asked **Start deep research?** first. Choose **Start research** to begin.' },
      ],
    },
    { type: 'p', text: 'The assistant may also suggest it: when a question would benefit from a full report, a **Run deep research** button appears under its answer.' },
    { type: 'h2', text: 'What it does' },
    {
      type: 'table',
      head: ['Stage', 'What happens'],
      rows: [
        ['Planning the research', 'Splits your question into 3 to 5 sub-questions, shown as a plan'],
        ['Researching', 'Searches papers, and the web when web search is on, for each sub-question, a few at a time'],
        ['Checking what’s missing', 'Adds up to 2 follow-up questions for gaps'],
        ['Writing the report', 'Writes the report from what it found'],
      ],
    },
    { type: 'p', text: 'A report uses at most 30 sources and takes a few minutes.' },
    { type: 'callout', tone: 'tip', title: 'Get more sources', text: 'Leave web search on. If a report finds nothing, it says so and suggests turning web search on.' },
    { type: 'callout', tone: 'note', title: 'Good to know', text: 'Deep research is included in every plan. It doesn’t take file attachments.' },
  ], { isNew: true }),
  a('deep-research-report', 'deep-research', 'Reading and saving a report', 'How a report is laid out, and saving it as Word or PDF.', 2, [
    { type: 'h2', text: 'How a report is laid out' },
    { type: 'list', items: ['A title and a short summary of the findings.', 'Sections that answer each part of your question, with numbered citations like [3].', 'A **Limits** section on what the evidence can’t tell you.', 'A numbered **Sources** list with authors, year, title and link. Retracted sources are marked **(retracted)**.'] },
    { type: 'p', text: 'The line above the report counts the searches it ran and the sources it read and cited.' },
    { type: 'h2', text: 'Save it' },
    { type: 'p', text: 'Choose **Save as Word** or **Save as PDF** under the report to get a document with its sources. You can also copy it, have it read aloud, or ask follow-up questions in the same chat.' },
  ]),

  /* ---------------- papers & reader ---------------- */
  a('explore-papers', 'papers', 'Find papers in Explore', 'Search, browse, filter, preview and save papers.', 4, [
    { type: 'p', text: 'Open [Explore](/app/papers) to search papers or browse what’s new and popular.' },
    { type: 'h2', text: 'Search' },
    { type: 'p', text: 'Type keywords, a question, or paste your project aim, then press `Enter`. Choose how to search:' },
    {
      type: 'table',
      head: ['Mode', 'Best for'],
      rows: [
        ['Smart', 'Most searches: keywords and meaning together'],
        ['Exact keywords', 'Precise searches with “phrases”, AND, OR and NOT'],
        ['By meaning', 'Papers about an idea even when the words differ'],
      ],
    },
    { type: 'p', text: 'Sort results by **Best match**, **Most cited** or **Newest**.' },
    { type: 'h2', text: 'Browse' },
    { type: 'p', text: 'With nothing typed, Explore shows **Trending** (papers Citezeno readers viewed most in the last 7 days), **Most cited**, **Newest** and **Free to read**. Subject chips narrow it to a field.' },
    { type: 'h2', text: 'Filters' },
    { type: 'list', items: ['**Type**: article, review, preprint, book chapter, dataset and more.', '**Published**: a year range.', '**Access**: open access only, has a free PDF, has an abstract.', '**Citations**: 10+, 100+ or 1,000+.', '**Language**, under more filters.'] },
    { type: 'h2', text: 'Preview and save' },
    { type: 'p', text: 'Click a paper to preview it: its abstract, topics, **Papers it cites**, **Papers that cite it** and **More like this**. From there choose **Read**, **Save** or **Open original**. On a card, **Cite** copies an APA reference.' },
    { type: 'p', text: '**Save** puts a paper in **Unsorted** on your shelf. Use the arrow beside it to save straight into a project.' },
  ]),
  a('paper-reader', 'papers', 'Read a paper', 'Open any paper, move around it and find text.', 3, [
    { type: 'p', text: 'Choose **Read** on any paper in Explore, your shelf or a chat answer.' },
    { type: 'h2', text: 'Which version opens' },
    { type: 'list', items: ['Your own uploaded PDF, if you added one.', 'Otherwise the free open-access PDF.', 'If neither exists, the details and abstract, with **Open original** and **Upload PDF**.'] },
    { type: 'p', text: 'The left panel shows **Pages** and **Contents**; the right panel has **Chat**, **Notes** and **Details**. The reader remembers the page you stopped on, and opening a paper marked **To read** moves it to **Reading**.' },
    { type: 'h2', text: 'Keyboard shortcuts' },
    {
      type: 'keys',
      items: [
        { label: 'Next page', keys: ['N'] },
        { label: 'Previous page', keys: ['P'] },
        { label: 'Zoom in / out', keys: ['+', '−'] },
        { label: 'Fit to width', keys: ['0'] },
        { label: 'Find in this paper', keys: ['/'] },
        { label: 'Toggle side panels', keys: ['[', ']'] },
      ],
    },
    { type: 'p', text: '`J` and `K` also move between pages. The **More** menu has Open original, Download PDF, Upload a PDF and Mark as done.' },
    { type: 'callout', tone: 'note', title: 'Scanned PDFs', text: 'A PDF made of page images can be read, but searching, highlighting and AI help need text, so they’re off. Page notes still work.' },
  ]),
  a('highlights-and-notes', 'papers', 'Highlights and notes', 'Highlight in five colours, add notes and export them.', 2, [
    { type: 'steps', items: [{ title: 'Select text', text: 'Pick a colour: yellow, green, blue, pink or purple. You can also choose **Ask about this**, **Explain** or **Copy**.' }, { title: 'Add a note', text: 'Open a highlight and choose **Add note**. Notes can be up to 5,000 characters.' }, { title: 'Note a whole page', text: 'Use **Page note** to pin a note anywhere on a page.' }] },
    { type: 'p', text: 'The **Notes** tab lists everything, filters by colour, and exports as **Markdown** or **Text**.' },
    { type: 'callout', tone: 'tip', title: 'Saved for you', text: 'Highlighting or adding a note to a paper also saves it to your shelf, with an Undo if you didn’t mean to.' },
  ]),
  a('ask-a-paper', 'papers', 'Ask questions about a paper', 'Summaries and answers grounded in the paper’s own text.', 3, [
    { type: 'h2', text: 'Summarise' },
    { type: 'p', text: 'In the **Details** tab, choose **Summarize**. You get the paper’s question, method, findings, limits and key terms, each point linked to its passage. A summary is made once and then opens instantly. Papers with no full text are summarised from the abstract and labelled so.' },
    { type: 'h2', text: 'Ask' },
    { type: 'p', text: 'Open the **Chat** tab and choose a scope:' },
    {
      type: 'table',
      head: ['Scope', 'Answers from'],
      rows: [
        ['This paper', 'Only the paper, with links to the passages used'],
        ['Assistant', 'The full research assistant, which labels anything not from the paper'],
      ],
    },
    { type: 'p', text: 'Use **Save as note** to keep an answer with your notes, or **Copy** it.' },
    { type: 'callout', tone: 'note', title: 'Preparing paper…', text: 'The first time you ask about a paper, it’s prepared in the background. Reading doesn’t wait for it.' },
  ]),

  /* ---------------- shelf ---------------- */
  a('shelf-basics', 'shelf', 'Organise a literature review on your shelf', 'Projects, folders, tags, reading status and notes.', 4, [
    { type: 'p', text: '[My shelf](/app/shelf) holds everything you save. It has two views: **Library** for papers Citezeno found, and **My uploads** for your own files.' },
    { type: 'h2', text: 'Organise' },
    {
      type: 'table',
      head: ['Group', 'Use it for'],
      rows: [
        ['Projects', 'A thesis, a review or a course. Each can hold folders.'],
        ['Folders', 'Themes or chapters inside a project.'],
        ['Tags', 'Labels that cut across projects, like “method” or “to cite”.'],
        ['Unsorted', 'Papers not in any project yet.'],
      ],
    },
    { type: 'p', text: 'Deleting a project removes its folders, but the papers stay on your shelf.' },
    { type: 'h2', text: 'Track your reading' },
    { type: 'p', text: 'Open a paper to set its status to **To read**, **Reading** or **Done**, add it to projects and tags, and write **Your note**, up to 20,000 characters. Only you can see your notes.' },
    { type: 'h2', text: 'Find things' },
    { type: 'list', items: ['Sort by recently added, year, title or most cited.', 'Quick filters: **Open access**, **Has your PDF**, **Since 2020**, **Retracted**.', 'Select several papers to set status, move, tag, export or delete them together.', '**Possible duplicates** appears when two entries look like the same paper.'] },
    { type: 'h2', text: 'Kept up to date' },
    { type: 'p', text: 'Your shelf is checked against its sources for new citation counts and details: monthly on Starter, weekly on Scholar and daily on Lab. If a saved paper is retracted, you get a notice.' },
    {
      type: 'table',
      head: ['Plan', 'Papers on your shelf'],
      rows: [
        ['Starter', '1,000'],
        ['Scholar', '5,000'],
        ['Lab', '25,000'],
      ],
    },
  ]),
  a('your-pdfs', 'shelf', 'Upload and question your PDFs', 'Add your own PDFs, match them to papers and ask them anything.', 3, [
    { type: 'steps', items: [{ title: 'Upload', text: 'On your shelf, choose **Add papers**, then **Upload PDFs**, or drop files anywhere on the page.' }, { title: 'Match or keep', text: 'Each file is read for its DOI or title and you confirm the paper. If it isn’t a published paper, choose **Keep as my document**.' }, { title: 'Read and ask', text: 'Open it from **My uploads** with **Read**. It’s prepared once in the background so you can ask it questions.' }] },
    { type: 'p', text: 'You can also add your PDF to a paper you’ve already saved, from the reader or the paper’s details.' },
    { type: 'h2', text: 'Limits' },
    {
      type: 'table',
      head: ['Plan', 'Largest file', 'Total storage', 'Uploads a day'],
      rows: [
        ['Starter', '15 MB', '300 MB', '20'],
        ['Scholar', '30 MB', '1 GB', '60'],
        ['Lab', '50 MB', '5 GB', '150'],
      ],
    },
    { type: 'p', text: 'Only real PDF files are accepted. Choose the storage meter to see **Your PDFs**, where you can read, download or delete each file. Deleting a PDF keeps the paper on your shelf.' },
  ]),
  a('export-your-shelf', 'shelf', 'Export your shelf', 'Send papers to Zotero, Mendeley, EndNote or a spreadsheet.', 2, [
    { type: 'p', text: 'Export your whole shelf from the export menu, or select papers first and choose **Export** in the bar that appears.' },
    {
      type: 'table',
      head: ['Format', 'Use it for'],
      rows: [
        ['BibTeX (.bib)', 'LaTeX, Overleaf, Zotero, JabRef'],
        ['RIS (.ris)', 'Zotero, Mendeley, EndNote'],
        ['CSV', 'Excel or Google Sheets'],
        ['Everything (ZIP)', 'A full copy with your notes and PDFs'],
      ],
    },
    { type: 'code', file: 'references.bib', code: '@article{smith2024,\n  title   = {Title of the paper},\n  author  = {Smith, Jane and Lee, Min},\n  journal = {Journal name},\n  year    = {2024},\n  doi     = {10.1234/example}\n}' },
    { type: 'callout', tone: 'note', title: 'Always free', text: 'Exporting never costs anything, on any plan.' },
  ]),

  /* ---------------- citation studio ---------------- */
  a('trace-a-draft', 'citations', 'Find sources for a whole draft', 'Paste your writing and trace every claim to a real source.', 4, [
    { type: 'h2', text: 'Add your draft' },
    { type: 'p', text: 'In the [Citation studio](/app/citation), paste your text, use **Open file** (.docx, .txt or .md, up to 15 MB), or drop a file on the page. Word files keep their formatting in an **Original formatting** tab. Turn on **Mark claims** to underline the sentences worth citing.' },
    { type: 'h2', text: 'Trace' },
    {
      type: 'steps',
      items: [
        { title: 'Choose what to trace', text: 'Use the arrow beside the main button: **Let Citezeno choose** traces your strongest claims, **I’ll pick sentences** lets you choose.' },
        { title: 'Run it', text: 'Choose **Trace all claims** (or **Trace selected**), or press `Ctrl Enter`. Up to 40 sentences at a time.' },
        { title: 'Review the sources', text: 'Results open with your manuscript, references and each source’s match.' },
      ],
    },
    { type: 'h2', text: 'Settings' },
    { type: 'list', items: ['**Sources to find**: 1 to 40.', '**Databases**: OpenAlex, Crossref and Open Library are on; Wikipedia is off until you switch it on.', '**Filters**: year range, scholarly only or books, how strict a match must be, and open access only.'] },
    { type: 'h2', text: 'Check each source' },
    {
      type: 'table',
      head: ['Label', 'Meaning'],
      rows: [
        ['Strong match', 'The source closely supports the sentence'],
        ['Good match', 'A reasonable fit; worth a quick look'],
        ['Weak match, check it', 'Read it before you rely on it'],
      ],
    },
    { type: 'p', text: 'Open **Other matches** and choose **Use this** to swap a source, or **Add a source you already trust** with a DOI or ISBN. `Ctrl Z` undoes a change.' },
    { type: 'callout', tone: 'warn', title: 'Check before you cite', text: 'A match means the source is related, not that it proves your sentence. Read it before you cite it.' },
  ]),
  a('cite-this-claim', 'citations', 'Cite a single sentence', 'Find sources for one claim without tracing the whole draft.', 1, [
    { type: 'steps', items: [{ title: 'Select the sentence', text: 'Highlight it in your draft. A **Cite this claim** button appears.' }, { title: 'Choose how many', text: 'Pick 1, 2 or 3 sources.' }, { title: 'Find them', text: 'Choose **Find sources for this claim**.' }] },
    { type: 'p', text: 'You can also ask the [research assistant](/app/chat) with the **Cite a claim** shortcut.' },
  ]),
  a('styles-and-exports', 'citations', 'Styles and exports', '12 citation styles, five output forms, and Word, PDF and reference files.', 3, [
    { type: 'h2', text: 'Styles' },
    {
      type: 'table',
      head: ['Kind', 'Styles'],
      rows: [
        ['Author–date', 'APA 7th, MLA 9th, Harvard, Chicago author-date, ASA 7th'],
        ['Numbered', 'IEEE, Vancouver, AMA 11th, ACS, CSE 9th'],
        ['Notes', 'Chicago notes, Turabian 9th'],
      ],
    },
    { type: 'p', text: 'Switching style redraws your result instantly, without searching again. See every style in the [style gallery](/styles).' },
    { type: 'h2', text: 'Output forms' },
    { type: 'list', items: ['In-text citations', 'Footnotes', 'Endnotes', 'Bibliography only', 'Annotated bibliography, with a summary you can edit for each source'] },
    { type: 'p', text: 'Notes styles use footnotes rather than in-text citations.' },
    { type: 'h2', text: 'Export' },
    {
      type: 'table',
      head: ['Export', 'What you get'],
      rows: [
        ['Download Word', 'A .docx with real footnotes and hanging indents, for Word and Google Docs'],
        ['Download PDF', 'Print-ready, with clickable links and page numbers'],
        ['BibTeX, RIS, CSL-JSON', 'For Zotero, Mendeley, EndNote and LaTeX'],
        ['Plain text, HTML', 'To paste anywhere'],
      ],
    },
    { type: 'p', text: 'Word and PDF let you set the title, author, paper size, font size and line spacing, and choose the full manuscript or the reference list only.' },
    { type: 'h3', text: 'Bring your references in' },
    { type: 'p', text: 'Under **My sources**, choose **Import references** for a .bib or .ris file (up to 5 MB), or paste them.' },
  ]),
  a('check-citations', 'citations', 'Check existing citations', 'Find out whether the references in a draft are real.', 2, [
    { type: 'p', text: 'Choose **Check citations** in the studio. Each reference is looked up in Crossref and OpenAlex. It’s always free.' },
    {
      type: 'table',
      head: ['Result', 'Meaning'],
      rows: [
        ['Verified', 'Found, and the details match'],
        ['Partly matches', 'Found, but some details differ'],
        ['Not found, possibly fake', 'No record found; check it by hand'],
        ['Retracted', 'The paper was withdrawn'],
        ['Corrected', 'The paper has a published correction'],
        ['Could not check', 'The lookup failed; choose Retry'],
      ],
    },
    { type: 'p', text: 'It also flags references never cited in the text, and citations in the text with no matching reference.' },
    { type: 'callout', tone: 'note', title: 'Not found isn’t proof', text: 'Some real works, like reports and theses, aren’t in these databases. Check by hand before removing one.' },
  ]),
  a('library-and-sharing', 'citations', 'Your library and share links', 'Saved traces, and read-only links with a password.', 3, [
    { type: 'h2', text: 'Library' },
    { type: 'p', text: 'Every trace is saved to your **Library** and synced to your account. Search, filter by style, sort, rename, delete, or choose **Download all drafts** for a .zip.' },
    {
      type: 'table',
      head: ['Plan', 'Saved traces'],
      rows: [
        ['Starter', '100'],
        ['Scholar', '500'],
        ['Lab', '2,000'],
      ],
    },
    { type: 'h2', text: 'Share a trace' },
    { type: 'steps', items: [{ title: 'Open Share', text: 'From the result or the library. A trace is saved before it can be shared.' }, { title: 'Choose a design and style', text: 'Pick one of five designs and a citation style. Readers can switch the style and download BibTeX.' }, { title: 'Set access', text: 'Choose when it expires (never, 1, 7 or 30 days, or a date) and add an optional password of 4 or more characters.' }, { title: 'Copy the link', text: '**Create link & copy**. Later, **Update link**, see views, or **Turn off link**.' }] },
    { type: 'callout', tone: 'note', title: 'Private by default', text: 'Shared pages are read-only and hidden from search engines. Changing the password locks out anyone who used the old one.' },
  ]),

  /* ---------------- account & plans ---------------- */
  a('plans', 'account', 'Plans', 'What Starter, Scholar and Lab include.', 3, [
    { type: 'p', text: 'There are three plans, billed monthly, or yearly for 20% less. Compare prices on the [pricing page](/pricing).' },
    {
      type: 'table',
      head: ['', 'Starter', 'Scholar', 'Lab'],
      rows: [
        ['AI models', 'Economy + Standard', 'Economy + Standard', 'All, Premium too'],
        ['Deep research', true, true, true],
        ['Web searches per answer', '4', '8', '15'],
        ['Paper searches a day', '50', '150', '400'],
        ['Papers on your shelf', '1,000', '5,000', '25,000'],
        ['PDF storage', '300 MB', '1 GB', '5 GB'],
        ['Largest PDF', '15 MB', '30 MB', '50 MB'],
        ['Saved traces', '100', '500', '2,000'],
        ['Shelf kept up to date', 'Monthly', 'Weekly', 'Daily'],
      ],
    },
    { type: 'h2', text: 'Always free' },
    { type: 'p', text: 'Reading, highlighting, citation styles, exports, imports, citation checks and share links never cost anything. Without a plan you can still sign in, read, export and share everything you’ve made.' },
    { type: 'h2', text: 'Change or cancel' },
    { type: 'p', text: 'Choose **Plans and top-ups** on your [account page](/app/account) to change plan, and **Receipts and subscriptions** to manage billing or cancel. Payments are handled by Polar, which also takes care of sales tax and VAT.' },
  ]),
  a('account-and-security', 'account', 'Account and security', 'Your profile, password, two-factor, devices and history.', 2, [
    { type: 'p', text: 'Your [account page](/app/account) has these sections:' },
    {
      type: 'table',
      head: ['Section', 'What’s there'],
      rows: [
        ['Profile', 'Your name and email'],
        ['Credits and billing', 'Your plan, renewal date and receipts'],
        ['Library', 'How many traces you’ve saved and sources cited'],
        ['Sign-in and security', 'Connected accounts, change password, two-factor'],
        ['Devices', 'Sign out one device, or all others'],
        ['Delete account', 'Removes your account and saved work'],
      ],
    },
    { type: 'h2', text: 'Activity history' },
    { type: 'p', text: '[History](/app/history) lists your traces, sharing and sign-ins. Filter it, **Download CSV**, or **Clear history**.' },
    { type: 'callout', tone: 'warn', title: 'Deleting your account', text: 'This can’t be undone. Export your shelf and download your drafts first.' },
  ]),
];

/* docs home */
export const DOC_POPULAR = ['ask-your-first-question', 'run-deep-research', 'your-pdfs', 'trace-a-draft', 'highlights-and-notes'];
export const DOC_CHIPS = ['welcome', 'run-deep-research', 'explore-papers', 'your-pdfs', 'styles-and-exports'];
export const DOC_FEATURED = 'shelf-basics';
/* the help strip; a link without an href shows as "coming soon" */
export const DOC_HELP: { icon: IconName; title: string; text: string; link: string; href?: string }[] = [
  { icon: 'mail', title: 'Talk to a person', text: 'Can’t find it here? Write to us and a person will reply.', link: 'Contact us', href: '/contact' },
  { icon: 'pencil', title: 'What’s new', text: 'Every change to Citezeno, newest first.', link: 'Read the changelog' },
  { icon: 'pulse', title: 'System status', text: 'Check whether search and the assistant are running.', link: 'See status' },
];

/* ---------- lookups ---------- */
export const docHref = (slug: string) => `/docs/${slug}`;
export const docArticle = (slug: string) => DOC_ARTICLES.find((x) => x.slug === slug);
export const docCategory = (key: string) => DOC_CATEGORIES.find((c) => c.key === key)!;
export const docsIn = (key: string) => DOC_ARTICLES.filter((x) => x.category === key);
export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/* the guide's headings, for "On this page" */
export function docHeadings(d: DocArticle) {
  return d.blocks.flatMap((b) => (b.type === 'h2' || b.type === 'h3' ? [{ id: headingId(b.text), text: b.text, sub: b.type === 'h3' }] : []));
}

/* what ⌘K searches: every guide and every section heading */
export type DocSearchItem = { kind: 'guide' | 'section'; category: string; title: string; sub: string; href: string };
export function docSearchIndex(): DocSearchItem[] {
  return DOC_ARTICLES.flatMap((d) => [
    { kind: 'guide' as const, category: d.category, title: d.title, sub: docCategory(d.category).title, href: docHref(d.slug) },
    ...docHeadings(d).map((h) => ({ kind: 'section' as const, category: d.category, title: h.text, sub: `${d.title} › ${h.text}`, href: `${docHref(d.slug)}#${h.id}` })),
  ]);
}
