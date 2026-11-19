import { splitPaperId } from '@/lib/papers/ids';
import { supports, type PaperCapability, type PaperSource } from './types';

/* The paper sources a request may use, primary first. Features ask for the
   job ("the paper source", "a source that can search by meaning"), never for a
   vendor by name, so more providers can be used side by side. */
export type PaperSources = {
  readonly primary: PaperSource;
  readonly all: readonly PaperSource[];
  /* A source by registry name, if it is enabled. */
  named(name: string): PaperSource | null;
  /* The first source (primary first) that offers a capability. */
  withCapability(capability: PaperCapability): PaperSource | null;
};

export function paperSources(list: PaperSource[]): PaperSources {
  if (!list.length) throw new Error('No paper provider is enabled.');
  return {
    primary: list[0],
    all: list,
    named: (name) => list.find((s) => s.name === name) ?? null,
    withCapability: (capability) => list.find((s) => supports(s, capability)) ?? null,
  };
}

/* Which source a paper ID belongs to, and that source's own ID for it.
   Takes a Citezeno ID ("openalex:W123"), or anything one of the enabled
   sources recognises (primary first): "W123", a link to its record… */
export function resolvePaperId(sources: PaperSources, raw: string): { source: PaperSource; id: string } | null {
  const qualified = splitPaperId(raw);
  const owner = qualified && sources.named(qualified.provider);
  if (qualified && owner) {
    const id = owner.parseId(qualified.providerId);
    return id ? { source: owner, id } : null;
  }
  // not one of ours ("https://…", or a provider that isn't enabled): ask each source
  for (const source of sources.all) {
    const id = source.parseId(raw);
    if (id) return { source, id };
  }
  return null;
}
