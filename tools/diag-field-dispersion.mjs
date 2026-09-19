/**
 * ★**1 レースの中で、★出走馬の能力がどれだけ散らばっているか**（★読むだけ・2026-09-20）
 *
 * 【🔴 ★なぜこれを測るか】
 *   ★`PROD-NEVER-AGED` で、★本番の V-4 が帯を 13.8 SE 外れていました。
 *   ★合成で素質開放率だけを本番の値（0.28〜0.35）にしても、★説明できたのは ★**差の 4 割**だけ。
 *   → ★残り 6 割を探すのに ★**V-4 を比べるのは遠回り**です（★間にオッズ・クラス編成・乱数が挟まる）。
 *
 *   ★V-4 を決めている当の量は ★**「馬どうしの散らばりが、★乱数の荒れに対してどれだけ広いか」**です。
 *   → ★★**その散らばりを直接 測ります。**
 *
 * 【★何を能力とみなすか（★**R-30**: ★レースに渡された値で測る）】
 *   ✔ ★`apps/worker/src/build-race.ts:191` は `abilityOf: (h) => h.stats`。★**`stats` がオッズの素**です。
 *   ✔ ★そこから順位を決める量は `packages/race-engine/src/coefficients.ts:49` の
 *     ★**`baseScore(stats, distance)`**（★距離帯ごとの重み）。★**その関数をそのまま呼びます。**
 *   ⚠️ ★`potential` では測りません。★レースは `potential` を見ていません。
 *
 * 【⚠️ ★本番に限っては、いまの `stats` ＝ 当時の `stats`】
 *   ✔ ★本番の馬は ★**一度も育っていません**（`birth_week` 全頭 null・`horse_week_log` 0 行）。
 *   → ★だから ★**今日読んだ `stats` は、★そのレースが使った値そのもの**です。
 *   🔴 ★**staging では成り立ちません**（★育っているので、当時の値は残っていません）。
 *     → ★staging に対して流したときは、★その旨を出します。
 *
 * 【★出すもの】
 *   ★① 全体: ★レース内の変動係数（SD ÷ 平均）を、★レースで平均したもの
 *   ★② クラス別: ★同じものを `class_rank` ごとに
 *   ★③ 🔴 ★**クラスの平均能力が、★上のクラスほど高いか**
 *      ★（★高くなければ、★クラス分けが実力を分けていない ＝ ★それ自体が答え）
 *
 * ⚠️ ★1 行も書きません（`select` のみ）。
 *
 * 実行: node tools/diag-field-dispersion.mjs --env production
 */
import pg from 'pg';
import { baseScore } from '../packages/race-engine/src/coefficients.ts';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const envRow = (await c.query('select (select environment from app_environment limit 1) as env')).rows[0];
console.log('# 1 レースの中の能力の散らばり（★読むだけ）');
console.log(`  接続先: app_environment = ${envRow.env}`);
if (envRow.env !== 'production') {
  console.log('  ⚠️ 🔴 ★**本番以外では、いまの `stats` は当時の値ではありません**（★育っているため）。');
  console.log('     ★以下の数は「★いまの能力で、★当時の出走表を並べたら」であって、★当時の散らばりではありません。');
}

/** ★確定したレースの、★出走馬の `stats` と距離 */
const rows = (await c.query(`
  select r.id::text as race_id, r.class_rank, r.distance, h.stats
    from race_entries e
    join races r on r.id = e.race_id
    join horses h on h.id = e.horse_id
   where r.status = 'settled' and e.finish_pos is not null
   order by r.id`)).rows;

/** ★レースごとに束ねる */
const byRace = new Map();
for (const r of rows) {
  const k = r.race_id;
  if (!byRace.has(k)) byRace.set(k, { cls: Number(r.class_rank), dist: Number(r.distance), scores: [] });
  byRace.get(k).scores.push(baseScore(r.stats, Number(r.distance)));
}

const cv = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (m === 0) return 0;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return sd / m;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const races = [...byRace.values()].filter((r) => r.scores.length >= 3);
console.log('');
console.log(`  対象: ${races.length} レース / ${rows.length} 出走`);
console.log('');
console.log('【① 全体】');
console.log(`  レース内の変動係数（SD ÷ 平均）の平均: ★**${(mean(races.map((r) => cv(r.scores))) * 100).toFixed(2)}%**`);
console.log(`  レース内の平均能力の全体平均             : ${mean(races.map((r) => mean(r.scores))).toFixed(1)}`);

console.log('');
console.log('【② クラス別】');
const byClass = new Map();
for (const r of races) {
  if (!byClass.has(r.cls)) byClass.set(r.cls, []);
  byClass.get(r.cls).push(r);
}
console.log('  class  レース数   レース内 CV   レース内の平均能力');
for (const cls of [...byClass.keys()].sort((a, b) => a - b)) {
  const rs = byClass.get(cls);
  console.log(
    `  ${String(cls).padStart(5)}  ${String(rs.length).padStart(7)}   `
      + `${(mean(rs.map((r) => cv(r.scores))) * 100).toFixed(2).padStart(9)}%   `
      + `${mean(rs.map((r) => mean(r.scores))).toFixed(1).padStart(10)}`,
  );
}

