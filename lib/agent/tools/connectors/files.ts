import { z } from 'zod';
import { ShelfError } from '@/lib/shelf/errors';
import { AGENT_FILE_MAX_BYTES } from '../../files';
import { defineTool, tally } from '../types';
import { app, APP, appLabel, clip, READ_CHARS } from './shared';

/* The user's connected cloud files (Google Drive, OneDrive). On Drive only the
   files they picked, or the assistant saved, are visible. */

const FILE_ID = z.string().trim().min(1).max(200);
const TEXT_MIMES = /^(text\/|application\/(json|xml|x-bibtex|x-research-info-systems))/;

export const cloudFilesList = defineTool({
  name: 'cloud_files_list',
  description:
    'List files in the user’s connected cloud storage (Google Drive or OneDrive), newest first, optionally only those whose name contains `query`. On Google Drive only files the user chose to share with Citezeno (or that Citezeno saved) are visible; if a file is missing there, ask the user to add it with “Add from Google Drive”.',
  input: z.object({ query: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(50).optional(), app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'files',
  label: (i) => (i.query ? `Looking for “${clip(i.query, 50)}” in your files` : 'Looking through your files'),
  done: (i) => ({ did: 'Looked through your files', ...(i.query ? { about: i.query } : {}) }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'files', i.app);
    const files = await api.list({ query: i.query, limit: i.limit ?? 20 });
    return { result: { files: files.map((f) => ({ fileId: f.id, name: f.name, kind: f.kind, sizeBytes: f.sizeBytes, modified: f.modifiedAt, url: f.url })) }, display: { summary: tally(files.length, 'file') } };
  },
});

export const cloudFileRead = defineTool({
  name: 'cloud_file_read',
  description: `Read a file from the user’s connected cloud storage (from cloud_files_list, same app) by fileId: Google Docs and text files as text, Google Sheets as CSV, PDFs as their text (at most ${READ_CHARS.toLocaleString('en-US')} characters). Other files (Word, Excel, pictures…) are kept as a file of this chat instead, with a fileId for convert_file, run_python and the other file tools; keepAsFile does that for any file.`,
  input: z.object({ fileId: FILE_ID, keepAsFile: z.boolean().optional().describe('Also keep the file in this chat (for the file tools).'), app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'files',
  label: () => 'Reading a file from your storage',
  done: () => ({ did: 'Read a file from your storage' }),
  async run(ctx, i) {
    const { api } = await app(ctx, 'files', i.app);
    const f = await api.get(i.fileId);
    if (f.kind === 'folder') throw new ShelfError('bad_request', `“${f.name}” is a folder. Use cloud_files_list to find the files.`);
    const asText = f.kind === 'document' || f.kind === 'presentation' ? 'text' : f.kind === 'spreadsheet' ? 'csv' : undefined;
    const got = await api.download(i.fileId, { maxBytes: AGENT_FILE_MAX_BYTES, ...(asText ? { as: asText } : {}) });
    let text: string | null = null;
    if (asText || TEXT_MIMES.test(got.mime)) text = new TextDecoder().decode(got.bytes).replace(/^﻿/, '');
    else if (f.kind === 'pdf') text = (await ctx.pdfText().read(got.bytes)).text.trim() || null;
    const keep = i.keepAsFile || text == null;
    const file = keep ? await ctx.files.save({ name: got.name, mime: got.mime, bytes: got.bytes }) : null;
    const cut = text != null && text.length > READ_CHARS;
    return {
      result: {
        name: f.name,
        kind: f.kind,
        url: f.url,
        ...(text != null ? { text: cut ? text.slice(0, READ_CHARS) : text, ...(cut ? { cut: true, totalChars: text.length } : {}) } : { note: 'No text could be read here; the file is kept in this chat (fileId) for the file tools.' }),
        ...(file ? { fileId: file.id, fileName: file.name } : {}),
      },
      display: { ...(file ? { file } : {}), ...(f.url ? { links: [{ title: f.name, url: f.url }] } : {}), summary: text != null ? `${text.length.toLocaleString('en-US')} characters` : 'Kept in this chat' },
    };
  },
});

export const cloudFileSave = defineTool({
  name: 'cloud_file_save',
  description: 'Save a file made in this chat (by its fileId: a document, spreadsheet, slides, chart, PDF…) to the user’s connected cloud storage (Google Drive or OneDrive). On Google Drive, convert turns a Word, Excel or CSV file into an editable Google Doc or Sheet (on OneDrive Word and Excel files are editable as they are). Asks the user first.',
  input: z.object({ fileId: z.string().trim().min(1).max(80), convert: z.boolean().optional().describe('Google Drive only: turn .docx / .xlsx / .pptx / .csv into Google’s own format.'), app: APP }),
  kind: 'write',
  step: 'make',
  needs: 'files',
  label: () => 'Saving a file to your storage',
  done: () => ({ did: 'Saved a file to your storage' }),
  async confirm(i, ctx) {
    const got = await ctx.files.read(i.fileId);
    return `Save “${got?.file.name ?? 'this file'}” to your ${appLabel(ctx, 'files', 'cloud storage', i.app)}?`;
  },
  async run(ctx, i) {
    const got = await ctx.files.read(i.fileId);
    if (!got) throw new ShelfError('not_found', `There is no file with fileId "${i.fileId}" in this chat.`);
    const { api, label } = await app(ctx, 'files', i.app);
    const f = await api.upload({ name: got.file.name, mime: got.file.mime, bytes: got.bytes, convert: i.convert });
    return { result: { saved: f.name, url: f.url, kind: f.kind, app: label }, display: { ...(f.url ? { links: [{ title: f.name, url: f.url }] } : {}), summary: `Saved to ${label}` } };
  },
});

export const FILE_TOOLS = [cloudFilesList, cloudFileRead, cloudFileSave];
