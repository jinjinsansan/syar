import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@star/sim-engine': fileURLToPath(
        new URL('./packages/sim-engine/src/index.ts', import.meta.url),
      ),
      '@star/race-engine': fileURLToPath(
        new URL('./packages/race-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
