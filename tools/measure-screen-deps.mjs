// @ts-check
/**
 * ★**画面の依存を一覧にする**（★作業用・読むだけ）
 *
 * ⚠️ ★測り方そのものは ★`apps/cli/src/screen-deps.ts` に在ります（★2 か所に書かない・D-052）。
 *    ★網（`screen-generations.test.ts`）と ★この道具が ★**同じ関数**を読みます。
 *
 *   npx tsx tools/measure-screen-deps.mjs
 */
import path from 'node:path';
import { screenDeps, screenRoutes } from '../apps/cli/src/screen-deps.ts';

const APP = path.resolve(import.meta.dirname, '../apps/web/src/app');
for (const r of screenRoutes(APP)) {
  const d = screenDeps(APP, r);
  console.log(
    `${r.padEnd(24)} rpc[${d.rpcs.join(' ')}] lib[${d.libs.join(' ')}]${d.demoOnly ? '  🔴 見本だけ' : ''}`,
  );
}
