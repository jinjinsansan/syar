/**
 * ★週送りをワーカーの経路で実際に回して確かめる（P3 の本体・B-5）
 *
 * 【何を見るか】
 *   `apps/worker/src/training-runner.ts` の `advanceTrainingWeeks` を、
 *   **本番と同じ関数のまま**実 DB に対して呼びます。
 *
 *   ① 週が進み、`last_processed_week` が全馬で揃う
 *   ② ★**二度呼んでも二度進まない**（冪等・B-5）
 *   ③ ★**いまの週（締まっていない週）は進めない**
 *   ④ 能力が実際に伸びている（★週送りが効いていることの確認）
 *   ⑤ `current ≤ potential` が全馬で成立（B-4）
 *   ⑥ 気性が誕生時×比率の下限を割らない（D-049）
 *   ⑦ ★引退した馬は週齢が 260 に達している（§7.1）
 *
 * 【★なぜ「進んだ」を PASS にしないか】
 *   週送りは7,000頭を一括で更新します。**1頭でも取りこぼしても最後まで通ります。**
 *   → 揃っているか・伸びているか・不変条件が保たれているかを別々に見ます。
 *
 * 実行: npx tsx tools/verify-training-week.mjs --env staging [--weeks 4]
 */
import pg from 'pg';
import { advanceTrainingWeeks } from '../apps/worker/src/training-runner.ts';
import { TEMPER_FLOOR_RATIO } from '../packages/training/src/index.ts';
import { LIFECYCLE_WEEKS, WEEK_MS, weekIndexAt } from '../packages/scheduler/src/index.ts';
import { ABILITY_KEYS } from '../packages/sim-engine/src/index.ts';
import { assertNotProduction } from './lib/guard.mjs';
import { loadEnv } from './lib/env.mjs';

const i = process.argv.indexOf('--weeks');
const WEEKS = i >= 0 ? Number(process.argv[i + 1]) : 4;

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
// ★状態を変えるツールなので、本番に向いていたら実行しない（R-24）
await assertNotProduction(c, 'verify-training-week.mjs');

const EPOCH = Date.parse(env.STAR_EPOCH_ISO);
const fails = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? '✓' : '★'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};
const n = (v) => (v === null || v === undefined ? null : Number(v));

console.log('# 週送りをワーカーの経路で回す（P3 の本体）');
console.log('');

// ── 準備: 誕生週を入れる（まだ入っていない馬）────────────────
const nowMs = Number((await c.query('select (extract(epoch from now()) * 1000)::bigint as ms')).rows[0].ms);
const currentWeek = weekIndexAt(nowMs, EPOCH);
/**
 * ★`birth_week` が無い馬は週送りの対象になりません（列が null）。
 *   staging の馬はプリシードで作られていて誕生週を持たないので、
 *   **調教開始できる週齢**になるよう遡って入れます。
 *   ★本番では配合の時点で入るべき値です（P4 の配合ループ・照会 Q-P3-38）。
 */
// ★足し算は SQL の外でやる。`$1 + $2` は型が決まらず
//   「operator is not unique: unknown + unknown」で落ちる（P2 で同じ壁に当たった）
const birthWeek = currentWeek - WEEKS - LIFECYCLE_WEEKS.raceableFrom;
const startWeek = birthWeek + LIFECYCLE_WEEKS.raceableFrom;
const seeded = await c.query(
  `update horses
      set birth_week = $1, last_processed_week = $2
    where birth_week is null and retired_at_week is null
    returning id`,
  [birthWeek, startWeek],
);
if (seeded.rowCount > 0) {
  console.log(`  誕生週を入れた馬: ${seeded.rowCount} 頭（週齢 ${LIFECYCLE_WEEKS.raceableFrom} = デビュー時から開始）`);
}

/**
 * ★測る前に**巻き戻します**（staging でのみ・時間を進める代わり）。
 *
 * 【なぜ要るか】
 *   既に追いついていると、週送りは何もしません。それは**正しい動作**ですが、
 *   「① 進んだ」「⑤ 能力が伸びた」は**対象0件で FAIL** になります。
 *   ★これは「効いていない」ではなく「測っていない」です（R-21）。
 *   → `last_processed_week` を ${WEEKS} 週ぶん戻し、**必ず仕事がある状態**にします。
 *
 * ⚠️ 能力は戻しません（戻す手段がありません）。同じ週を二度育てることになるので、
 *    **能力の絶対値は staging では意味を持ちません**。見るのは「伸びたか」だけです。
 */
const rewound = await c.query(
  `update horses set last_processed_week = last_processed_week - $1
    where retired_at_week is null and birth_week is not null
      and (last_processed_week - $1) >= birth_week
    returning id`,
  [WEEKS],
);
console.log(`  ★測定のため ${rewound.rowCount} 頭を ${WEEKS} 週ぶん巻き戻しました（staging のみ）`);

const before = (await c.query(
  `select count(*)::int total,
          min(last_processed_week)::text mn, max(last_processed_week)::text mx,
          avg((select sum((value)::numeric) from jsonb_each_text(stats)))::float avg_stats
     from horses where retired_at_week is null and birth_week is not null`,
)).rows[0];
console.log(`  対象 ${before.total} 頭 / 進捗 ${before.mn}〜${before.mx} / いまの週 ${currentWeek}`);
console.log(`  ★締まった最後の週 = ${currentWeek - 1}`);
console.log('');

