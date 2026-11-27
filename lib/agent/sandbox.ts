import type { CodeRequest, CodeRun, CodeSandbox } from '@/lib/providers/code-sandbox/types';
import type { Db } from '@/lib/shelf/db';
import { getSandboxId, setSandboxId } from './store';

/* The chat's code sandbox: runs go to the chat's session (so variables and
   files carry over between runs), and the session is remembered on the
   conversation. When it has ended, the sandbox starts a new one. */

export type CodeRunner = { run(req: Omit<CodeRequest, 'sessionId'>): Promise<CodeRun & { newSession: boolean }> };

export function codeRunner(sandbox: CodeSandbox, db: Db, owner: { userId: string; conversationId: string }): CodeRunner {
  return {
    async run(req) {
      const sessionId = await getSandboxId(db, owner.userId, owner.conversationId);
      const out = await sandbox.run({ ...req, sessionId });
      if (out.sessionId !== sessionId) await setSandboxId(db, owner.userId, owner.conversationId, out.sessionId);
      return { ...out, newSession: out.sessionId !== sessionId };
    },
  };
}
