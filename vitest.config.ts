import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const alias = {
  '@reflex/capability-model': resolve(__dirname, 'packages/capability-model/src/index.ts'),
  '@reflex/discovery-engine': resolve(__dirname, 'packages/discovery-engine/src/index.ts'),
  '@reflex/schema-generator': resolve(__dirname, 'packages/schema-generator/src/index.ts'),
  '@reflex/webmcp-adapter': resolve(__dirname, 'packages/webmcp-adapter/src/index.ts'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    globals: true,
  },
});
