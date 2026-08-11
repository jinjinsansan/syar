/**
 * ★道悪のレースで `heavy_aptitude` が着順に効いているか（読むだけ・判定を出す）
 *
 * レビュー側の指定（REVIEW_P3_Q32_VERDICT）:
 *   > 4. 道悪のレースで heavy_aptitude が着順に効いていること
 *
 * 【なぜこの検証が要るのか】
 *   `pg-store` が `track_condition` に `'good'` を直書きしていたため、
 *   **本番443件すべてが良馬場**でした。道悪が一度も発生しないので、
 *   **`heavy_aptitude` は一度も効いていません**。
 *   P-1 でわざわざ genotype に足した形質（そのためにプリシードを待たせた形質）が、
 *   本番では飾りでした。
 *
 *   ★「形質が実装されている」ことと「その形質が効いている」ことは別です。
 *     効いていないことは、どの数字にも現れませんでした（V-4 も V-10 も通る）。
 *
 * 【★どう測るか】
 *   道悪（`yielding` / `soft` / `bad`）のレースについて、
 *   出走馬の `heavy_aptitude` と**着順**の相関を見ます。
 *   道悪適性が高いほど上位に来るはずなので、**相関は負**になります
 *   （着順は小さいほど良いので）。
 *
 *   ★良馬場のレースでも同じ相関を出します。**そちらは 0 近傍のはず**です。
 *     道悪だけで負になっていなければ、「道悪が来ても効いていない」ということです。
 *
 * 【★本数が足りなければ判定しません】
 *   相関は本数が要ります。足りなければ**合否を出さず exit 2**（R-20/R-21）。
 *
 * 実行: npx tsx tools/verify-heavy.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** ★1レースあたりの相関を出すのに最低限要る出走頭数 */
const MIN_FIELD = 6;
/** ★平均相関を判定するのに最低限要るレース数 */
const MIN_RACES = 3;

/** ピアソン相関。★分母が 0 なら NaN（黙って 0 を返さない） */
const corr = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
};

const races = (await c.query(
  `select id, cycle_index, track_condition from races
    where status = 'settled' order by cycle_index`,
)).rows;

console.log('# 道悪で heavy_aptitude が着順に効いているか');
console.log('');

const byCond = { heavy: [], good: [] };
let skipped = 0;
for (const r of races) {
  const ents = (await c.query(
    `select e.finish_pos, h.heavy_aptitude
       from race_entries e join horses h on h.id = e.horse_id
      where e.race_id = $1 and e.finish_pos is not null`, [r.id],
  )).rows;
  if (ents.length < MIN_FIELD) { skipped += 1; continue; }
  const x = ents.map((e) => Number(e.heavy_aptitude));
  const y = ents.map((e) => Number(e.finish_pos));
  const rho = corr(x, y);
  if (!Number.isFinite(rho)) { skipped += 1; continue; }
  (r.track_condition === 'good' ? byCond.good : byCond.heavy).push({ cycle: r.cycle_index, rho });
}

console.log(`  確定済み ${races.length} 本 / 使えた ${byCond.good.length + byCond.heavy.length} 本 / 飛ばした ${skipped} 本`);
console.log(`  ★飛ばしたのは「出走 ${MIN_FIELD}頭未満」「適性が全馬同じ」のレースです`);
console.log('');

const mean = (a) => (a.length === 0 ? NaN : a.reduce((x, y) => x + y, 0) / a.length);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

for (const [label, list] of [['道悪（稍重・重・不良）', byCond.heavy], ['良馬場', byCond.good]]) {
  const rs = list.map((x) => x.rho);
  const m = mean(rs);
  const se = sd(rs) / Math.sqrt(rs.length);
  console.log(`  ${label.padEnd(22)} ${String(rs.length).padStart(3)} 本  相関 ${Number.isFinite(m) ? m.toFixed(3) : '—'}  SE ${Number.isFinite(se) ? se.toFixed(3) : '—'}`);
  if (list.length > 0 && list.length <= 10) {
    console.log(`    内訳: ${list.map((x) => `${x.cycle}:${x.rho.toFixed(2)}`).join(' ')}`);
  }
}
console.log('  ★着順は小さいほど良いので、適性が効いていれば**相関は負**になります');
console.log('');

/**
 * ── ★直接の実験（観察ではなく）────────────────────────────
 *
 * 【上の観察が使えない理由】
 *   道悪の相関は **+0.208**（適性が高いほど着順が悪い）で、良馬場でも **+0.095** でした。
 *   ★どちらも同じ向きなので、これは「道悪で効いていない」ではなく
 *     **`heavy_aptitude` が能力と負に相関している**（交絡）と読むのが自然です。
 *   出走馬の能力が違うまま相関を取っても、適性の効果は取り出せません。
 *
 * 【★そこで、同じ出走馬を馬場だけ変えて走らせます】
 *   同じレース・同じ乱数で `good` と `soft` を1回ずつ確定し、
 *   **着順がどう入れ替わったか**を見ます。能力も枠も脚質も同じなので、
 *   ★差はすべて馬場によるものです。
 *   道悪適性の高い馬が `soft` で順位を上げていれば、形質は効いています。
 */
