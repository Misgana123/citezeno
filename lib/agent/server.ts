import 'server-only';
import { auth } from '@/lib/auth';
import { InsufficientCredits, isCreditError } from '@/lib/credits/errors';
import { papersConfigFor, shelfConfigFor } from '@/lib/credits/limits';
import { billing, wallet } from '@/lib/credits/server';
import { pool } from '@/lib/db';
import { json, sameOrigin } from '@/lib/http';
import { papersServer } from '@/lib/papers/server';
import { NO_PLAN } from '@/lib/plans';
import { newMeter, type CallCredits } from '@/lib/providers/gateway/meter';
import type { Attachment } from '@/lib/providers/chat/types';
import { chatModelsFor, codeSandboxFor, fileStorage, pdfTextReader, webFiles, webSearchFor } from '@/lib/providers/server';
import { allow } from '@/lib/ratelimit';
import { shelfConfig } from '@/lib/shelf/config';
import type { AgentContext } from './context';
import { agentFiles } from './files';
import { projectContext, readingContext, sandboxContext, skillContext, timeContext, webContext } from './prompt';
import { takeSkill } from '@/lib/skills/store';
import { skillLabOf } from '@/lib/skills/lab';
import { labChatFor, labProjectFor } from '@/lib/labs/chat';
import { listProjects } from '@/lib/shelf/store/projects';
import { research, RESEARCH_MS } from './research';
import { replyCredits, type ReplyCredits, type ReplyKind } from './credits';
import { modelAccess, ModelLocked } from './models';
import { codeRunner } from './sandbox';
import { searchReservations } from './limits';
import { answer, repairHistory, resume, resumeWithClientResult, retry, type ClientOutcome, type LoopDeps } from './loop';
import { claimRun, createConversation, dropAfterLastUserMessage, renameConversation, getConversation, loadMessages, noteCredits, releaseRun, setModel, setPending, setWebSearch, titleFrom, appendMessages, type Conversation } from './store';
import { offeredTools } from './tools';
import { tally, type ToolDisplay } from './tools/types';
import type { AgentEvent, Pending } from './types';

/* The research agent on the server: who is asking, their limits, the chosen
   model, and the reply streamed to the chat page one step at a time
   (one JSON event per line). */

/* Model calls per user message; a reply stops starting new steps after this long. */
const MAX_TURNS = Math.max(1, Math.floor(Number(process.env.AGENT_MAX_STEPS) || 10));
const REPLY_MS = 50_000;
/* Messages one user may send per minute. */
const PER_MINUTE = 20;

export class AgentHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function agentUser(req: Request): Promise<string> {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) throw new AgentHttpError(403, 'Bad origin.', 'bad_request');
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) throw new AgentHttpError(401, 'Sign in to use the assistant.', 'signed_out');
  return s.user.id;
}

/* Wraps an /api/agent handler: errors become JSON. */
export function agentRoute<P = Record<string, never>>(handler: (req: Request, userId: string, params: P) => Promise<Response>) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    try {
      return await handler(req, await agentUser(req), await params);
    } catch (e) {
      if (e instanceof AgentHttpError) return json({ error: e.message, code: e.code }, e.status);
      const err = e as { name?: string; message?: string; code?: string };
      if (err?.name === 'ZodError' || err?.code === 'bad_request') return json({ error: err.message || 'Check the request.', code: 'bad_request' }, 400);
      console.error('[citezeno] agent: unexpected error', e);
      return json({ error: 'Something went wrong. Please try again.', code: 'unavailable' }, 500);
    }
  };
}

/* What the user's plan allows (no plan → the no-plan limits). */
const limitsOf = async (userId: string) => (await billing().currentPlan(userId))?.limits ?? NO_PLAN;

/* The models on offer for this user's plan (locked ones marked), and whether
   web search is set up (new chats start with it on when it is). */
export const agentModels = async (userId: string) => ({ ...modelAccess(await chatModelsFor(), await limitsOf(userId)).info(), web: webSearchFor() != null });

