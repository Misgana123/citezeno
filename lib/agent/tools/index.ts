import { z } from 'zod';
import type { ToolSpec } from '@/lib/providers/chat/types';
import { EXPORT_TOOLS } from './export';
import { LIBRARY_TOOLS } from './library';
import { ORGANIZE_TOOLS } from './organize';
import { PAPER_TOOLS } from './papers';
import { SAVE_TOOLS } from './save';
import type { AgentTool } from './types';

/* Every action the agent can take: one tool per thing a user can do in the
   app. New features add their tools here and the agent can use them. */
export const AGENT_TOOLS: readonly AgentTool[] = [...PAPER_TOOLS, ...LIBRARY_TOOLS, ...SAVE_TOOLS, ...ORGANIZE_TOOLS, ...EXPORT_TOOLS] as AgentTool[];

const byName = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

export const findTool = (name: string): AgentTool | null => byName.get(name) ?? null;

/* A tool's input as JSON Schema, for the model. */
export function inputSchema(tool: AgentTool): Record<string, unknown> {
  const { $schema: _s, ...schema } = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return schema;
}

/* The tools as the chat model sees them. */
export const toolSpecs = (tools: readonly AgentTool[] = AGENT_TOOLS): ToolSpec[] =>
  tools.map((t) => ({ name: t.name, description: t.description, parameters: inputSchema(t) }));
