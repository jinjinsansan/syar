/**
 * ★staging の馬を実際に育てて、開放率がハーネスの前提に届くかを見る
 *   （P3 クローズ条件3・レビュー側指定）
 *
 * 【指定】
 *   > **3の確認が要ります** — 「週送りを繋いだ」ではなく
 *   > 「**開放率の分布がハーネスの前提（平均73.8%・SD11.0pt）に到達した**」ことを
 *   > 測ってください。**繋いだ直後はまだ誕生時に近い**はずです。
 *
 * 【★どう育てるか】
 *   `advanceTrainingWeeks`（本番と同じ関数）を、追いつくまで繰り返し呼びます。
 *   ★ここで自前に週を進めたら意味がありません。**本番の経路を通します。**
 *
 *   週送りは「締まった週まで」しか進まないので、**誕生週を過去にずらして**
 *   目標の週齢に届くようにします。★staging でのみ許される時間の操作です
 *   （`settle-races.mjs` と同じ考え方）。
 *
 * 【★比較の相手】
 *   ハーネス（`training-state.ts`）は**キャリアの中央**の標本で
 *   平均 73.8% / SD 11.0pt でした。こちらも**同じ週齢**まで育てて比べます。
 *
 * 実行: npx tsx tools/age-horses.mjs --env staging [--age 182]
 */
import pg from 'pg';
import { advanceTrainingWeeks } from '../apps/worker/src/training-runner.ts';
import { LIFECYCLE_WEEKS, weekIndexAt } from '../packages/scheduler/src/index.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--age');
/** ★キャリアの中央（78 と 260 の中点は 169 だが、ハーネスの標本はデビュー以降の中央 = 182） */
const TARGET_AGE = i >= 0 ? Number(process.argv[i + 1]) : 182;

/** ★ハーネスの前提（`training-state.ts` の実測）。ここに届くかを見る */
const HARNESS = { meanUnlock: 0.738, sdUnlock: 0.110 };

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await assertNotProduction(c, 'age-horses.mjs');

const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
const nowMs = Number((await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms);
const closedWeek = weekIndexAt(nowMs, EPOCH) - 1;

console.log('# staging の馬を育てて、開放率がハーネスの前提に届くか');
console.log(`  目標の週齢 ${TARGET_AGE} / 締まった週 ${closedWeek}`);
console.log('');

/** 開放率（現在能力の和 ÷ 素質の和）。★jsonb を数値にして集計する */
const unlockStats = async () => (await c.query(
  `select count(*)::int n,
          avg(u)::float mean, stddev_samp(u)::float sd,
          min(u)::float mn, max(u)::float mx
     from (
       select (select sum((value)::numeric) from jsonb_each_text(stats))
            / nullif((select sum((value)::numeric) from jsonb_each_text(potential)), 0) as u
         from horses where retired_at_week is null and birth_week is not null
     ) t where u is not null`,
)).rows[0];

const before = await unlockStats();
console.log(`  育てる前: ${before.n} 頭 / 開放率 平均 ${(before.mean * 100).toFixed(1)}% SD ${(before.sd * 100).toFixed(1)}pt`);

// ── 誕生週をずらして、目標の週齢に届くようにする ────────────
const birthWeek = closedWeek - TARGET_AGE;
const startWeek = birthWeek + LIFECYCLE_WEEKS.trainableFrom;
const moved = await c.query(
  `update horses
      set birth_week = $1,
          last_processed_week = $2
    where retired_at_week is null and birth_week is not null
    returning id`,
  [birthWeek, startWeek],
);
console.log(`  ★誕生週を ${birthWeek} にずらしました（${moved.rowCount} 頭・週齢 ${LIFECYCLE_WEEKS.trainableFrom} から開始）`);
console.log(`     → 締まった週まで進めると週齢 ${TARGET_AGE} になります`);
console.log('');

// ── 追いつくまで繰り返す（★本番と同じ関数を呼ぶ）──────────
let rounds = 0;
let advanced = 0;
let retired = 0;
const t0 = process.hrtime.bigint();
for (;;) {
  rounds += 1;
  if (rounds > 200) throw new Error('200回呼んでも追いつきません（上限）');
  const r = await advanceTrainingWeeks(c, nowMs, EPOCH, () => {});
  advanced += r.advanced;
  retired += r.retired;
  if (r.advanced === 0) break;
  if (rounds % 5 === 0) {
    const p = (await c.query(
      `select min(last_processed_week - birth_week)::int mn
         from horses where retired_at_week is null and birth_week is not null`,
    )).rows[0];
    process.stdout.write(`\r  ${rounds} 回目 … 週齢 ${p.mn} / ${TARGET_AGE}   `);
  }
}
const sec = Number(process.hrtime.bigint() - t0) / 1e9;
process.stdout.write('\r                                              \r');
console.log(`  ${rounds} 回で追いつきました（延べ ${advanced.toLocaleString()} 頭 / 引退 ${retired} 頭 / ${sec.toFixed(0)}秒）`);
console.log('');

const after = await unlockStats();
const age = (await c.query(
  `select min(last_processed_week - birth_week)::int mn, max(last_processed_week - birth_week)::int mx
     from horses where retired_at_week is null and birth_week is not null`,
)).rows[0];

const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

console.log('【判定】★「繋いだ」ではなく「ハーネスの前提に到達したか」');
check(age.mn === TARGET_AGE && age.mx === TARGET_AGE, '① 全馬が目標の週齢に届いた',
  `週齢 ${age.mn}〜${age.mx} / 目標 ${TARGET_AGE}`);
console.log(`  開放率: 平均 ${(after.mean * 100).toFixed(1)}%  SD ${(after.sd * 100).toFixed(1)}pt  ` +
  `（範囲 ${(after.mn * 100).toFixed(0)}〜${(after.mx * 100).toFixed(0)}%）`);
console.log(`  ハーネスの前提: 平均 ${(HARNESS.meanUnlock * 100).toFixed(1)}%  SD ${(HARNESS.sdUnlock * 100).toFixed(1)}pt`);
// ★「到達した」の幅は正典に無いので、こちらでは合否の幅を決めません（照会 Q-P3-39）
const dMean = (after.mean - HARNESS.meanUnlock) * 100;
const dSd = (after.sd - HARNESS.sdUnlock) * 100;
console.log(`  差: 平均 ${dMean >= 0 ? '+' : ''}${dMean.toFixed(1)}pt / SD ${dSd >= 0 ? '+' : ''}${dSd.toFixed(1)}pt`);
console.log('');
console.log('  ★「到達した」と言える幅は正典にありません（照会 Q-P3-39）。');
console.log('    ここでは数字を並べるだけで、合否はレビュー側の裁定を仰ぎます。');
console.log(`    ★誕生時の開放率は 28〜35% です。そこからどれだけ動いたかが要点です。`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★育成は目標まで通りました（開放率の合否は裁定待ち）'
  : `★FAIL — ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
