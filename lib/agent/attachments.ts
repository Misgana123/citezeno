/* Limits for files added to a chat message, shared by the browser (which reads
   the files) and the server (which checks them). Images count as base64
   characters; all attachments together stay under the host's request body limit. */
export const ATTACH_MAX = 5;
export const ATTACH_TEXT_MAX = 60_000;
export const ATTACH_IMAGE_MAX = 2_000_000;
export const ATTACH_TOTAL_MAX = 3_500_000;

/* The start of a file's text, for its card in the chat (PDF page markers left out). */
export const excerptOf = (text: string) =>
  text
    .replace(/\[page \d+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