/* The model a new chat starts with: the one asked for, if the plan allows it, else the plan's default. */
async function newChatModel(userId: string, asked: string | null | undefined) {
  try {
    const model = modelAccess(await chatModelsFor(), await limitsOf(userId)).pick(asked);
    if (!model) throw new AgentHttpError(503, 'The assistant isn’t set up yet: no AI model is available.', 'unavailable');
    return model;
  } catch (e) {
    if (e instanceof ModelLocked) throw new AgentHttpError(403, e.message, 'model_locked');
    throw e;
  }
}

/* named: the chat was just made here, so the model titles it in its first reply */
type Start = { conversation: Conversation; run(deps: LoopDeps, history: Parameters<typeof answer>[1]): Promise<void>; extraSystem?: string; named?: boolean; timeZone?: string };

/* A reply as a stream of events. The work happens while the stream is open. */
async function streamReply(userId: string, req: Request, start: () => Promise<Start>, modelId: string | null | undefined, replyMs = REPLY_MS, kind: ReplyKind = 'assistant'): Promise<Response> {
  if (!(await allow(`agent:${userId}`, 60, PER_MINUTE))) throw new AgentHttpError(429, 'Too many messages. Please wait a moment.', 'busy');
  let limits = await limitsOf(userId);
  if (kind === 'research' && limits.researchBudgetCap == null) throw new AgentHttpError(403, 'Deep research needs a plan. Choose one on the pricing page.', 'plan_required');

  // every provider call this reply makes is charged to its credits (set once the model is known)
  let credits: ReplyCredits | null = null;
  const hooks: CallCredits = { before: async (p, usd) => credits?.calls.before(p, usd), after: async (c) => credits?.calls.after(c) };
  const meter = newMeter(hooks);
  const models = await chatModelsFor(meter);
  const { conversation, run, extraSystem, named, timeZone } = await start();
  // a chat inside a lab project: who may write, the lab's shelf for the tools, and whose credits pay
  const labChat = await labChatFor({ db: pool, limitsOf }, userId, conversation);
  if (conversation.labId && !labChat) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
  if (labChat && !labChat.canPost) throw new AgentHttpError(403, 'You can read this chat. Only people who can edit the project can write in it.', 'forbidden');
  const payer = labChat?.payer ?? userId;
  if (payer !== userId) limits = await limitsOf(payer);
  let model;
  try {
    // a model the plan doesn't allow: refused when asked for, replaced by the plan's default when it's the chat's own
    model = modelAccess(models, limits).pick(modelId, conversation.model);
  } catch (e) {
    if (e instanceof ModelLocked) throw new AgentHttpError(403, e.message, 'model_locked');
    throw e;
  }
  if (!model) throw new AgentHttpError(503, 'The assistant isn’t set up yet: no AI model is available.', 'unavailable');
  const reply = replyCredits(wallet(), { userId: payer, kind, model, limits, ttlMs: replyMs + 5 * 60_000, meta: { conversationId: conversation.id, ...(labChat ? { labId: labChat.lab.id, memberId: userId } : {}) } });
  try {
    await reply.start();
  } catch (e) {
    if (e instanceof InsufficientCredits) throw new AgentHttpError(402, payer !== userId ? 'The lab is out of credits for now. Ask its owner to top up.' : `${e.message}${labChat?.overCap ? ' You’ve reached your lab credit cap for this month, so your own credits are used.' : ''} Choose a plan or top up to continue.`, 'insufficient_credits');
    if (isCreditError(e)) throw new AgentHttpError(429, e.message, e.code);
    throw e;
  }
  credits = reply;
  if (!(await claimRun(pool, conversation.ownerId, conversation.id, Math.ceil(replyMs / 1000) + 30))) {
    await reply.finish({ outcome: 'busy', useful: false });
    throw new AgentHttpError(409, 'Still working on your last message.', 'busy');
  }
  if (model.id !== conversation.model) await setModel(pool, conversation.ownerId, conversation.id, model.id);

  const papers = papersServer();
  const papersConfig = papersConfigFor(papers.config, limits);
  const searches = searchReservations(papers.usage, userId, papersConfig.dailySearchesPerUser);
  let sources: ReturnType<typeof papers.sources> | null = null;
  let web: ReturnType<typeof webSearchFor> | undefined;
  const ctx: AgentContext = {
    userId,
    db: pool,
    sources: () => (sources ??= papers.sources(meter)),
    papersConfig,
    shelfConfig: shelfConfigFor(shelfConfig(), limits),
    reserveSearches: searches.reserve,
    webSearch: () => (web === undefined ? (web = webSearchFor(meter)) : web),
    webFiles: () => webFiles(process.env, meter),
    pdfText: () => pdfTextReader(),
    chatAttachments: async () => (await loadMessages(pool, conversation.id)).flatMap(({ message: m }) => (m.role === 'user' ? (m.attachments ?? []) : [])),
    // the code sandbox (Python runs, office conversions) comes with the Lab plan only
    code: () => {
      if (!limits.codeSandbox) return null;
      const sandbox = codeSandboxFor(meter);
      return sandbox ? codeRunner(sandbox, pool, { userId, conversationId: conversation.id }) : null;
    },
    files: agentFiles({ db: pool, store: fileStorage(), maxTotalBytes: limits.agentFilesBytes }, { userId, conversationId: conversation.id }),
    credits: reply.meter,
    limits,
    timeZone,
    ...(labChat ? { shelfUserId: labChat.lab.shelfUserId } : {}),
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let open = true;
  // how the reply went, for its bill: nothing is charged when it failed without giving anything
  let gave = false;
  let ended = 'finished';
  const emit = (e: AgentEvent) => {
    if (e.type === 'text' || e.type === 'step_done' || e.type === 'confirm' || e.type === 'client_tool') gave = true;
    if (e.type === 'error') ended = 'failed';
    else if (e.type === 'done') ended = e.reason;
    if (open) writer.write(encoder.encode(`${JSON.stringify(e)}\n`)).catch(() => (open = false));
  };
  req.signal?.addEventListener('abort', () => (open = false));

  emit({ type: 'conversation', id: conversation.id, title: conversation.title, model: model.id });
  const deps: LoopDeps = {
    ctx,
    chat: models.provider(model),
    model,
    emit,
    save: (m) => appendMessages(pool, conversation.id, m, userId),
    setPending: (p) => setPending(pool, conversation.id, p),
    maxTurns: MAX_TURNS,
    deadline: Date.now() + replyMs,
    extraSystem: (extraSystem ?? '') + timeContext(timeZone) + (conversation.webSearch ? webContext() : '') + (limits.codeSandbox ? '' : sandboxContext()),
    tools: offeredTools({ web: conversation.webSearch, sandbox: limits.codeSandbox }),
    ...(named
      ? {
          naming: {
            async onTitle(title: string) {
              if (await renameConversation(pool, conversation.ownerId, conversation.id, title)) emit({ type: 'title', title });
            },
          },
        }
      : {}),
  };

  void (async () => {
    try {
      const history = repairHistory((await loadMessages(pool, conversation.id)).map((m) => m.message));
      await run(deps, history);
    } catch (e) {
      console.error('[citezeno] agent: reply failed', e);
      emit({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      try {
        const bill = await reply.finish({ outcome: ended, useful: gave });
        if (bill) {
          emit({ type: 'credits', charged: bill.charged });
          await noteCredits(pool, conversation.id, { credits: bill.charged, actionId: reply.meter.actionId });
        }
      } catch (e) {
        console.error('[citezeno] agent: settling credits failed', e);
      }
      await searches.settle(meter.searches).catch((e) => console.warn('[citezeno] agent: settling searches failed', e));
      await releaseRun(pool, conversation.id).catch(() => {});
      open = false;
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}

/* A new message, in a new conversation or an existing one. */
export function replyToMessage(req: Request, userId: string, body: { conversationId?: string | null; text: string; model?: string | null; paperId?: string | null; attachments?: Attachment[]; webSearch?: boolean; skill?: string | null; projectId?: string | null; timeZone?: string }) {
  return streamReply(
    userId,
    req,
    async () => {
      // from the reader: the open paper is context (and a new chat belongs to it)
      const reading = body.paperId ? await openPaperContext(userId, body.paperId) : null;
      let named = false;
      let conversation = body.conversationId ? await getConversation(pool, userId, body.conversationId) : null;
      if (body.conversationId && !conversation) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
      if (!conversation) {
        const model = await newChatModel(userId, body.model);
        // started with a lab project picked: the chat belongs to that project (its people see it)
        const labProject = body.projectId && !reading ? await labProjectFor(pool, userId, body.projectId).catch(() => null) : null;
        if (labProject && !labProject.canEdit) throw new AgentHttpError(403, 'You can read this project, but not start chats in it.', 'forbidden');
        conversation = await createConversation(pool, userId, titleFrom(reading?.title ?? (body.text || body.attachments?.[0]?.name || '')), model.id, reading?.id ?? null, labProject ? { labId: labProject.lab.id, projectId: body.projectId! } : null);
        // a chat about the open paper keeps the paper's title; others are titled by the model
        named = !reading;
      }
      // a question left unanswered: the user moved on
      if (conversation.pending) await setPending(pool, conversation.id, null);
      // the Web switch, as the user left it for this message
      if (body.webSearch !== undefined && body.webSearch !== conversation.webSearch) {
        await setWebSearch(pool, conversation.ownerId, conversation.id, body.webSearch);
        conversation = { ...conversation, webSearch: body.webSearch };
      }
      // a skill and a shelf project picked in the + menu, for this message
      const extra = (reading?.context ?? '') + (await messageExtras(userId, { ...body, projectId: body.projectId ?? conversation.projectId }, conversation));
      return { conversation, run: (deps, history) => answer(deps, history, body.text, body.attachments ?? []), extraSystem: extra || undefined, named, timeZone: body.timeZone };
    },
    body.model,
  );
}

/* Deep research, started from the + menu: plan, search, read, then a cited
   report. Its own endpoint, because it runs for a few minutes. */
export function replyWithResearch(req: Request, userId: string, body: { conversationId?: string | null; text: string; model?: string | null; webSearch?: boolean; timeZone?: string }) {
  return streamReply(
    userId,
    req,
    async () => {
      let named = false;
      let conversation = body.conversationId ? await getConversation(pool, userId, body.conversationId) : null;
      if (body.conversationId && !conversation) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
      if (!conversation) {
        const model = await newChatModel(userId, body.model);
        conversation = await createConversation(pool, userId, titleFrom(body.text), model.id);
        named = true;
      }
      if (conversation.pending) await setPending(pool, conversation.id, null);
      if (body.webSearch !== undefined && body.webSearch !== conversation.webSearch) {
        await setWebSearch(pool, conversation.ownerId, conversation.id, body.webSearch);
        conversation = { ...conversation, webSearch: body.webSearch };
      }
      return { conversation, run: (deps) => research(deps, body.text), named, timeZone: body.timeZone };
    },
    body.model,
    RESEARCH_MS,
    'research',
  );
}

/* Try again: drop the last answer (and its steps) and answer the user's last message afresh. */
export function replyToRetry(req: Request, userId: string, body: { conversationId: string; model?: string | null; webSearch?: boolean }) {
  return streamReply(
    userId,
    req,
    async () => {
      let conversation = await getConversation(pool, userId, body.conversationId);
      if (!conversation) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
      if (conversation.pending) await setPending(pool, conversation.id, null);
      if (!(await loadMessages(pool, conversation.id)).some((m) => m.message.role === 'user')) throw new AgentHttpError(409, 'There is no message to answer again.', 'bad_request');
      if (body.webSearch !== undefined && body.webSearch !== conversation.webSearch) {
        await setWebSearch(pool, conversation.ownerId, conversation.id, body.webSearch);
        conversation = { ...conversation, webSearch: body.webSearch };
      }
      const id = conversation.id;
      // dropped only once this reply holds the chat, so no other reply is writing to it
      return {
        conversation,
        run: async (deps) => {
          await dropAfterLastUserMessage(pool, conversation.ownerId, id);
          await retry(deps, repairHistory((await loadMessages(pool, id)).map((m) => m.message)));
        },
      };
    },
    body.model,
  );
}

/* The skill and the shelf project picked for a message, as instructions (a
   skill that was removed or switched off, or a project that's gone, is left out). */
async function messageExtras(userId: string, body: { skill?: string | null; projectId?: string | null }, conv?: Conversation): Promise<string> {
  let out = '';
  if (body.skill) {
    const skill = await takeSkill(pool, userId, body.skill, await skillLabOf(pool, userId).catch(() => null)).catch(() => null);
    if (skill) out += skillContext(skill);
  }
  if (body.projectId) {
    // a lab chat's project is on the lab's shelf
    const shelfUser = conv?.labId ? (await labProjectFor(pool, userId, conv.projectId ?? body.projectId).catch(() => null))?.lab.shelfUserId : null;
    const project = (await listProjects(pool, shelfUser ?? userId).catch(() => [] as Awaited<ReturnType<typeof listProjects>>)).find((p) => p.id === body.projectId);
    if (project) out += projectContext(project, !!shelfUser);
  }
  return out;
}

/* The paper open in the reader, as context for the assistant (null when it can't be found). */
async function openPaperContext(userId: string, paperId: string): Promise<{ id: string; title: string; context: string } | null> {
  try {
    const { loadPaper } = await import('@/lib/reader/service/paper');
    const { paper } = await loadPaper({ db: pool, sources: () => papersServer().sources(newMeter()) }, userId, paperId);
    return {
      id: paper.id,
      title: paper.title,
      context: readingContext({ id: paper.id, title: paper.title, authors: paper.authors.map((a) => a.name), year: paper.year, doi: paper.doi, abstract: paper.abstract, retracted: paper.isRetracted }),
    };
  } catch {
    return null;
  }
}

/* The user's yes / no to a step that was waiting. */
export function replyToConfirmation(req: Request, userId: string, body: { conversationId: string; callId: string; approve: boolean }) {
  return streamReply(
    userId,
    req,
    async () => {
      const conversation = await getConversation(pool, userId, body.conversationId);
      if (!conversation) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
      const pending: Pending | null = conversation.pending;
      if (!pending || pending.waiting.callId !== body.callId) throw new AgentHttpError(409, 'That question was already answered.', 'bad_request');
      // a browser-run tool the user chose to skip counts as "no"; a "yes" is sent as its result instead
      if (pending.waiting.kind === 'client' && body.approve) throw new AgentHttpError(409, 'Send the result of that step instead.', 'bad_request');
      return { conversation, run: (deps, history) => resume(deps, history, pending, body.approve) };
    },
    null,
  );
}

/* The result of a tool the user's browser ran (the citation search), or why it couldn't run. */
export function replyToClientResult(req: Request, userId: string, body: { conversationId: string; callId: string; outcome: { ok: true; sources: ToolDisplay['sources']; note?: string } | { ok: false; error: string } }) {
  return streamReply(
    userId,
    req,
    async () => {
      const conversation = await getConversation(pool, userId, body.conversationId);
      if (!conversation) throw new AgentHttpError(404, 'That conversation no longer exists.', 'not_found');
      const pending: Pending | null = conversation.pending;
      if (!pending || pending.waiting.kind !== 'client' || pending.waiting.callId !== body.callId) throw new AgentHttpError(409, 'That step was already finished.', 'bad_request');
      const o = body.outcome;
      const outcome: ClientOutcome = o.ok
        ? { ok: true, result: { found: o.sources?.length ?? 0, sources: o.sources ?? [], ...(o.note ? { note: o.note } : {}) }, display: { sources: o.sources ?? [], summary: tally(o.sources?.length ?? 0, 'source') } }
        : { ok: false, error: o.error };
      return { conversation, run: (deps, history) => resumeWithClientResult(deps, history, pending, outcome) };
    },
    null,
  );
}
