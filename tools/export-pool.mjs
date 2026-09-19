/**
 * ★本番（staging）の馬をそのまま書き出す — ハーネスに実分布を食わせるため
 *
 * 【なぜ要るか（レビュー側裁定・Q-P3-39）】
 *   > 73.8% は要件ではなく、**ハーネスが偶然その値だっただけ**です。
 *   > 判定基準を「**本番の開放率分布そのもので P1 ゲートが帯に入ること**」に変えます。
 *   > **平均だけでなく分布の形ごと**本番のものを使ってください。
 *
 *   → 平均を合わせにいくのではなく、**実物を食わせます**。
 *     `potential` と `stats` の**同時分布**（＝開放率の分布の形）がそのまま入ります。
 *     調子・疲労も一緒に書き出すので、B-6 の配線も実データで測れます。
 *
 * 【★ワーカーと同じ取り方をする】
 *   `loadRaceablePool`（本番が出走馬を選ぶときに使う関数）をそのまま呼びます。
 *   ★ここで別の条件で取ると、「本番の分布」ではなくなります。
 *
 * 【★読むだけです】
 *   DB を一切変えません。本番に向けても安全ですが、
 *   **本番はまだ週送りが回っていない**ので、いま書き出すと誕生時の能力になります。
 *
 * 実行: npx tsx tools/export-pool.mjs --env staging --out docs/pool-staging.json
 */
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { ACTIVE_WHERE, RACEABLE_WHERE, loadRaceablePool, loadTrainingStates } from '../apps/worker/src/horse-repo.ts';
import { ABILITY_KEYS } from '../packages/sim-engine/src/index.ts';
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--out');
const OUT = i >= 0 ? process.argv[i + 1] : 'docs/pool-staging.json';

/**
 * ★**AL-11 の 3 本を書き出すための口**（★2026-09-19）。★既定は**いまの配備そのもの**です。
 *
 *   `--predicate raceable`（既定） … `RACEABLE_WHERE`（★世代 max-2 以上）
 *   `--predicate active`           … `ACTIVE_WHERE`（★`retired_at_week is null` だけ・PO-4）
 *   `--limit <n>`（既定 3,000）     … `RACEABLE_POOL_LIMIT`（★PO-2 で切っている値）
 *
 * ⚠️ ★**既定を変えていません。** ★何も渡さなければ、★今までと 1 行も違わない出力になります。
 */
const pi = process.argv.indexOf('--predicate');
const PREDICATE = pi >= 0 ? process.argv[pi + 1] : 'raceable';
if (PREDICATE !== 'raceable' && PREDICATE !== 'active') {
  throw new Error(`--predicate は raceable か active（受け取った: ${PREDICATE}）`);
}
const li = process.argv.indexOf('--limit');
const LIMIT = li >= 0 ? Number(process.argv[li + 1]) : undefined;
if (LIMIT !== undefined && !Number.isInteger(LIMIT)) throw new Error('--limit は整数');
const WHERE = PREDICATE === 'active' ? ACTIVE_WHERE : RACEABLE_WHERE;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/**
 * ★**切ったら黙らない**（★PO-2）。★AL-11 の B/C は上限を外して呼ぶので、
 *   ★切られていたら「上限を外したつもりで切れていた」に気づけません。
 */
let truncated = null;
const pool = await loadRaceablePool(
  c,
  LIMIT ?? undefined,
  (eligible, used) => { truncated = { eligible, used }; },
  WHERE,
);
console.log(`[export-pool] 述語=${PREDICATE} / 上限=${LIMIT ?? '既定(3000)'} → ★${pool.length} 頭`);
if (truncated !== null) {
  console.log(`[export-pool] ⚠️ ★上限で切りました: 条件に合うのは ${truncated.eligible} 頭、読んだのは ${truncated.used} 頭`);
}
const states = await loadTrainingStates(c);
const ages = new Map(
  (await c.query(
    `select id, (last_processed_week - birth_week)::int as age
       from horses where birth_week is not null`,
  )).rows.map((r) => [r.id, Number(r.age)]),
);
await c.end();

/**
 * ★`HorseRecord` に調子・疲労・週齢を添えて書き出します。
 *   `pedigreeCache` は `Map` なので JSON にすると空になります。
 *   → **配列に直します**（黙って落とすと、読み戻したときに別の馬になります）。
 */
const out = pool.map((h) => ({
  ...h,
  pedigreeCache: [...h.pedigreeCache.entries()],
  __training: states.get(h.id) ?? null,
  __ageWeeks: ages.get(h.id) ?? null,
}));

writeFileSync(OUT, JSON.stringify(out), 'utf8');

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};
const unlocks = out
  .map((h) => {
    const p = ABILITY_KEYS.reduce((a, k) => a + h.potential[k], 0);
    const s = ABILITY_KEYS.reduce((a, k) => a + h.stats[k], 0);
    return p > 0 ? s / p : null;
  })
  .filter((v) => v !== null);

console.log(`# 本番の馬を書き出しました: ${OUT}`);
console.log(`  ${out.length} 頭 / 育成状態あり ${out.filter((h) => h.__training !== null).length} 頭`);
console.log(`  週齢: ${Math.min(...out.map((h) => h.__ageWeeks ?? Infinity))}〜${Math.max(...out.map((h) => h.__ageWeeks ?? -Infinity))}`);
console.log(`  ★開放率（stats ÷ potential）: 平均 ${(mean(unlocks) * 100).toFixed(1)}%  SD ${(sd(unlocks) * 100).toFixed(1)}pt`);
console.log(`     範囲 ${(Math.min(...unlocks) * 100).toFixed(0)}〜${(Math.max(...unlocks) * 100).toFixed(0)}%`);
console.log('');
console.log('  ★平均を合わせにいくのではなく、この分布そのものをハーネスに食わせます。');
console.log(`     npm run verify:race -- --pool ${OUT} --real-ability --b6-wired`);
