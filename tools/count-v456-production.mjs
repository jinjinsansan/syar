/**
 * ★**本番の V-4 / V-5 / V-6 を「数える」**（★読むだけ・2026-10-01・裁定 `REVIEW_V456_PRODUCTION_VERDICT_20261001.md` §次の 1 手）
 *
 * 【★なぜ】
 *   ★模擬（verify-race）の V-4 30.27% は ★下限まで 0.27pp。★模型のずれ（★レース内の能力の CV 10.54% 対 本番 7.23%・★頭数の分布）は
 *   ★SE では測れない。★本番は 1 日 240 レースを実際に走らせ、★人気（`race_entries.popularity`）と着順が残っている → ★数える。
 *
 * 【★数えるもの】（★確定したレース・★取消を除いた出走）
 *   ① ★1 番人気（`popularity = 1`）の勝率・複勝率（3 着以内）
 *   ② ★下位 3 ランク（★人気 > 頭数 − 3）の 1 枠あたりの勝率
 *   ③ ★頭数の分布（★8 頭立てが在るか）
 *   ④ ★レース内の能力の CV（★`entrant_snapshot.stats` ＝ ★レースを組んだときの値・`baseScore(stats, 距離)`）
 *   ★日ごと（★日本時間）にも分ける（★年齢の門の前と後を混ぜない）。★`--since` より前は合計に入れない。
 *
 * 【⚠️ ★精度】★1 日 240 レース → 2,400 レースで V-4 の SE 約 0.94pp。★0.27pp の余裕は判定できない（★「大きく割っていないか」まで）。
 *   ★線（★裁定）: 2,000 レース以上で ★28.5% 以上なら ✔／★未満なら 🔴（★出力に書く）。
 *
 * ⚠️ ★1 行も書きません（★`begin read only`）。
 *
 * 実行: npx tsx tools/count-v456-production.mjs --env production --since 2026-10-01T00:00:00+09:00
 */
import pg from 'pg';
import { baseScore } from '../packages/race-engine/src/coefficients.ts';
import { loadEnv } from './lib/env.mjs';

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const since = arg('since');
if (since === undefined || Number.isNaN(Date.parse(since))) {
  console.error('★--since を付けてください（例: --since 2026-10-01T00:00:00+09:00 ・★年齢の門の後だけを数える）');
  process.exit(2);
}

