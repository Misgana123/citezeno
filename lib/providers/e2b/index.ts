import type { CodeSandbox } from '../code-sandbox/types';
import type { ProviderDefinition } from '../types';
import { createE2b, PROVIDER } from './sandbox';

/* E2B, registered as a code sandbox provider. Not configured (no key) → null. */
export const e2bProvider: ProviderDefinition<CodeSandbox> = { name: PROVIDER, create: (env, gate) => createE2b(env, gate) };
