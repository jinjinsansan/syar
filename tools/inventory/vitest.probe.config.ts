/**
 * N-2 計測専用の vitest 設定。既定設定に `probe-setup.ts` を足しただけ。
 * 通常の `npm test` はこの設定を使わない（計測が本番のテスト実行に影響しないようにする）。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@star/sim-engine': fileURLToPath(
        new URL('../../packages/sim-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    environment: 'node',
    setupFiles: [fileURLToPath(new URL('./probe-setup.ts', import.meta.url))],
  },
});
