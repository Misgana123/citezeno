# Citezeno

Real, verifiable citations for AI-generated text, built with Next.js 15 and React 19.

Paste text from any AI model. Citezeno picks out the sentences that make factual claims, searches live public databases (OpenAlex, Crossref, Open Library, Wikipedia) for real published works behind each one, and formats the results in the citation style and output form you choose. Every reference comes from a record that exists. Nothing is invented.

## Run it

You need Node.js 20 or newer and a Postgres database (a free one from [Neon](https://neon.tech) works, or add Neon/Supabase from the Vercel Marketplace).

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:migrate           # creates the tables; safe to run again
npm run dev                  # http://localhost:3000
```

Without `RESEND_API_KEY`, emails (confirmation, password reset, contact messages) are printed in the terminal instead of sent, and email confirmation is not required. That's handy for local testing.

### Deploying to Vercel

1. Create a Postgres database and copy its connection string.
2. In Vercel → Project → Settings → Environment Variables, add every key from `.env.example` that you use. At minimum: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your live URL, e.g. `https://citezeno.vercel.app`), `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_TO`, plus the Polar keys to take payments.
3. Run the migration once against the production database: `DATABASE_URL="…" npm run db:migrate` (or put it in `.env.local` temporarily).
4. Redeploy.

### Email (Resend)

Create an API key at [resend.com](https://resend.com) and verify your sending domain there. Until a domain is verified, Resend only delivers mail from `onboarding@resend.dev` to your own Resend account address. Set `EMAIL_FROM` to an address on the verified domain.

### Credits and billing (Polar)

The studio needs an account, and searching costs **1 credit per claim**: every claim in a full trace, or the one passage in “Cite this claim”. The Trace button shows the cost first. Every account gets `NEXT_PUBLIC_FREE_MONTHLY_CREDITS` free credits (default 30) on the 1st of each month (UTC). Free credits don't roll over and are spent first; purchased credits never expire. If a trace is stopped or fails, its credits are returned (up to 10 times a day).

Polar handles the payments. Citezeno keeps the balance in its own database (`credit_balance`, `credit_ledger`).

There are two paid plans, **Scholar** and **Lab**, each billed monthly or annually; the pricing page shows them with a Monthly / Annually switch and the annual saving (`components/billing/PlanPicker.tsx`, `lib/plans.ts`).

1. In Polar ([sandbox.polar.sh](https://sandbox.polar.sh) for testing), create four subscription products: Scholar monthly ($7), Scholar yearly ($67.20), Lab monthly ($19) and Lab yearly ($182.40). Prices are read from Polar, so change them there.
2. Paste their IDs into `POLAR_SCHOLAR_MONTHLY_PRODUCT_ID`, `POLAR_SCHOLAR_ANNUAL_PRODUCT_ID`, `POLAR_LAB_MONTHLY_PRODUCT_ID` and `POLAR_LAB_ANNUAL_PRODUCT_ID`. Leave one empty to hide that option.
3. Set the credits each payment adds: `SCHOLAR_MONTHLY_CREDITS` (200), `SCHOLAR_ANNUAL_CREDITS` (2400), `LAB_MONTHLY_CREDITS` (1000), `LAB_ANNUAL_CREDITS` (12000). Annual plans add the whole year's credits when the payment arrives. No product metadata is needed for the plans.
4. Create an Organization Access Token and set `POLAR_ACCESS_TOKEN` and `POLAR_SERVER` (`sandbox` or `production`).
5. Add a webhook pointing to `{BETTER_AUTH_URL}/api/auth/polar/webhooks` for the `order.paid` and `order.refunded` events, then set `POLAR_WEBHOOK_SECRET`.

Any other active Polar product with a `credits` value in its metadata (e.g. a one-time top-up) still appears as its own card and adds that many credits.

Credits are added when `order.paid` arrives (repeat deliveries are ignored), and refunds take back the matching share. Without `POLAR_ACCESS_TOKEN`, billing is off: the free allowance still applies and the pricing page shows no buy buttons.

### Google and GitHub sign-in (optional)

Each button appears only when its keys are set. Register these callback URLs with the provider:

- Google: `{BETTER_AUTH_URL}/api/auth/callback/google`
- GitHub: `{BETTER_AUTH_URL}/api/auth/callback/github`

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page with the live claim-to-source demo, the four-step method and interactive style specimens |
| `/studio` | The app (sign-in required): a document-style editor with a toolbar and settings panel, tracing, and the results |
| `/styles` | Gallery of all 12 citation styles for an article, a book and a web page |
| `/sign-in`, `/sign-up` | Email and password accounts, plus Google and GitHub when configured |
| `/forgot-password`, `/reset-password`, `/verify-email` | Password reset and email confirmation |
| `/account` | Credits and billing history, Polar receipts portal, profile, sign-in methods, change password, signed-in devices, delete account |
| `/pricing` | Credit packs loaded live from Polar, plus the free tier |
| `/billing/success` | Shown after checkout while the credits arrive |
| `/library` | Every saved trace: search, filter, sort, rename, share, delete, reopen in the studio |
| `/papers` | Find Papers: search OpenAlex by keywords or meaning, preview papers and their references |
| `/shelf` | My shelf (Keep Papers): saved papers, projects, folders, tags, notes, PDFs, imports, search and export |
| `/s/[token]` | Public read-only view of a shared trace, in any style, with a BibTeX download |
| `/two-factor` | The code step of sign-in when two-step verification is on |
| `/history` | Activity timeline: traces, credits, sharing and security events, with filters and CSV export |
| `/styles/[id]` | One landing page per citation style, with examples, rules and an FAQ |
| `/admin` | Admin dashboard: key numbers, daily charts, users (adjust credits), contact inbox |
| `/contact` | Contact form that emails your team and keeps a copy in the database |
| `/privacy`, `/terms` | Privacy policy and terms of use |

## Studio features

- **Cite a single claim.** Select any passage in your draft and choose **Cite this claim**. Pick 1–3 sources and Citezeno searches for that passage alone. The citation is placed right after the selected words, and is added to any citations you already have.
- **Live claim highlighting.** As you type, citable sentences are underlined. Heavier lines mean a stronger factual claim.
- **12 citation styles.** APA 7, MLA 9, Chicago 17 (notes and author-date), Turabian 9, Harvard, ASA 7, IEEE, Vancouver, AMA 11, ACS, CSE 9.
- **5 output forms.** In-text citations, footnotes, endnotes, bibliography only, or an annotated bibliography with editable annotations.
- **Word and PDF downloads.** A real .docx (with genuine Word footnotes, hanging-indent references, clickable links and page numbers) or a print-ready PDF. Set the title, author, paper size (A4 or US Letter), text size and line spacing, and choose the full manuscript or the reference list only. A live first-page preview shows the result.
- **Library.** Every trace is saved in your browser so you can reopen it later, with its sources and edits. If you're signed in, your drafts and results are also saved to your account, so they follow you to any device.
- **Open a file.** Load a draft from .docx, .txt or .md, by button or by dropping the file on the editor.
- **Other matches.** Each source card lists the other works that matched its claim; pick one to replace it. Copy any single reference in the current style.
- **Six result views.** Manuscript, References, Sources (replace, copy, remove, or add your own by DOI or ISBN), Map (claims tied to sources by threads weighted by match strength), Insights (coverage, match strength, databases, publication years), and Export (Word, PDF, BibTeX, RIS, CSL-JSON, plain text, HTML).
- **Command menu.** Press `Ctrl K` (or `⌘ K`) to switch style or output, load a sample, change tabs, or toggle the theme. `Ctrl Enter` in the editor traces all claims, or cites the selected passage when the cite box is open.
- **Light and dark themes.** Your draft, preferences and settings are saved in the browser.

## Features added in v6

- **Undo and redo for sources.** Swapping in another match, removing a source, adding one by DOI or ISBN and changing a cited page number can all be undone and redone (at least 50 steps per trace) with the buttons beside the Style menu, the command menu, or `Ctrl Z` / `Ctrl Shift Z` (`⌘` on a Mac) when the focus isn't in a text field. Typing a page number counts as one step. The history starts again with each new trace, each "Cite this claim" and each trace opened from the library. Logic in `lib/undo.ts`.
- **No more silent library deletions.** Before a new trace would push the oldest one out of a full library (200 traces in an account, 12 in a browser), the studio names that trace and offers **Download it first**, **Continue** or **Cancel**. Cancel leaves the new trace unsaved, with a "Not saved · Save" button in the top bar. From 190 traces the library page and the studio's library drawer show a notice.
- **Download all drafts.** A button on the library page and in the studio's library drawer builds a .zip in the browser with, for every trace, the draft (.txt), the bibliography in that trace's style (.txt) and the full trace data (.json), named by date and title (`lib/export-all.ts`).
- **Share link expiry and password.** In the share dialog, set a link to expire never (the default), after 1, 7 or 30 days, or on a date, and optionally require a password. Passwords are hashed with the same scrypt hashing Better Auth uses for account passwords; the public page only reads a fingerprint of the hash. Wrong passwords are limited to 5 a minute per address and link, in Better Auth's `rateLimit` table. Expired links show "This link has expired"; protected links ask for the password first and remember it in that browser for 12 hours (until the password changes). The library page shows each link's expiry and password status. Turning a link off clears both. Run `npm run db:migrate` once to add the `shareExpiresAt` and `sharePassword` columns.
- **Clearer privacy wording.** The trace settings panel now says: "Searches run in your browser. If you're signed in, your drafts and results are saved to your account so you can find them later."
- **Pick the sentences to cite.** Beside the trace button (and in Trace settings) choose **Let Citezeno choose** (the default, unchanged) or **I'll pick sentences**. In pick mode, click sentences in the draft (or move the caret and press Enter) to select or unselect them, any sentence, underlined or not; **Add suggested** starts from Citezeno's own choice. **Trace selected** searches only those sentences with the same search and ranking, charging one credit per picked claim through the existing credit code. Up to 40 per trace.
- **One source for two claims.** After every claim gets its best unused source (as before), a claim may also cite a source already used elsewhere, but only on a strong match: at least 0.55 and 0.15 above the match strictness (`SHARED_SOURCE_THRESHOLD` in `lib/engine.ts`), one such source per claim. It appears once in the reference list, keeps one number in numbered styles, and later notes use the short form. Its source card says "Also cited for another claim".
- **Citations follow reworded sentences.** When the draft is edited and you cite another claim, each earlier citation stays on its sentence if it is unchanged, or moves to the closest reworded sentence if they are at least 75% alike (`REATTACH_MIN_SIMILARITY` in `lib/reattach.ts`, word overlap plus edit distance). Anything else is listed as **detached** above the results, to re-attach to a sentence or remove, never dropped silently. The editor's "cited" marks follow the same rule while you type.
- **Import references (BibTeX and RIS).** In the Sources tab, **My sources** imports .bib and .ris files (or pasted text) from Zotero, Mendeley, EndNote and similar, parsed in the browser (`lib/bibimport.ts`). Duplicates are skipped by DOI or title and year, including ones already in the trace, and a summary lists anything that couldn't be read and why. Cite any imported reference on any sentence or put it in the reference list; the style engine formats it like any other source. Importing is free.
- **Check existing citations.** "Check citations" in the editor toolbar (or the command menu) finds the references already in a draft: DOIs anywhere, a list under References / Bibliography / Works Cited / Sources, and in-text citations like (Smith, 2020), Smith (2020), [3] or (3). Each reference is looked up from the browser with the existing clients, same timeouts, retries and 5 at a time (`lib/refcheck.ts`, `lib/refcheck-run.ts`): a DOI directly in OpenAlex (for its retracted flag) and Crossref (for retraction and correction notices), otherwise a bibliographic search by title and first author (plus Open Library for books). Each is labelled Verified, Partly matches (saying what differs), Not found (possibly fake), Retracted / Corrected, or Could not check. A failed request is never reported as fake, and those can be retried. In-text citations with no reference and references never cited are flagged. For a reference that wasn't found, "Find a real source for this sentence" runs the usual Cite this claim (1 credit). The check is free.
- **Original formatting of .docx drafts.** Opening a .docx still fills the editor with its plain text, exactly as before. An **Original formatting** tab beside the editor shows the Word file read-only, with headings, emphasis, lists, tables, links and images, rendered in the browser by [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) 0.4.1 (Apache-2.0), which is only downloaded when the tab is first opened. The file stays in memory for the session; it is never uploaded or saved.

## Features added in v5

- **Studio workspace.** The studio is now a full-window app shell: a navigation rail (library, history, style guide, help, database settings), a top bar (title, saved status, command search, credits, Share, Trace), a left panel with the citation styles and a **claims outline**, the writing canvas, and a trace-settings panel. Click a claim in the outline to select that sentence in your draft and cite just that passage. On tablets the two side panels open as drawers; on phones the rail becomes a bottom bar and Trace floats above it. The shell lives in `components/studio/Studio.tsx` with `SidePanel.tsx` and `Controls.tsx`, styled by `app/atelier.css`.
- **One workspace.** Library, History, Account, Admin and the purchase confirmation now use the same rail and top bar as the studio (`components/app/AppShell.tsx`), so moving between them never leaves the workspace. The editor's paper no longer shares the `.page` class with the site's page layout, which had been restyling those pages (and Contact, Privacy and Terms) as a narrow white column.
- **Share designs.** Sharing now opens a dialog instead of copying a link straight away. Pick one of five designs for the public page (Dossier, Reading Room, Cyanotype, Monograph, Claim Threads), the citation style and the output form, and watch a live preview of the exact page a viewer will see. Nothing is published until **Create link & copy**. Reopen the dialog later to change the design: the link stays the same, and the dialog says when the live page is behind your changes. The designs live in `components/share/themes.tsx` with their styles in `app/share.css`, and the same components render both the public page and the preview. Run `npm run db:migrate` once to add the `shareTheme` column.

## Features added in v4

- **History** at `/history` is one timeline of everything on the account: traces created, renamed, shared and deleted; every credit spent, returned, bought or granted; sign-ins, password changes and two-step verification changes. It's grouped by day in your own time zone, with filters (traces, credits, sharing, security), paging, CSV download and “Clear history”. Credit records are kept when you clear it.
- **SEO**
  - Every public page has its own title, description, canonical URL and Open Graph/Twitter card. Private pages are `noindex` and blocked in `robots.txt`.
  - **12 style landing pages** (`/styles/apa`, `/styles/mla`, …) target searches like “APA citation generator”. Each has live examples for an article, a book and a web page, key rules, an FAQ and its own share image.
  - Structured data (JSON-LD): Organization, WebSite, WebApplication with offers, FAQPage (home, pricing, style pages), HowTo and BreadcrumbList.
  - A generated social share image (1200×630), Apple touch icon, web app manifest, and a sitemap of every public page.
  - The home page gains a visible FAQ and links to every style page. The pricing page is now static (refreshed every 5 minutes), so it loads fast for crawlers.
  - Set `GOOGLE_SITE_VERIFICATION` to verify the site in Google Search Console, then submit `https://<your-domain>/sitemap.xml` there.

## Features added in v3

- **Retraction check.** Works OpenAlex marks as retracted are never picked automatically, and any that you add by hand show a red “Retracted” tag.
- **Shareable links.** From the studio (Share) or the library page, publish a read-only link. Viewers can switch citation style and download BibTeX. You can turn the link off at any time, and view counts are shown. Shared HTML is sanitised before anyone else sees it.
- **Library page** at `/library`, with search, style filter, sorting, renaming (renamed titles stick), sharing and deleting. A trace deleted there is also removed from your other browsers.
- **Two-step verification** with authenticator-app codes, 10 backup codes and a “trust this device for 30 days” option. Set it up under Account → Sign-in and security.
- **Admin dashboard** at `/admin`, for the emails in `ADMIN_EMAILS`: accounts, weekly active users, credits used, revenue, daily charts, user search with credit adjustments, and the contact inbox with handled/open status.
- **Welcome email** when an account is confirmed (or right away for Google/GitHub sign-ups).
- **Security headers** on every response: Content-Security-Policy, HSTS, X-Frame-Options and Referrer-Policy.
- **Tests and CI.** `npm test` runs unit tests for styles, claim detection, sanitising, redirects and credit months. GitHub Actions type-checks, tests and builds on every push.

## Accounts and security

- Authentication is [Better Auth](https://better-auth.com) (`lib/auth.ts`), with sessions in Postgres and a 30-day sliding expiry.
- With email set up, new accounts must confirm their address before signing in, and deleting an account needs a click in an email.
- Sign-in, sign-up, password reset and other sensitive endpoints are rate limited (stored in the database, so it works on serverless).
- Resetting a password signs out every other device.
- The contact form has a honeypot field, a same-origin check and a limit of 5 messages per hour per IP address.
- The studio requires an account. Searches still run in the browser, but each one must reserve credits on the server first.

## Project layout

```
app/
  (auth)/             sign-in, sign-up, forgot/reset password, verify email
  account/            account settings
  contact/            contact page
  api/auth/           Better Auth handler
  api/traces/         the signed-in user's saved library
  api/contact/        contact form endpoint
  api/credits/        balance, spend and refund
  pricing/, billing/  pricing page and checkout success
  library/            full library page
  s/[token]/          public shared trace
  admin/              admin dashboard
  api/admin/          admin actions (credits, inbox)
  privacy/, terms/    legal pages
  site.css            accounts, contact, legal and system pages
  layout.tsx          fonts, theme script, command menu, toasts
  page.tsx            landing page
  studio/page.tsx     the studio
  styles/page.tsx     style gallery
  globals.css         design tokens, landing page, shared UI
  studio.css          studio, results and gallery
components/
  HeroThread.tsx      animated claim-to-source demo
  Specimens.tsx       interactive style specimens
  CommandPalette.tsx  Ctrl K menu with a small command registry
  studio/             Editor, Controls, Progress, Results, SourceCards,
                      CitezenoMap, Insights, SettingsDialog
lib/
  auth.ts             Better Auth config (providers, email, rate limits)
  auth-client.ts      browser auth client and error messages
  db.ts               Postgres pool
  email.ts            Resend sender and email templates
  cloud.ts            syncs the studio library with the account
  credits.ts          credit ledger: monthly free credits, spend, refund, purchases
  polar.ts            Polar checkout, portal, webhooks and the product list
  pricing.ts          pricing rules shared by browser and server
  admin.ts            who can open /admin
  sanitize.ts         cleans shared HTML before it's shown publicly
  site.ts             the site's public URL
  docmodel.ts         rendered manuscript → document model for Word/PDF
  docx.ts             Word (.docx) writer
  pdf.ts              PDF writer (Times, links, page numbers)
  zip.ts              ZIP writer and reader used for .docx
  importfile.ts       reads .docx / .txt / .md drafts
  library.ts          recent traces saved in the browser
  exportdoc.ts        Word and PDF download actions
  text.ts             sentence splitting, key phrases, claim scoring, relevance
  sources.ts          OpenAlex / Crossref / Open Library / Wikipedia clients
  styles.ts           citation style engine + BibTeX / RIS / CSL-JSON
  engine.ts           tracing pipeline, source assignment, manuscript renderer, exports
```

Runtime dependencies are Next.js, React, Better Auth, `pg`, Resend and Polar. Icons, charts, the command menu, toasts and the Word and PDF writers are all built in. `scripts/migrate.ts` creates the database tables.

## My shelf (Keep Papers)

Every user's personal library of papers, at `/shelf` (named Shelf because "library" is the studio's saved traces). Code lives in `lib/shelf/`, `components/shelf/` and `app/api/shelf/`; the plan is in `docs/coreidea.md`.

- **Tables**: `npm run db:migrate` creates the `shelf_*` tables. Deleting an account removes the whole shelf.
- **PDF storage (Cloudflare R2)**: create a private R2 bucket and an API token with "Object Read & Write" on it, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`. Add the bucket CORS rule shown in `.env.example` (GET and PUT from your site's domains). The browser uploads straight to R2 with a short-lived signed PUT, because Vercel caps request bodies at 4.5 MB, and files are read only through links that expire after a few minutes. Without the R2 keys, uploads are switched off with a clear message. To keep using Cloudinary instead, set `FILE_STORAGE_PROVIDER=cloudinary` and `CLOUDINARY_URL` (Cloudinary → Settings → API Keys, and turn on Settings → Security → "Allow delivery of PDF and ZIP files").
- **Background work (Vercel Cron)**: `vercel.json` calls `/api/shelf/cron` every minute (needs Vercel Pro). Set `CRON_SECRET` to any long random string; Vercel sends it, and the route refuses calls without it. Each run works through imports, removes deleted PDFs from storage, rechecks saved papers with OpenAlex (citations, retractions) and clears abandoned uploads.
- **OpenAlex**: every call goes through Find Papers' cache, rate limiter, cost log and daily cap. Title searches count toward the user's daily search limit.
- **Limits**: `SHELF_PDF_MAX_MB`, `SHELF_STORAGE_MB`, `SHELF_UPLOADS_PER_DAY`, `SHELF_IMPORT_MAX_MB`, `SHELF_IMPORT_MAX_ENTRIES`, `SHELF_REFRESH_DAYS`, `SHELF_REFRESH_BATCHES` (see `.env.example`).
- **Tests**: the Shelf database tests run against a throwaway schema when `TEST_DATABASE_URL` is set (for example to your local `DATABASE_URL`); without it they are skipped.

## Read papers (Reader)

Open any paper at `/app/read/<paper id>` (for example `/app/read/openalex:W2626778328`) to read it, highlight it, get a summary and ask it questions. Code lives in `lib/reader/`, `components/reader/` and `app/api/reader/`; the plan is in `docs/coreidea.md`.

- **The PDF**: the user's own upload first, then the open-access PDF from OpenAlex (one shared copy is kept in storage only for CC BY, CC BY-SA, CC0 and public-domain papers; others are fetched fresh and streamed each time), else the details and abstract.
- **Tables and search by meaning**: `npm run db:migrate` creates the `reader_*` tables and turns on pgvector when the database offers it (it prints which). Without pgvector, questions use keyword search only.
- **Background work (Vercel Cron)**: `vercel.json` also calls `/api/reader/cron` every minute with `CRON_SECRET`: it reads new PDFs into passages, embeds them, re-embeds after an embedding model change and removes shared copies nobody opened for 90 days. A paper opened in the app starts processing right away.
- **AI**: summaries, "Ask the paper" and Explain use the chat models (`READER_MODEL`, `READER_FAST_MODEL`); embeddings use Gemini (`READER_EMBEDDING_MODEL`, `READER_EMBEDDING_DIMENSIONS`), all with the AI keys and daily cap above. Without an AI key the reader still opens, reads and highlights. Every AI call is logged in `reader_ai_log`.
- **Running locally**: nothing extra beyond the keys above; PDF.js's worker is served by `/api/reader/worker`. For open-access PDFs stored in R2, the bucket's CORS rule must allow GET from `http://localhost:3000`.

## Optional settings

In the studio, open **Database settings** to add a contact email (puts your requests in the faster “polite pool” at OpenAlex and Crossref) or an OpenAlex API key.

## Important

Citezeno finds works that are about the same topic as each claim. It can't read every paper in full. Open each source and check that it supports your sentence before you submit or publish.
