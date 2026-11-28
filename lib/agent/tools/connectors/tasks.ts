import { z } from 'zod';
import type { Task } from '@/lib/providers/connectors/types';
import { defineTool, tally } from '../types';
import { app, APP, appLabel, clip } from './shared';

/* The user's connected task apps (Todoist, Linear): their lists (Todoist
   projects, Linear teams) and tasks. Turn reading lists, review gaps and
   reviewer comments into tasks; asks before changing anything. */

const PRIORITY = z.number().int().min(1).max(4).optional().describe('1 = most urgent … 4 = low.');
const DUE = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('A due date, "YYYY-MM-DD".');
const LIST = z.string().trim().max(100).optional().describe('A projectId / teamId from task_projects (default: the app’s first or inbox).');

export const taskProjects = defineTool({
  name: 'task_projects',
  description: 'The lists tasks live in, in a connected task app: Todoist projects or Linear teams (names and IDs).',
  input: z.object({ app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'tasks',
  label: () => 'Looking at your task lists',
  done: () => ({ did: 'Looked at your task lists' }),
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'tasks', i.app);
    const projects = await api.projects();
    return { result: { app: label, listName: api.listName, projects }, display: { summary: tally(projects.length, api.listName) } };
  },
});

export const taskList = defineTool({
  name: 'task_list',
  description: 'Tasks in a connected task app (open ones), optionally in one project/team or matching words.',
  input: z.object({ projectId: LIST, query: z.string().trim().max(100).optional(), includeDone: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional(), app: APP }),
  kind: 'read',
  step: 'read',
  needs: 'tasks',
  label: () => 'Looking at your tasks',
  done: (i) => ({ did: 'Looked at your tasks', ...(i.query ? { about: i.query } : {}) }),
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'tasks', i.app);
    const tasks = await api.tasks({ projectId: i.projectId, query: i.query, includeDone: i.includeDone, limit: i.limit ?? 50 });
    return { result: { app: label, tasks: tasks.map((t) => ({ ...t, notes: t.notes ? clip(t.notes, 400) : null })) }, display: { summary: tally(tasks.length, 'task') } };
  },
});

export const taskCreate = defineTool({
  name: 'task_create',
  description: 'Add tasks to a connected task app, several at once (e.g. one per paper to read, or per gap in a review). Each: a short title, optional notes (links, the DOI), due date and priority. Asks the user first.',
  input: z.object({
    projectId: LIST,
    projectName: z.string().trim().max(100).optional().describe('The list’s name, for the question shown to the user.'),
    tasks: z.array(z.object({ title: z.string().trim().min(1).max(300), notes: z.string().trim().max(4000).optional(), due: DUE, priority: PRIORITY })).min(1).max(50),
    app: APP,
  }),
  kind: 'write',
  step: 'make',
  needs: 'tasks',
  label: (i) => `Adding ${tally(i.tasks?.length ?? 0, 'task').toLowerCase()}`,
  done: (i) => ({ did: `Added ${tally(i.tasks?.length ?? 0, 'task').toLowerCase()}`, ...(i.projectName ? { about: i.projectName } : {}) }),
  confirm: (i, ctx) =>
    `Add ${i.tasks.length === 1 ? `the task “${clip(i.tasks[0].title, 80)}”` : `${i.tasks.length} tasks (${i.tasks.slice(0, 3).map((t) => `“${clip(t.title, 40)}”`).join(', ')}${i.tasks.length > 3 ? '…' : ''})`}${i.projectName ? ` to ${i.projectName}` : ''} in ${appLabel(ctx, 'tasks', 'your task app', i.app)}?`,
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'tasks', i.app);
    const made: Task[] = [];
    for (const t of i.tasks) made.push(await api.create({ projectId: i.projectId ?? null, title: t.title, notes: t.notes ?? null, due: t.due ?? null, priority: (t.priority as 1 | 2 | 3 | 4 | undefined) ?? null }));
    return { result: { app: label, added: made.map((t) => ({ taskId: t.id, title: t.title, url: t.url })) }, display: { links: made.filter((t) => t.url).slice(0, 10).map((t) => ({ title: t.title, url: t.url! })), summary: `Added ${tally(made.length, 'task').toLowerCase()}` } };
  },
});

export const taskUpdate = defineTool({
  name: 'task_update',
  description: 'Change a task in a connected task app (taskId from task_list or task_create): title, notes, due date, priority, or mark it done (or not done). Asks the user first.',
  input: z.object({
    taskId: z.string().trim().min(1).max(100),
    taskTitle: z.string().trim().max(300).optional().describe('The task’s title, for the question shown to the user.'),
    title: z.string().trim().min(1).max(300).optional(),
    notes: z.string().trim().max(4000).optional(),
    due: DUE,
    priority: PRIORITY,
    done: z.boolean().optional(),
    app: APP,
  }),
  kind: 'write',
  step: 'change',
  needs: 'tasks',
  label: () => 'Changing a task',
  done: (i) => ({ did: i.done ? 'Completed a task' : 'Changed a task', ...(i.taskTitle ? { about: i.taskTitle } : {}) }),
  confirm: (i, ctx) => {
    const name = i.taskTitle ? `“${clip(i.taskTitle, 80)}”` : 'this task';
    const what = i.done === true ? `Mark ${name} done` : i.done === false ? `Reopen ${name}` : `Change ${name}`;
    return `${what} in ${appLabel(ctx, 'tasks', 'your task app', i.app)}?`;
  },
  async run(ctx, i) {
    const { api, label } = await app(ctx, 'tasks', i.app);
    const t = await api.update(i.taskId, { title: i.title, notes: i.notes, due: i.due, priority: i.priority as 1 | 2 | 3 | 4 | undefined, done: i.done });
    return { result: { app: label, task: t }, display: { ...(t.url ? { links: [{ title: t.title, url: t.url }] } : {}), summary: t.done ? 'Done' : 'Changed' } };
  },
});

export const TASK_TOOLS = [taskProjects, taskList, taskCreate, taskUpdate];
