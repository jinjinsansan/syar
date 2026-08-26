/**
 * ★**最後の直線の「攻防」が実際に成立しているかを測る**（読取専用）
 *
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §4-3 の定量条件を、
 *   ★**実画面と同じ場面解決**（`resolveBroadcastV2Scene`）を通して数えます。
 *
 * 【★測るもの（§4-3）】
 *   ① 残り 260〜60m で、上位 5 頭のうち **4 頭以上が同時に画面内**にいる時間 ≧ 2.0 秒
 *   ② **2 頭以上**で、他馬に対する前後関係の変化がある
 *   ③ **1 組以上**で、並ぶ or 一時的な前後入替わりがある
 *   ④ 1 コマの移動量が突発的に増えない（跳ばない）
 *   ⑤ ★ゴール時の着順・着差が**演出なしと一致**する
 *
 * ⚠️ ★製品コードは変更しません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-climax-contest.mjs [--seeds 42,14,332,474]
 */
import { cameraBasis, posOf, project } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
const HORSE_HEIGHT_M = 2.4;
/** ★「並んだ」とみなす差（m）。馬体 1 つ分の半分 */
const ABREAST_M = 1.2;

/** その表示秒の、上位 5 頭の画面内可視と表示位置 */
function frameAt(built, clock, d, climax) {
  const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT, { climax });
  const basis = cameraBasis(r.scene.camera);
  const out = new Map();
  for (const h of r.drawn) {
    const p = posOf(built.course, h.s, h.w);
    const foot = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(r.scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
    const hp = Math.max(0, foot.y - head.y);
    const wp = hp * 1.71;
    const visible = foot.depth > 0 && foot.x + wp / 2 > 0 && foot.x - wp / 2 < W && foot.y > 0 && head.y < H;
    out.set(h.gate, { s: h.s, visible, screenX: foot.x });
  }
  return { shot: r.scene.shot.id, leadS: Math.max(...r.drawn.map((h) => h.s)), horses: out, base: r.base };
}

console.log('★指示書 §4-3 の定量条件を、実画面と同じ場面解決で数えます\n');