console.log('');
console.log('【③ 🔴 クラスの平均能力は、★上のクラスほど高いか】');
const ordered = [...byClass.keys()].sort((a, b) => a - b)
  .map((cls) => ({ cls, m: mean(byClass.get(cls).map((r) => mean(r.scores))) }));
/**
 * ⚠️ 🔴 ★**桁を落とさないこと**（★2026-09-20・自分で踏みました）。
 *   ★最初 1 桁で印刷していたので、★**単調でないと判定されたのに、
 *   ★表示上は上がって見える**という食い違いが出ました。
 *   → ★**判定を支えられる桁で出す**（★`CK-12` の族）。
 */
let monotone = true;
const breaks = [];
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i].m < ordered[i - 1].m) {
    monotone = false;
    breaks.push(`class ${ordered[i - 1].cls}(${ordered[i - 1].m.toFixed(3)}) → ${ordered[i].cls}(${ordered[i].m.toFixed(3)})`);
  }
}
console.log(`  ${ordered.map((o) => `${o.cls}:${o.m.toFixed(3)}`).join('  ')}`);
if (breaks.length > 0) console.log(`  ★下がっている箱所: ${breaks.join(' / ')}`);
/** 🔴 ★単調かどうかより、★**どれだけ違うか**のほうが大事です */
const lo = ordered[0].m, hi = ordered[ordered.length - 1].m;
console.log(`  ★最下クラス → 最上クラスの差: ${(hi - lo).toFixed(2)}（${((hi / lo - 1) * 100).toFixed(2)}%）`);
console.log(monotone
  ? '  ✅ ★単調に上がっています（★クラス分けは実力を分けています）'
  : '  🔴 ★**単調ではありません** — ★上のクラスが下のクラスより弱い箇所があります。'
    + '\n     ★育たない世界では「勝つ」がほぼ乱数なので、★上のクラスに居るのは'
    + '\n     ★**たまたま勝った馬**であって、★強い馬ではない、という筋と合います。');

/**
 * 🔴 ★**分解**（★2026-09-20）。
 *
 * ✔ ★`baseScore` は**重み付き和**（`coefficients.ts:57-60`）で、
 *   ★素質開放率 `u` は**馬ごとに 1 回**引かれて**5 能力すべてに同じ倍率**で掛かる。
 *   → ★**`baseScore(potential × u) = u × baseScore(potential)`** が**厳密に**成り立つ。
 *
 * ⚠️ 🔴 ** CV は「計算した集合の中」でしか意味を持ちません。**
 *   ★レース内の CV と、★集団全体の CV は別の量です。★両方 出します。
 */
console.log('');
console.log('【④ 🔴 分解: 能力の散らばりは、素質か、生まれつきの当たり外れか】');
const pots = (await c.query(`
  select h.potential, h.stats from horses h where h.retired_at_week is null`)).rows;
/** ⚠️ ★距離は集団全体では決まらないので、★**中距離 1600m** で揃えて比べます */
const D = 1600;
const potScores = pots.map((r) => baseScore(r.potential, D));
const statScores = pots.map((r) => baseScore(r.stats, D));
const unlocks = pots.map((r, i) => (potScores[i] === 0 ? 0 : statScores[i] / potScores[i]));
console.log(`  ★集団全体 CV(baseScore(potential))  = **${(cv(potScores) * 100).toFixed(2)}%**   (n=${pots.length})`);
console.log(`  ★集団全体 CV(baseScore(stats))      = **${(cv(statScores) * 100).toFixed(2)}%**`);
console.log(`  ★集団全体 CV(素質開放率)              = **${(cv(unlocks) * 100).toFixed(2)}%**  (平均 ${mean(unlocks).toFixed(4)})`);

/** 🔴 ★レース内の potential の CV（★分解が解けるのはこちら） */
const potRows = (await c.query(`
  select r.id::text as race_id, r.distance, h.potential
    from race_entries e
    join races r on r.id = e.race_id
    join horses h on h.id = e.horse_id
   where r.status = 'settled' and e.finish_pos is not null`)).rows;
const potByRace = new Map();
for (const r of potRows) {
  if (!potByRace.has(r.race_id)) potByRace.set(r.race_id, []);
  potByRace.get(r.race_id).push(baseScore(r.potential, Number(r.distance)));
}
const inRacePot = [...potByRace.values()].filter((x) => x.length >= 3).map(cv);
const inRacePotCv = mean(inRacePot) * 100;
console.log(`  ★レース内   CV(baseScore(potential))  = **${inRacePotCv.toFixed(2)}%**`);

const inRaceStatCv = mean(races.map((r) => cv(r.scores))) * 100;
const uCv = cv(unlocks) * 100;
console.log('');
console.log(`  ★照合: √(レース内 stats² − 開放率²) = √(${inRaceStatCv.toFixed(2)}² − ${uCv.toFixed(2)}²) = ${Math.sqrt(Math.max(0, inRaceStatCv ** 2 - uCv ** 2)).toFixed(2)}%`);
console.log(`  ★実測のレース内 CV(potential)                      = ${inRacePotCv.toFixed(2)}%`);
console.log('  ⚠️ ★この 2 つが近ければ、★分解（u と potential が独立）は合っています。');

await c.end();
console.log('');
console.log('⚠️ ★1 行も書いていません（`select` のみ）。');
