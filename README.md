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

1. In Polar ([sandbox.polar.sh](https://sandbox.polar.sh) for testing), create one product per credit pack, e.g. “Starter: 200 credits, $5” and “Researcher: 1,000 credits, $19”. One-time or monthly products both work; a monthly product adds its credits on every renewal.
2. In each product's **metadata**, add `credits` = the number of credits it gives (e.g. `1000`). Add `featured` = `true` to highlight one. Products without `credits` don't appear on the pricing page.
3. Create an Organization Access Token and set `POLAR_ACCESS_TOKEN` and `POLAR_SERVER` (`sandbox` or `production`).
4. Add a webhook pointing to `{BETTER_AUTH_URL}/api/auth/polar/webhooks` for the `order.paid` and `order.refunded` events, then set `POLAR_WEBHOOK_SECRET`.

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
| `/contact` | Contact form that emails your team and keeps a copy in the database |
| `/privacy`, `/terms` | Privacy policy and terms of use |

## Studio features

- **Cite a single claim.** Select any passage in your draft and choose **Cite this claim**. Pick 1–3 sources and Citezeno searches for that passage alone. The citation is placed right after the selected words, and is added to any citations you already have.
- **Live claim highlighting.** As you type, citable sentences are underlined. Heavier lines mean a stronger factual claim.
- **12 citation styles.** APA 7, MLA 9, Chicago 17 (notes and author-date), Turabian 9, Harvard, ASA 7, IEEE, Vancouver, AMA 11, ACS, CSE 9.
- **5 output forms.** In-text citations, footnotes, endnotes, bibliography only, or an annotated bibliography with editable annotations.
- **Word and PDF downloads.** A real .docx (with genuine Word footnotes, hanging-indent references, clickable links and page numbers) or a print-ready PDF. Set the title, author, paper size (A4 or US Letter), text size and line spacing, and choose the full manuscript or the reference list only. A live first-page preview shows the result.
- **Library.** Every trace is saved in your browser so you can reopen it later, with its sources and edits. It also syncs to your account, so it follows you to any device.
- **Open a file.** Load a draft from .docx, .txt or .md, by button or by dropping the file on the editor.
- **Other matches.** Each source card lists the other works that matched its claim; pick one to replace it. Copy any single reference in the current style.
- **Six result views.** Manuscript, References, Sources (replace, copy, remove, or add your own by DOI or ISBN), Map (claims tied to sources by threads weighted by match strength), Insights (coverage, match strength, databases, publication years), and Export (Word, PDF, BibTeX, RIS, CSL-JSON, plain text, HTML).
- **Command menu.** Press `Ctrl K` (or `⌘ K`) to switch style or output, load a sample, change tabs, or toggle the theme. `Ctrl Enter` in the editor traces all claims, or cites the selected passage when the cite box is open.
- **Light and dark themes.** Your draft, preferences and settings are saved in the browser.

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

## Optional settings

In the studio, open **Database settings** to add a contact email (puts your requests in the faster “polite pool” at OpenAlex and Crossref) or an OpenAlex API key.

## Important

Citezeno finds works that are about the same topic as each claim. It can't read every paper in full. Open each source and check that it supports your sentence before you submit or publish.
