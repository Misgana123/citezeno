import { e2bProvider } from '../e2b';
import type { ProviderDefinition } from '../types';
import type { CodeSandbox } from './types';

/* Every code sandbox provider. To add one: implement CodeSandbox in
   lib/providers/<name>/, add it here, and set CODE_SANDBOX_PROVIDER. */
export const CODE_SANDBOX_PROVIDERS: Readonly<Record<string, ProviderDefinition<CodeSandbox>>> = { [e2bProvider.name]: e2bProvider };

export const DEFAULT_CODE_SANDBOX = [e2bProvider.name];
