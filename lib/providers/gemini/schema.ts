import type { JsonSchema } from '../chat/types';

/* Gemini's function declarations take a subset of OpenAPI schema: no $schema,
   no additionalProperties, and "may be null" written as nullable rather than
   anyOf [..., null]. This turns a JSON Schema into that subset. */

const KEEP = new Set(['type', 'description', 'enum', 'format', 'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'required']);
const SAFE_MAX = 1e15; // zod's "safe integer" bounds are noise to Gemini

export function toGeminiSchema(schema: unknown): JsonSchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};
  const s = schema as Record<string, unknown>;

  const anyOf = (s.anyOf ?? s.oneOf) as unknown[] | undefined;
  if (Array.isArray(anyOf)) {
    const nonNull = anyOf.filter((x) => (x as { type?: unknown })?.type !== 'null');
    const base = nonNull.length === 1 ? toGeminiSchema(nonNull[0]) : toGeminiSchema(nonNull[0] ?? {});
    return { ...base, ...(nonNull.length < anyOf.length ? { nullable: true } : {}), ...(typeof s.description === 'string' ? { description: s.description } : {}) };
  }

  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(s)) {
    if (!KEEP.has(k)) continue;
    if ((k === 'minimum' || k === 'maximum') && typeof v === 'number' && Math.abs(v) >= SAFE_MAX) continue;
    out[k] = v;
  }
  if (Array.isArray(s.type)) {
    const types = (s.type as string[]).filter((t) => t !== 'null');
    out.type = types[0];
    if (types.length < (s.type as string[]).length) out.nullable = true;
  }
  if (s.const !== undefined) out.enum = [s.const];
  if (s.properties && typeof s.properties === 'object') {
    out.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
}