console.log('## ★直接の実験（同じ出走馬・馬場だけ変える）');
const { resolveRace, DEFAULT_RACE_BALANCE } = await import('../packages/race-engine/src/index.ts');
const { rowToHorse } = await import('../apps/worker/src/horse-repo.ts');

const expRaces = (await c.query(
  `select id, cycle_index, distance, surface from races where status = 'settled'
    order by cycle_index desc limit 12`)).rows;
const deltas = [];
for (const r of expRaces) {
  const es = (await c.query(
    `select e.gate, e.weight, e.strategy, h.* from race_entries e
       join horses h on h.id = e.horse_id where e.race_id = $1 order by e.gate`, [r.id])).rows;
  if (es.length < MIN_FIELD) continue;
  const entrants = es.map((row) => {
    const h = rowToHorse(row);
    return {
      horseId: String(row.gate), stats: h.stats, surfaceAptitude: h.surfaceAptitude,
      distanceCenter: h.distanceCenter, distanceRange: h.distanceRange,
      strategyAptitude: h.strategyAptitude, heavyAptitude: h.heavyAptitude,
      strategy: String(row.strategy), condition: 3, fatigue: 0,
      weightKg: Number(row.weight), gate: Number(row.gate), age: 4, skillGenes: h.skillGenes,
    };
  });
  const base = {
    raceId: `EXP-${r.cycle_index}`, distance: Number(r.distance),
    surface: r.surface, courseShape: 'oval', baseWeightKg: 55,
  };
  // ★同じ種で2回。違うのは馬場だけ
  const seed = 20260812;
  const posOf = (tc) => {
    const out = resolveRace({
      conditions: { ...base, trackCondition: tc }, entrants, seed, balance: DEFAULT_RACE_BALANCE,
    });
    return new Map(out.order.map((o) => [o.horseId, o.finishPosition]));
  };
  const good = posOf('good');
  const soft = posOf('soft');
  for (const e of entrants) {
    // ★順位が上がった（数字が小さくなった）ぶんを正にする
    deltas.push({ heavy: e.heavyAptitude, gain: good.get(e.horseId) - soft.get(e.horseId) });
  }
}
let experimentRan = false;
let experimentWorks = false;
if (deltas.length < 20) {
  console.log(`  ★標本が ${deltas.length} 頭ぶんしかありません。判定しません`);
} else {
  experimentRan = true;
  const rho = corr(deltas.map((d) => d.heavy), deltas.map((d) => d.gain));
  const hi = deltas.filter((d) => d.heavy >= 60);
  const lo = deltas.filter((d) => d.heavy <= 40);
  console.log(`  標本 ${deltas.length} 頭ぶん（${expRaces.length} レースを good と soft で1回ずつ）`);
  console.log(`  道悪適性と「soft で上がった順位」の相関: ${rho.toFixed(3)}  ★正なら効いている`);
  console.log(`  適性60以上 ${hi.length}頭: 平均 ${mean(hi.map((d) => d.gain)).toFixed(2)} 着ぶん上昇`);
  console.log(`  適性40以下 ${lo.length}頭: 平均 ${mean(lo.map((d) => d.gain)).toFixed(2)} 着ぶん上昇`);
  const works = rho > 0 && hi.length > 0 && lo.length > 0
    && mean(hi.map((d) => d.gain)) > mean(lo.map((d) => d.gain));
  experimentWorks = works;
  console.log(works
    ? '  ✓ ★道悪適性の高い馬が soft で順位を上げている（形質が効いている）'
    : '  ★道悪適性が着順に効いていません（または向きが逆です）');
}
console.log('');

/**
 * ★判定は**実験のほう**で出します（観察は交絡するので参考値）。
 *
 *   観察: 道悪 +0.208 / 良馬場 +0.095 — どちらも同じ向きなので、
 *         これは「効いていない」ではなく `heavy_aptitude` が能力と負に相関している
 *         （＝出走馬の能力が違うまま相関を取っても適性の効果は取り出せない）。
 *   実験: 同じ出走馬・同じ乱数で馬場だけ変える。★差はすべて馬場によるもの。
 */
console.log('【判定】★観察ではなく実験で判定します（観察は能力と交絡するため）');
console.log(`  観察（参考）: 道悪 ${mean(byCond.heavy.map((x) => x.rho)).toFixed(3)} / 良馬場 ${mean(byCond.good.map((x) => x.rho)).toFixed(3)}`);
await c.end();
if (!experimentRan) {
  console.log('★判定できません — 実験の標本が足りません（R-21: 効いていないのではなく測れていない）');
  process.exit(2);
}
console.log(experimentWorks
  ? '★道悪で heavy_aptitude が効いている: PASS（同じ出走馬で馬場だけ変えて確認）'
  : '★道悪で heavy_aptitude が効いている: FAIL — 効いていないか、向きが逆です');
process.exit(experimentWorks ? 0 : 1);
