import { providerDown } from '../errors';
import { streamOrComplete, type ChatModel, type ChatProvider } from './types';

/* A chat provider with a stand-in: when the first is down, failing or too busy
   (not when our request is wrong or our own spending cap is reached), the same
   request goes to the backup with its model. A streamed answer only switches
   before its first words are shown, so nothing is said twice. The answer then
   carries the backup's own turn; the next request sends it on as plain text
   and tool calls, which every provider reads. */
export function withFallback(primary: ChatProvider, backup: ChatProvider, backupModel: ChatModel): ChatProvider {
  const note = (e: unknown) => {
    const reason = (e as { details?: { reason?: string } })?.details?.reason;
    console.warn(`[citezeno] chat: ${primary.name} failed (${(e as Error)?.message}${reason ? ` ${reason}` : ''}); using ${backup.name} ${backupModel.id}`);
  };
  return {
    name: primary.name,
    ...(primary.models ? { models: primary.models } : {}),
    async complete(req) {
      try {
        return await primary.complete(req);
      } catch (e) {
        if (!providerDown(e)) throw e;
        note(e);
        return backup.complete({ ...req, model: backupModel });
      }
    },
    async stream(req, onText) {
      let started = false;
      try {
        return await streamOrComplete(primary, req, (t) => {
          started = true;
          onText(t);
        });
      } catch (e) {
        if (started || !providerDown(e)) throw e;
        note(e);
        return streamOrComplete(backup, { ...req, model: backupModel }, onText);
      }
    },
  };
}