// ── ① 1回目 ────────────────────────────────────────────
const t0 = process.hrtime.bigint();
const r1 = await advanceTrainingWeeks(c, nowMs, EPOCH, (m) => console.log(`  [警告] ${m}`));
const sec1 = Number(process.hrtime.bigint() - t0) / 1e9;
/**
 * ★引退した馬を混ぜません。
 *   最初これを混ぜて `max(last_processed_week)` が **260** になり、
 *   「締まった週(23)を越えている」と誤判定しました。
 *   260 は B-1 で1頭だけ引退まで通した馬の値で、**週送りの不具合ではありません**。
 *   ★引退馬は週送りの対象外（`retired_at_week is null` で選んでいる）なので、
 *     進捗の判定からも外します。
 */
const after1 = (await c.query(
  `select count(*)::int total,
          min(last_processed_week)::text mn, max(last_processed_week)::text mx,
          avg((select sum((value)::numeric) from jsonb_each_text(stats)))::float avg_stats,
          (select count(*) from horses where retired_at_week is not null)::int retired
     from horses where birth_week is not null and retired_at_week is null`,
)).rows[0];

console.log('【判定】');
check(r1.advanced > 0, '① 週送りが実際に進んだ',
  `延べ ${r1.advanced} 頭 / 週 ${r1.weeks.join(',')} / ${sec1.toFixed(1)}秒`);
check(!r1.incomplete, '①b ★上限に当たらず最後まで進んだ',
  r1.incomplete ? '★途中で止まっています' : '完走');
check(n(after1.mn) === n(after1.mx),
  '②a 進捗が全馬で揃っている', `${after1.mn}〜${after1.mx}`);
// ★締まった週は `currentWeek - 1`。最初 currentWeek と比べて誤判定した
check(n(after1.mx) === currentWeek - 1, '②b 締まった週まで進んでいる',
  `${after1.mx} / 目標 ${currentWeek - 1}（いまの週 ${currentWeek} は締まっていない）`);

// ── ② 2回目（冪等）──────────────────────────────────────
const r2 = await advanceTrainingWeeks(c, nowMs, EPOCH, () => {});
check(r2.advanced === 0, '③ ★二度呼んでも二度進まない（冪等・B-5）',
  `2回目の延べ頭数 ${r2.advanced}`);

// ── ③ いまの週は進めない ────────────────────────────────
const after2 = (await c.query(
  `select max(last_processed_week)::text mx from horses
    where birth_week is not null and retired_at_week is null`,
)).rows[0];
check(n(after2.mx) <= currentWeek - 1, '④ ★いまの週（締まっていない週）を越えていない',
  `${after2.mx} ≤ ${currentWeek - 1}`);

// ── ④ 能力が伸びた ──────────────────────────────────────
check(after1.avg_stats > before.avg_stats, '⑤ 能力が伸びている（週送りが効いている）',
  `平均 ${before.avg_stats.toFixed(0)} → ${after1.avg_stats.toFixed(0)}`);

// ── ⑤ 不変条件（B-4）────────────────────────────────────
const over = (await c.query(
  `select count(*)::int n from horses h
    where birth_week is not null
      and exists (
        select 1 from jsonb_each_text(h.stats) s
        join jsonb_each_text(h.potential) p on p.key = s.key
        where (s.value)::numeric > (p.value)::numeric + 1e-6)`,
)).rows[0];
check(over.n === 0, '⑥ current ≤ potential が全馬で成立（B-4）', `超過 ${over.n} 頭`);

// ── ⑥ 気性の下限（D-049）────────────────────────────────
const temperBad = (await c.query(
  `select count(*)::int n from horses
    where birth_snapshot is not null
      and temper < ((birth_snapshot->>'temper')::numeric * $1) - 1e-6`, [TEMPER_FLOOR_RATIO],
)).rows[0];
check(temperBad.n === 0, '⑦ 気性が誕生時×比率の下限を割らない（D-049）', `違反 ${temperBad.n} 頭`);

// ── ⑦ 引退の条件（§7.1）────────────────────────────────
const badRetire = (await c.query(
  `select count(*)::int n from horses
    where retired_at_week is not null
      and retirement_reason = 'age'
      and (retired_at_week - birth_week) <> $1`, [LIFECYCLE_WEEKS.retireAt],
)).rows[0];
check(badRetire.n === 0, '⑧ 加齢での引退は週齢 260 ちょうど（§7.1）', `違反 ${badRetire.n} 頭`);

console.log('');
console.log('【この実行の内訳】');
console.log(`  延べ ${r1.advanced} 頭 / 引退 ${r1.retired} 頭 / EP ${r1.epSpent.toLocaleString()} / EP不足 ${r1.epShort} 頭`);
console.log(`  所要 ${sec1.toFixed(1)}秒（★1周600秒に対する割合 ${((sec1 / 600) * 100).toFixed(1)}%）`);
console.log(`  引退済み 累計 ${after1.retired} 頭`);

await c.end();
console.log('');
console.log(fails.length === 0
  ? '★週送り: PASS — 8項目すべて成立'
  : `★週送り: FAIL — ${fails.length} 項目: ${fails.join(' / ')}`);
process.exit(fails.length === 0 ? 0 : 1);
