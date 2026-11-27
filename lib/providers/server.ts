import 'server-only';
import { loadChatModels, type ChatModels } from './chat/catalog';
import { CODE_SANDBOX_PROVIDERS, DEFAULT_CODE_SANDBOX } from './code-sandbox/registry';
import type { CodeSandbox } from './code-sandbox/types';
import { chooseProviders, choose } from './config';
import { embedder, type Embedder } from './embeddings/embedder';
import { DEFAULT_ENRICHERS, ENRICH_PROVIDERS } from './enrich/registry';
import type { PaperEnricher } from './enrich/types';
import { sendSpendAlert } from './gateway/alert';
import { createBreaker, type Breaker } from './gateway/breaker';
import { newFlights, type Flights } from './gateway/flight';
import { createLimiter, type Limiter } from './gateway/limiter';
import { newMeter, type Meter } from './gateway/meter';
import { gateway } from './gateway/stack';
import { gatewayStats, gatewayStores } from './gateway/store/server';
import { DEFAULT_PAPER_PROVIDERS, PAPER_PROVIDERS } from './papers/registry';
import { paperSources, type PaperSources } from './papers/sources';
import type { PaperSource } from './papers/types';
import { DEFAULT_PDF_TEXT, PDF_TEXT_PROVIDERS } from './pdf-text/registry';
import { pagesReader, type PdfPagesReader } from './pdf-text/pages';
import type { PdfTextReader } from './pdf-text/types';
import { DEFAULT_FILE_STORAGE, FILE_STORAGE_PROVIDERS } from './storage/registry';
import type { FileStore } from './storage/types';
import type { Env, Gate } from './types';
import { DEFAULT_WEB_FILES, WEB_FILES_PROVIDERS } from './web-files/registry';
import type { WebFiles } from './web-files/types';
import { DEFAULT_WEB_SEARCH, WEB_SEARCH_PROVIDERS } from './web-search/registry';
import type { WebSearch } from './web-search/types';

/* Where features get the provider for a job. Each provider is built from
   configuration with its outside calls wired through the gateway. Importing
   this from a client component fails the build ("server-only"), which keeps
   keys out of the browser. */

/* One in-process queue and breaker per provider, and the calls on their way,
   shared by every request. Parked on globalThis so dev reloads reuse them. */
const g = globalThis as unknown as { __czLimiters?: Map<string, Limiter>; __czBreakers?: Map<string, Breaker>; __czFlights?: Flights };
const limiters = (g.__czLimiters ??= new Map());
const breakers = (g.__czBreakers ??= new Map());
const flights = (g.__czFlights ??= newFlights());

/* The gate for one request: the gateway's layers, with this request's meter. */
export function gateFor(meter: Meter): Gate {
  return (transport, policy) => {
    let limiter = limiters.get(policy.provider);
    if (!limiter) limiters.set(policy.provider, (limiter = createLimiter({ concurrency: policy.concurrency, maxQueue: policy.maxQueue, label: policy.label })));
    const stats = gatewayStats();
    let breaker = breakers.get(policy.provider) ?? null;
    if (!breaker && policy.breaker) breakers.set(policy.provider, (breaker = createBreaker(policy.breaker, Date.now, () => stats.add(policy.provider, 'paused'))));
    return gateway({ transport, policy, ...gatewayStores(), limiter, flights, breaker, stats, alert: sendSpendAlert }, meter);
  };
}

/* The enabled paper sources (PAPER_PROVIDERS), primary first. */
export function paperSourcesFor(meter: Meter = newMeter(), env: Env = process.env): PaperSources {
  const gate = gateFor(meter);
  const built = chooseProviders(PAPER_PROVIDERS, choose.papers(env), DEFAULT_PAPER_PROVIDERS, 'paper')
    .map((d) => d.create(env, gate))
    .filter((s): s is PaperSource => s != null);
  return paperSources(built);
}

/* The providers that fill in paper details (PAPER_ENRICHERS), in the order
   listed; those not configured (a missing key or contact email) are left out. */
export function paperEnrichersFor(meter: Meter = newMeter(), env: Env = process.env): PaperEnricher[] {
  const gate = gateFor(meter);
  return chooseProviders(ENRICH_PROVIDERS, choose.enrichers(env), DEFAULT_ENRICHERS, 'paper enricher')
    .map((d) => d.create(env, gate))
    .filter((e): e is PaperEnricher => e != null);
}

/* The configured file storage, or null when it isn't set up. */
export function fileStorage(env: Env = process.env): FileStore | null {
  const [def] = chooseProviders(FILE_STORAGE_PROVIDERS, choose.fileStorage(env), DEFAULT_FILE_STORAGE, 'file storage');
  return def.create(env, gateFor(newMeter()));
}

/* The configured PDF text reader. */
export function pdfTextReader(env: Env = process.env): PdfTextReader {
  const [def] = chooseProviders(PDF_TEXT_PROVIDERS, choose.pdfText(env), DEFAULT_PDF_TEXT, 'PDF text');
  const reader = def.create(env, gateFor(newMeter()));
  if (!reader) throw new Error(`The PDF text provider "${def.name}" is not configured.`);
  return reader;
}

/* A PDF text reader that can read each page's text with positions (for the reader). */
export function pdfPagesReader(env: Env = process.env): PdfPagesReader {
  return pagesReader(env, gateFor(newMeter()));
}

/* The chat models on offer (AGENT_MODELS, OpenRouter's live list included),
   each provider wired through the gateway with this request's meter. */
export function chatModelsFor(meter: Meter = newMeter(), env: Env = process.env): Promise<ChatModels> {
  return loadChatModels(env, gateFor(meter));
}

/* The configured embedding model (READER_EMBEDDING_MODEL), wired through the
   gateway with this request's meter; null when its provider has no key. */
export function embedderFor(meter: Meter = newMeter(), env: Env = process.env): Embedder | null {
  return embedder(env, gateFor(meter));
}

/* Fetching open-access files and web pages (WEB_FILES_PROVIDER, default "direct-http"). */
export function webFiles(env: Env = process.env, meter: Meter = newMeter()): WebFiles {
  const [def] = chooseProviders(WEB_FILES_PROVIDERS, choose.webFiles(env), DEFAULT_WEB_FILES, 'web files');
  const files = def.create(env, gateFor(meter));
  if (!files) throw new Error(`The web files provider "${def.name}" is not configured.`);
  return files;
}

/* Searching the open web (WEB_SEARCH_PROVIDER, default "tavily"), wired through
   the gateway with this request's meter; null when its provider has no key. */
export function webSearchFor(meter: Meter = newMeter(), env: Env = process.env): WebSearch | null {
  const [def] = chooseProviders(WEB_SEARCH_PROVIDERS, choose.webSearch(env), DEFAULT_WEB_SEARCH, 'web search');
  return def.create(env, gateFor(meter));
}

/* The code sandbox (CODE_SANDBOX_PROVIDER, default "e2b"), wired through the
   gateway with this request's meter; null when its provider has no key. */
export function codeSandboxFor(meter: Meter = newMeter(), env: Env = process.env): CodeSandbox | null {
  const [def] = chooseProviders(CODE_SANDBOX_PROVIDERS, choose.codeSandbox(env), DEFAULT_CODE_SANDBOX, 'code sandbox');
  return def.create(env, gateFor(meter));
}
