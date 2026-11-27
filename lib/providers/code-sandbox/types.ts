/* The code sandbox job: run code the assistant wrote (Python) in an isolated
   machine far from our servers, keys and database. One session per chat keeps
   variables and files between runs. Files go in and out explicitly. */

export type SandboxFile = { path: string; bytes: Uint8Array };

/* Something the code displayed: a picture (base64) or text. */
export type CodeOutput = { mime: 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'text/plain'; data: string };

export type CodeRun = {
  /* the session to pass next time (a new one when the old one had ended) */
  sessionId: string;
  stdout: string;
  stderr: string;
  error: { name: string; message: string; traceback: string } | null;
  outputs: CodeOutput[];
  /* files asked for that the code made */
  files: SandboxFile[];
  /* files asked for that weren't there */
  missing: string[];
};

export type CodeRequest = { sessionId: string | null; code: string; upload: SandboxFile[]; download: string[]; timeoutMs: number };

export interface CodeSandbox {
  readonly name: string;
  run(req: CodeRequest): Promise<CodeRun>;
  /* end a session now (it also ends on its own when idle) */
  close(sessionId: string): Promise<void>;
}
