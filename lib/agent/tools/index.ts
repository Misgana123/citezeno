import { z } from 'zod';
import type { ToolSpec } from '@/lib/providers/chat/types';
import { CLIENT_TOOLS, type ClientTool } from './client';
import { DOCUMENT_TOOLS } from './documents';
import { MEDIA_TOOLS } from './media';
import { PDF_TOOLS } from './pdf';
import { EXPORT_TOOLS } from './export';
import { LIBRARY_TOOLS } from './library';
import { ORGANIZE_TOOLS } from './organize';
import { PAPER_TOOLS } from './papers';
import { READER_TOOLS } from './reader';
import { SAVE_TOOLS } from './save';
import type { AgentTool } from './types';
import { WEB_TOOL_NAMES, WEB_TOOLS } from './web';

/* Every action the agent can take: one tool per thing a user can do in the
   app. New features add their tools here and the agent can use them. */
export const AGENT_TOOLS: readonly AgentTool[] = [...PAPER_TOOLS, ...LIBRARY_TOOLS, ...SAVE_TOOLS, ...ORGANIZE_TOOLS, ...EXPORT_TOOLS, ...READER_TOOLS, ...WEB_TOOLS, ...DOCUMENT_TOOLS, ...MEDIA_TOOLS, ...PDF_TOOLS] as AgentTool[];

const byName = new Map<string, AgentTool | ClientTool>([...AGENT_TOOLS, ...CLIENT_TOOLS].map((t) => [t.name, t]));

/* A tool the server runs, or one the user's browser runs ("client"). */
export const findTool = (name: string): AgentTool | ClientTool | null => byName.get(name) ?? null;

/* The tools offered for one reply: the web tools only while the user has web search on. */
export const offeredTools = (opts: { web: boolean }): (AgentTool | ClientTool)[] => [...AGENT_TOOLS, ...CLIENT_TOOLS].filter((t) => opts.web || !WEB_TOOL_NAMES.has(t.name));

/* A tool's input as JSON Schema, for the model. */
export function inputSchema(tool: AgentTool | ClientTool): Record<string, unknown> {
  const { $schema: _s, ...schema } = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return schema;
}

/* The tools as the chat model sees them. */
export const toolSpecs = (tools: readonly (AgentTool | ClientTool)[] = [...AGENT_TOOLS, ...CLIENT_TOOLS]): ToolSpec[] =>
  tools.map((t) => ({ name: t.name, description: t.description, parameters: inputSchema(t) }));
