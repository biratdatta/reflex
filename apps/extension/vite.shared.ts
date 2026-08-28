import { resolve } from 'node:path';
import type { AliasOptions } from 'vite';

const root = resolve(__dirname, '../..');

/** Workspace packages are consumed as TypeScript source, so every bundle is self-contained. */
export const workspaceAlias: AliasOptions = {
  '@reflex/capability-model': resolve(root, 'packages/capability-model/src/index.ts'),
  '@reflex/discovery-engine': resolve(root, 'packages/discovery-engine/src/index.ts'),
  '@reflex/schema-generator': resolve(root, 'packages/schema-generator/src/index.ts'),
  '@reflex/webmcp-adapter': resolve(root, 'packages/webmcp-adapter/src/index.ts'),
};