let allPass = true;
for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed });
  const clock = auditClock(built);
  const total = clock.introSec + clock.warp.displaySec;
  const DIST = built.DIST;
  /** ★確定着順の上位 5 頭（馬番） */
  const top5 = built.result.order.slice(0, 5).map((row) => {
    const e = built.entrants.find((x) => x.horseId === row.horseId);
    return { gate: e?.gate, pos: row.finishPosition };
  });

  const series = [];
  for (let f = 0; f / FPS <= total; f += 1) {
    const d = f / FPS;
    const fr = frameAt(built, clock, d, true);
    const rem = DIST - fr.leadS;
    if (rem > 260 || rem < 60) continue;
    series.push({ d, rem, fr });
  }
  if (series.length === 0) { console.log(`seed ${seed}: 残り 260〜60m のコマがありません`); allPass = false; continue; }

  /* ── ① 4 頭以上が同時に画面内 ── */
  let framesWith4 = 0;
  for (const row of series) {
    const vis = top5.filter((t) => row.fr.horses.get(t.gate)?.visible === true).length;
    if (vis >= 4) framesWith4 += 1;
  }
  const sec4 = framesWith4 / FPS;

  /* ── ②③ 前後関係の変化・並び・入替 ── */
  const pairChanged = new Set();
  const pairAbreast = new Set();
  const gates = top5.map((t) => t.gate);
  for (let i = 0; i < gates.length; i += 1) {
    for (let j = i + 1; j < gates.length; j += 1) {
      const a = gates[i], b = gates[j];
      let sawAhead = false, sawBehind = false, sawAbreast = false;
      for (const row of series) {
        const ha = row.fr.horses.get(a), hb = row.fr.horses.get(b);
        if (ha === undefined || hb === undefined) continue;
        const diff = ha.s - hb.s;
        if (diff > ABREAST_M) sawAhead = true;
        else if (diff < -ABREAST_M) sawBehind = true;
        else sawAbreast = true;
      }
      if (sawAhead && sawBehind) { pairChanged.add(`${a}-${b}`); }
      if (sawAbreast) pairAbreast.add(`${a}-${b}`);
    }
  }
  /** 「前後関係が変わった馬」の頭数 */
  const horsesChanged = new Set();
  for (const key of pairChanged) key.split('-').forEach((g) => horsesChanged.add(g));

  /* ── ④ 1 コマの跳び ── */
  /**
   * ★**演出なしと並べて測ります。**
   *   ⚠️ ★直線にはカメラ側の跳び（画角・注視点・カット）も元から在るので、
   *      「跳びがある」だけでは**演出のせいだと言えません**。差で見ます。
   */
  const stepsOf = (climax) => {
    const rows = [];
    for (let f = 0; f / FPS <= total; f += 1) {
      const d = f / FPS;
      const fr = frameAt(built, clock, d, climax);
      const rem = DIST - fr.leadS;
      if (rem > 260 || rem < 60) continue;
      rows.push({ d, fr });
    }
    let mx = 0, at = 0;
    for (let i = 1; i < rows.length; i += 1) {
      /** ★カットの境目は跳んでよい（この案件の基準）。★カットの**中**だけを見ます */
      if (rows[i].fr.shot !== rows[i - 1].fr.shot) continue;
      for (const t of top5) {
        const a = rows[i - 1].fr.horses.get(t.gate), b = rows[i].fr.horses.get(t.gate);
        if (a === undefined || b === undefined || !a.visible || !b.visible) continue;
        const step = Math.abs(b.screenX - a.screenX);
        if (step > mx) { mx = step; at = rows[i].d; }
      }
    }
    /**
     * ★**「跳び」と「速い動き」を分ける。**
     *   ⚠️ 1 コマの移動量が大きいだけでは跳びではありません（追い抜きは速く動くのが正しい）。
     *   ★**二階差分**（前後のコマに対する加速）が大きいときだけが跳びです。
     */
    let acc = 0, accAt = 0;
    for (let i = 2; i < rows.length; i += 1) {
      if (rows[i].fr.shot !== rows[i - 1].fr.shot || rows[i - 1].fr.shot !== rows[i - 2].fr.shot) continue;
      for (const t of top5) {
        const a = rows[i - 2].fr.horses.get(t.gate);
        const b = rows[i - 1].fr.horses.get(t.gate);
        const c = rows[i].fr.horses.get(t.gate);
        if (a === undefined || b === undefined || c === undefined) continue;
        if (!a.visible || !b.visible || !c.visible) continue;
        const d2 = Math.abs(c.screenX - 2 * b.screenX + a.screenX);
        if (d2 > acc) { acc = d2; accAt = rows[i].d; }
      }
    }
    return { mx, at, acc, accAt };
  };
  const stepOn = stepsOf(true);
  const stepOff = stepsOf(false);
  const maxStepPx = stepOn.mx, maxStepAt = stepOn.at;

  /**
   * ⑥ ★**演出が作った「前後関係の変化」の量**（＝真の位置との違い）
   *
   * 【★2026-08-26 に直したこと】
   *   ⚠️ ★以前は順位表（`drawStandings`）・馬名プレート・実況が `at`＝**エンジンの真の位置**で
   *      並んでいました。演出は**画面の前後関係**を変えるので、
   *      ★**「絵では 4 番が先頭なのに、順位表では 10 番が先頭」**が起きていました。
   *      ★実測でその食い違いは**先頭で 1.2〜3.8 秒**、上位 5 頭の並びで **7.5〜10.9 秒**。
   *   ★いまは HUD も実況も `easedAt`＝**画面に描いた位置**で並べるので、
   *     ★**絵と数字は必ず一致します。**
   *
   * ★したがって以下の数字は「不具合の量」ではなく、★**演出が作った見せ場の量**です
   *   （0 秒なら攻防が何も起きていないということ）。
   *   ⚠️ ★ゴールでは 0 に戻ります（`audit-climax-invariance.mjs` ①②⑤で確認）。
   */
  let hudTopMismatch = 0, hudAnyMismatch = 0, hudFirstAt = null;
  for (const row of series) {
    const drawn = [...row.fr.horses.entries()].sort((a, b) => b[1].s - a[1].s).map(([g]) => g);
    const trueOrder = [...row.fr.base].sort((a, b) => b.s - a.s).map((h) => h.gate);
    if (drawn[0] !== trueOrder[0]) { hudTopMismatch += 1; if (hudFirstAt === null) hudFirstAt = row.d; }
    /** ★上位 5 頭の並びそのものの食い違い */
    if (JSON.stringify(drawn.slice(0, 5)) !== JSON.stringify(trueOrder.slice(0, 5))) hudAnyMismatch += 1;
  }

  /* ── ⑤ ゴールの一致（演出 ON/OFF） ── */
  const endD = total;
  const on = frameAt(built, clock, endD, true);
  const off = frameAt(built, clock, endD, false);
  let sameFinish = true;
  for (const [gate, v] of on.horses) {
    const o = off.horses.get(gate);
    if (o === undefined || Math.abs(o.s - v.s) > 1e-9) { sameFinish = false; break; }
  }

  const ok1 = sec4 >= 2.0;
  const ok2 = horsesChanged.size >= 2;
  const ok3 = pairAbreast.size >= 1;
  const ok5 = sameFinish;
  if (!(ok1 && ok2 && ok3 && ok5)) allPass = false;

  console.log(`seed ${String(seed).padStart(3)}  確定上位5頭 = 馬番 ${top5.map((t) => t.gate).join(',')}`);
  console.log(`   ① 4 頭以上が同時に画面内   ${sec4.toFixed(2)} 秒 / 必要 2.00 秒   ${ok1 ? '○' : '×'}`);
  console.log(`   ② 前後関係が変わった馬     ${horsesChanged.size} 頭 / 必要 2 頭        ${ok2 ? '○' : '×'}`);
  console.log(`   ③ 並んだ組                 ${pairAbreast.size} 組 / 必要 1 組        ${ok3 ? '○' : '×'}`);
  console.log(`   ④ 1 コマの最大移動  演出あり ${stepOn.mx.toFixed(0)} px（${stepOn.at.toFixed(2)}s）`
    + `  / 演出なし ${stepOff.mx.toFixed(0)} px（${stepOff.at.toFixed(2)}s）`
    + `  ★差 ${(stepOn.mx - stepOff.mx).toFixed(0)} px`);
  console.log(`   ④' 1 コマの最大「加速」   演出あり ${stepOn.acc.toFixed(1)} px（${stepOn.accAt.toFixed(2)}s）`
    + `  / 演出なし ${stepOff.acc.toFixed(1)} px  ★これが小さければ跳びではなく滑らかな追い抜き`);
  console.log(`   ⑤ ゴール位置が演出なしと一致 ${ok5 ? '○ 完全一致' : '× ★不一致'}`);
  console.log(`   ⑥ 演出が作った見せ場   先頭が入れ替わって見える ${(hudTopMismatch / FPS).toFixed(2)} 秒`
    + `（初 ${hudFirstAt === null ? '—' : `${hudFirstAt.toFixed(2)}s`}）`
    + `  / 上位 5 頭の並びが真の順と違う ${(hudAnyMismatch / FPS).toFixed(2)} 秒`
    + `   ★HUD・実況も同じ位置で並べるので絵と食い違いません`);
  console.log(`   （入替わった組: ${[...pairChanged].join(' ') || 'なし'}）`);
  console.log('');
}
console.log(allPass ? '★①②③⑤ はすべての seed で成立' : '★★成立していない seed があります');
