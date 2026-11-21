'use client';

import { ATTACH_IMAGE_MAX, ATTACH_TEXT_MAX, excerptOf } from '@/lib/agent/attachments';
import type { Attachment } from '@/lib/providers/chat/types';
import { loadPdfjs } from '../reader/pdf/load';

/* Files added to a chat message, read here in the browser: a PDF's or text
   file's words, or a picture (an upload or a screenshot) made small enough to
   send. Nothing is uploaded until the message is sent. */

/* A file in the message box: being read, ready, or refused (with why). Shown
   as a card: a picture of it (an image, or a PDF's first page) or the start
   of its text, with its type ("PDF", "MD"). */
export type AttachItem = { id: string; name: string; status: 'reading' | 'ready' | 'error'; attachment?: Attachment; preview?: string; excerpt?: string; error?: string };

/* What a file card shows: its type, from the name ("report.pdf" → "PDF"). */
export function fileBadge(name: string): string {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1];
  return ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE';
}

type Read = { attachment: Attachment; preview?: string; excerpt?: string };

export const ATTACH_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,text/plain,.txt,.md,.markdown,.csv,.tsv,.json,.tex,.bib,.ris,.xml,.html,.htm';

const FILE_MAX_BYTES = 25 * 1024 * 1024;
/* the longest side of a picture sent to the model, in pixels */
const IMAGE_SIDE = 1600;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|tex|bib|ris|xml|html?)$/i;
const CUT_NOTE = '\n[… cut here: the file is longer than the assistant reads at once]';

let seq = 0;
export const newAttachId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) => /^image\/(png|jpeg|webp|gif)$/.test(f.type);
const isText = (f: File) => f.type.startsWith('text/') || f.type === 'application/json' || TEXT_EXT.test(f.name);

function cut(text: string): string {
  const t = text.replace(/\u0000/g, '').trim();
  return t.length > ATTACH_TEXT_MAX ? t.slice(0, ATTACH_TEXT_MAX - CUT_NOTE.length) + CUT_NOTE : t;
}

/* the width of a PDF's first-page picture on its card, in pixels (2× for sharp screens) */
const THUMB_WIDTH = 240;

/* A PDF's words, page by page, until there are enough, and a picture of its first page. */
async function readPdf(file: File): Promise<{ text: string; preview?: string }> {
  const { pdfjs } = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    let preview: string | undefined;
    try {
      const first = await doc.getPage(1);
      const viewport = first.getViewport({ scale: THUMB_WIDTH / first.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await first.render({ canvas, viewport }).promise;
      preview = canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      // no picture: the card shows the text instead
    }
    let out = '';
    for (let n = 1; n <= doc.numPages && out.length <= ATTACH_TEXT_MAX; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const words = content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('');
      out += `\n\n[page ${n}]\n${words.replace(/[ \t]+/g, ' ').trim()}`;
    }
    return { text: out, preview };
  } finally {
    void task.destroy();
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(blob);
  });
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/* A picture made no larger than IMAGE_SIDE: PNG keeps text sharp; a photo
   that would be too big as PNG becomes a JPEG. */
async function shrinkImage(source: CanvasImageSource, width: number, height: number, name: string): Promise<{ attachment: Attachment; preview: string }> {
  const scale = Math.min(1, IMAGE_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('The picture could not be read.');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const [type, quality] of [['image/png'], ['image/jpeg', 0.85], ['image/jpeg', 0.7]] as [string, number?][]) {
    const blob = await toBlob(canvas, type, quality);
    if (!blob) continue;
    const url = await dataUrl(blob);
    const data = url.slice(url.indexOf(',') + 1);
    if (data.length <= ATTACH_IMAGE_MAX * 0.75) return { attachment: { kind: 'image', name, mediaType: type as 'image/png' | 'image/jpeg', data }, preview: url };
  }
  throw new Error('The picture is too large to send.');
}

/* One chosen file, read and ready to send, or why it can't be. */
export async function readAttachment(file: File): Promise<Read> {
  if (file.size > FILE_MAX_BYTES) throw new Error('Files over 25 MB can’t be added.');
  if (isImage(file)) {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error('The picture could not be read.');
    });
    try {
      return await shrinkImage(bitmap, bitmap.width, bitmap.height, file.name);
    } finally {
      bitmap.close();
    }
  }
  if (isPdf(file)) {
    const pdf = await readPdf(file).catch(() => Promise.reject(new Error('The PDF could not be read.')));
    const text = cut(pdf.text);
    if (excerptOf(text).length < 20) throw new Error('This PDF has no text to read (it may be a scan).');
    return { attachment: { kind: 'text', name: file.name, text }, preview: pdf.preview, excerpt: excerptOf(text) };
  }
  if (isText(file)) {
    const text = cut(await file.text());
    if (!text) throw new Error('The file is empty.');
    return { attachment: { kind: 'text', name: file.name, text }, excerpt: excerptOf(text) };
  }
  throw new Error('Only PDFs, text files and pictures can be added for now.');
}

export const canScreenshot = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/* A picture of a screen, window or tab the user picks in the browser's own
   prompt. Null when they cancel. Sharing stops as soon as the frame is taken. */
export async function takeScreenshot(): Promise<{ attachment: Attachment; preview: string } | null> {
  if (!canScreenshot()) throw new Error('This browser can’t take screenshots. Try Chrome, Edge or Firefox on a computer.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    if ((e as Error).name === 'NotAllowedError' || (e as Error).name === 'AbortError') return null;
    throw new Error('The screenshot could not be taken.');
  }
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await new Promise((resolve) => video.addEventListener('resize', resolve, { once: true }));
    // give the stream a moment to show a real frame
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '.');
    return await shrinkImage(video, video.videoWidth, video.videoHeight, `Screenshot ${stamp}`);
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}