const env = loadEnv();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('begin read only');
try {
  const envRow = (await c.query('select (select environment from app_environment limit 1) as env')).rows[0];
  console.log('# 本番の V-4 / V-5 / V-6 を数える（★読むだけ）');
  console.log(`  接続先: app_environment = ${envRow?.env}`);
  console.log(`  ★合計に入れるのは 発走が ${since} 以降のレース（★日ごとの表は すべて出す）`);

  const rows = (await c.query(`
    select r.id::text as race_id, r.scheduled_at, r.distance,
           e.popularity, e.finish_pos, e.entrant_snapshot -> 'stats' as stats
      from races r
      join race_entries e on e.race_id = r.id
     where r.status = 'settled' and e.finish_pos is not null
     order by r.scheduled_at`)).rows;

  /** ★レースごとに束ねる */
  const byRace = new Map();
  for (const r of rows) {
    let x = byRace.get(r.race_id);
    if (x === undefined) { x = { at: new Date(r.scheduled_at), dist: Number(r.distance), entries: [] }; byRace.set(r.race_id, x); }
    x.entries.push({ pop: r.popularity === null ? null : Number(r.popularity), pos: Number(r.finish_pos), stats: r.stats });
  }
  const cutoff = Date.parse(since);
  const jstDay = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const cv = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (!(m > 0) || xs.length < 2) return null;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
    return sd / m;
  };
  const fresh = () => ({ races: 0, favWin: 0, favPlace: 0, favMissing: 0, lowSlots: 0, lowWins: 0, cvs: [], fields: new Map() });
  const total = fresh();
  const days = new Map();
  for (const x of byRace.values()) {
    const day = jstDay(x.at);
    if (!days.has(day)) days.set(day, fresh());
    const targets = x.at.getTime() >= cutoff ? [days.get(day), total] : [days.get(day)];
    const n = x.entries.length;
    const fav = x.entries.find((e) => e.pop === 1);
    const scores = x.entries.filter((e) => e.stats !== null && typeof e.stats === 'object').map((e) => baseScore(e.stats, x.dist));
    const c1 = scores.length === n ? cv(scores) : null;
    for (const t of targets) {
      t.races += 1;
      t.fields.set(n, (t.fields.get(n) ?? 0) + 1);
      if (fav === undefined) t.favMissing += 1;
      else { if (fav.pos === 1) t.favWin += 1; if (fav.pos <= 3) t.favPlace += 1; }
      for (const e of x.entries) if (e.pop !== null && e.pop > n - 3) { t.lowSlots += 1; if (e.pos === 1) t.lowWins += 1; }
      if (c1 !== null) t.cvs.push(c1);
    }
  }
  const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(2)}%`);
  const meanPct = (xs) => (xs.length === 0 ? '—' : `${((xs.reduce((a, b) => a + b, 0) / xs.length) * 100).toFixed(2)}%`);

  console.log('');
  console.log('【日ごと（日本時間）】★合計に入れない日も出す（★門の前後を見比べる）');
  console.log('  日付        レース  1番人気の勝率  複勝率   下位3の勝率  能力のCV  頭数(最小〜最大・平均)');
  for (const [day, t] of [...days].sort()) {
    const fs = [...t.fields].flatMap(([k, v]) => Array(v).fill(k));
    const avg = fs.length === 0 ? 0 : fs.reduce((a, b) => a + b, 0) / fs.length;
    console.log(`  ${day}  ${String(t.races).padStart(6)}  ${pct(t.favWin, t.races - t.favMissing).padStart(10)}  ${pct(t.favPlace, t.races - t.favMissing).padStart(8)}  ${pct(t.lowWins, t.lowSlots).padStart(10)}  ${meanPct(t.cvs).padStart(8)}  ${Math.min(...fs)}〜${Math.max(...fs)}・${avg.toFixed(1)}`);
  }

  const nFav = total.races - total.favMissing;
  const p = nFav === 0 ? 0 : total.favWin / nFav;
  const se = nFav === 0 ? 0 : Math.sqrt(p * (1 - p) / nFav);
  console.log('');
  console.log(`【合計】★${since} 以降: ${total.races} レース（★1 番人気が読めないレース ${total.favMissing}）`);
  console.log(`  ① V-4 1番人気の勝率   ${pct(total.favWin, nFav)}（★SE ${(se * 100).toFixed(2)}pp・合格域 30〜34%）`);
  console.log(`  ① V-5 1番人気の複勝率 ${pct(total.favPlace, nFav)}（★合格域 60〜65%）`);
  console.log(`  ② V-6 下位3の勝率（1 枠あたり） ${pct(total.lowWins, total.lowSlots)}（★合格域 0.5〜2%）`);
  console.log(`  ④ レース内の能力の CV ${meanPct(total.cvs)}（★レースを組んだときの値・${total.cvs.length} レース）`);
  console.log('  ③ 頭数の分布:');
  for (const [k, v] of [...total.fields].sort((a, b) => a[0] - b[0])) console.log(`     ${String(k).padStart(2)} 頭  ${String(v).padStart(5)} レース（${pct(v, total.races)}）`);
  console.log(`     ★8 頭立て: ${total.fields.get(8) ?? 0} レース`);
  /**
   * ★⑤ **8 頭未満のレース**（★2026-10-01・裁定 §8）: ★取消で減ったのか（★仕様どおり）・★組んだ時点から少ないのか（★欠陥）。
   *   ★取消の出走は `finish_pos` が空のまま残る → ★登録の数（取消を含む）と 走った数を並べる。
   */
  const small = (await c.query(`
    select r.id::text as race_id, r.scheduled_at, count(*)::int as entered, count(e.finish_pos)::int as ran
      from races r join race_entries e on e.race_id = r.id
     where r.status = 'settled'
     group by r.id, r.scheduled_at
    having count(e.finish_pos) < 8
     order by r.scheduled_at`)).rows;
  console.log('');
  console.log(`【⑤ 走った頭数が 8 未満のレース】${small.length} 件（★期間を問わず）`);
  for (const s of small) {
    console.log(`  ${jstDay(new Date(s.scheduled_at))} ${s.race_id.slice(0, 8)}  登録 ${s.entered} 頭・走った ${s.ran} 頭 → ${s.entered >= 8 ? '★取消で減った（仕様どおり）' : '🔴 組んだ時点から 8 頭未満'}`);
  }

  /**
   * ★⑥ **素質（potential）のレース内 CV**（★裁定 §8: ★能力の CV が「どこで止まるか」）。
   *   ★素質は `horses.potential`（★いまの値。★素質は故障でしか下がらないので ★当時とほぼ同じ）。★能力と同じ `baseScore(・, 距離)`。
   *   ★表示には出さない値（D-114）。★ここは開発側の測定だけ。
   */
  const pot = (await c.query(`
    select r.id::text as race_id, r.scheduled_at, r.distance, h.potential
      from races r
      join race_entries e on e.race_id = r.id
      join horses h on h.id = e.horse_id
     where r.status = 'settled' and e.finish_pos is not null`)).rows;
  const potByRace = new Map();
  for (const r of pot) {
    let x = potByRace.get(r.race_id);
    if (x === undefined) { x = { at: new Date(r.scheduled_at), dist: Number(r.distance), scores: [] }; potByRace.set(r.race_id, x); }
    if (r.potential !== null && typeof r.potential === 'object') x.scores.push(baseScore(r.potential, x.dist));
  }
  const potDays = new Map();
  for (const x of potByRace.values()) {
    const v = cv(x.scores);
    if (v === null) continue;
    const d = jstDay(x.at);
    if (!potDays.has(d)) potDays.set(d, []);
    potDays.get(d).push(v);
  }
  console.log('');
  console.log('【⑥ 素質（potential）のレース内 CV】★能力の CV が向かう先（★7.5〜8% なら底・★6% 以下ならまだ下がる＝裁定 §8）');
  console.log('  日付        レース  素質のCV   能力のCV（上の表と同じ）');
  for (const [d, vs] of [...potDays].sort()) {
    console.log(`  ${d}  ${String(vs.length).padStart(6)}  ${meanPct(vs).padStart(8)}  ${meanPct(days.get(d)?.cvs ?? []).padStart(8)}`);
  }

  /**
   * ★⑦ **誕生週の散らばり**（★2026-10-01・簿 SEED-LOCKSTEP の閉じる条件）: ★育成の位相（齢 % 4）が揃っていれば
   *   ★「1 つの位相で V-4 を測った」ことになる。★齢の差は誕生週の差なので ★`birth_week % 4` の件数で見る（★同じ並びを ずらしただけ）。
   *   ★現役（`retired_at_week is null`）と ★絞らない版の 2 通り（★絞り込みが例外を隠したことがある）。
   */
  const phase = (await c.query(`
    select (retired_at_week is null) as active,
           count(distinct birth_week)::int as kinds,
           count(*) filter (where ((birth_week % 4) + 4) % 4 = 0)::int as p0,
           count(*) filter (where ((birth_week % 4) + 4) % 4 = 1)::int as p1,
           count(*) filter (where ((birth_week % 4) + 4) % 4 = 2)::int as p2,
           count(*) filter (where ((birth_week % 4) + 4) % 4 = 3)::int as p3
      from horses
     group by rollup ((retired_at_week is null))`)).rows;
  console.log('');
  console.log('【⑦ 誕生週の散らばり】★SEED-LOCKSTEP（★位相が 4 つに散っていれば 本番ぶんは外す）');
  for (const r of phase) {
    const label = r.active === null ? 'すべて（絞らない）' : r.active ? '現役' : '引退';
    console.log(`  ${label.padEnd(10)}  誕生週の種類 ${String(r.kinds).padStart(4)}  位相 0/1/2/3 ＝ ${r.p0} / ${r.p1} / ${r.p2} / ${r.p3}`);
  }
  /**
   * ★**崖**（★簿 POOL-CLIFF）: ★種類の数では山が見えない（★144 種類でも 1 週に偏れば崖）。
   *   ★現役のうち ★いちばん多い誕生週の頭数と割合・★上位 5 週の合計の割合。★線は ★最大の 1 週が 現役の 10% 未満。
   */
  const peaks = (await c.query(`
    select birth_week, count(*)::int as n
      from horses where retired_at_week is null
     group by birth_week order by n desc, birth_week`)).rows;
  const activeN = peaks.reduce((a, r) => a + r.n, 0);
  if (activeN > 0) {
    const top = peaks[0];
    const top5 = peaks.slice(0, 5).reduce((a, r) => a + r.n, 0);
    const share = top.n / activeN;
    console.log(`  現役の最大の山: 誕生週 ${top.birth_week} に ${top.n} 頭（${(share * 100).toFixed(2)}%）／上位 5 週の合計 ${top5} 頭（${((top5 / activeN) * 100).toFixed(2)}%）・現役 ${activeN} 頭`);
    console.log(share < 0.10 ? '  ✔ ★最大の 1 週は 10% 未満（★崖は無い・POOL-CLIFF の線）' : '  🔴 ★最大の 1 週が 10% 以上（★まだ崖がある）');
  }

  console.log('');
  if (total.races < 2000) console.log(`  ⚠️ ★まだ ${total.races} レース（★2,000 未満）。★線（28.5%）での判定は まだしない（★裁定）。`);
  else console.log(p >= 0.285 ? '  ✔ ★V-4 は 28.5% 以上（★模型のずれは余裕の中・裁定の線）' : '  🔴 ★V-4 が 28.5% 未満（★世界が下限を割っている → 較正の見直し・オーナーへ）');
} finally {
  await c.query('rollback');
  await c.end();
}
