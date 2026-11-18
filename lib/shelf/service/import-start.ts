import type { ShelfConfig } from '../config';
import { tx, type Db } from '../db';
import { ShelfError } from '../errors';
import { parseReferenceFile } from '../import/parse';
import { createImport } from '../store/imports';
import { findOrCreateProject, ownsProject } from '../store/projects';

/* Read an uploaded reference file and queue its entries. */
export async function startImport(db: Db, config: ShelfConfig, userId: string, f: { fileName: string; text: string; projectId?: string | null; newProject?: string | null }): Promise<string> {
  if (Buffer.byteLength(f.text, 'utf8') > config.importMaxBytes) {
    throw new ShelfError('too_large', `This file is over the ${Math.floor(config.importMaxBytes / (1024 * 1024))} MB limit for imports. Split it into smaller files.`);
  }
  const parsed = parseReferenceFile(f.fileName, f.text);
  if (!parsed) throw new ShelfError('invalid_file', 'This isn’t a BibTeX (.bib) or RIS (.ris) file.');
  const total = parsed.entries.length + parsed.failed.length;
  if (!total) throw new ShelfError('invalid_file', 'No references were found in this file.');
  if (total > config.importMaxEntries) throw new ShelfError('too_large', `This file has ${total.toLocaleString('en-US')} references; imports are limited to ${config.importMaxEntries.toLocaleString('en-US')}. Split it into smaller files.`);
  return tx(db, async (q) => {
    let projectId = f.projectId ?? null;
    if (f.newProject) projectId = (await findOrCreateProject(q, userId, f.newProject)).id;
    else if (projectId && !(await ownsProject(q, userId, projectId))) throw new ShelfError('not_found', 'That project no longer exists.');
    return createImport(q, userId, { fileName: f.fileName.slice(0, 300), projectId, parsed });
  });
}
