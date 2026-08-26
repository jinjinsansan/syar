/**
 * ★**「演出を入れても結果は 1 ビットも動いていない」ことを、画面の側から証明する**（読取専用）
 *
 *   指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §7-1 / §9。
 *
 * 【★なぜ「当たり前だから」で済ませないか】
 *   ★演出（`climaxDisplayPositions`）はエンジンを呼びません。だから理屈の上では
 *     結果が動くはずがありません。★**しかしそれは「読めば分かる」であって「測った」ではありません。**
 *   この案件の基準は「**定義が在るだけで満たしているとは限らない**」（指示書 §5）です。
 *   ★そこで、演出 ON と OFF で**画面の全コマを 2 回歩き**、
 *     ★**画面から読み取れる着順・着差・払戻**を突き合わせます。
 *
 * 【★測るもの】
 *   ① 着順列（★画面上で決勝線を通った順）
 *   ② 各馬が決勝線を通る**表示秒**
 *   ③ 着差ラベル（`marginLabel`・エンジンの確定タイム差から）
 *   ④ 払戻（`settle`・★画面から読んだ着順で組んだ `RaceOutcome`）
 *   ⑤ ゴール時の表示位置（全馬・m）
 *   ⑥ ★**カットの境目**（＝編集の時刻）。演出でずれてはいけません
 *   ⑦ ★演出が効いている区間の外では、オフセットが**厳密に 0**
 *   ⑧ ★30fps 収録と 60fps 表示で、同じ時刻の位置が一致する（§7-2）
 *
 * ⚠️ ★製品コードは変更しません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-climax-invariance.mjs [--seeds 42,14,332,474]
 */
import { marginLabel } from '@star/race-engine';
import { settle, TICKET_KINDS, TICKET_ARITY } from '@star/betting';
import { CLIMAX_ENTER_M, CLIMAX_RELEASE_M } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const FPS = 30, SCRIPT = 'v5', VIEW = { width: 1280, height: 720 };

/**
 * ★**画面の全コマを 1 回歩く**。返すのは「画面から読めること」だけです。
 *   ⚠️ ★エンジンの値をここで読み直しません。読み直したら ON/OFF で同じなのは当たり前で、
 *      ★**何も証明したことになりません。**
 */
function walk(built, clock, climax) {
  const total = clock.introSec + clock.warp.displaySec + 8;
  const crossSec = new Map();      // 馬番 → 画面で決勝線を通った表示秒
  const shots = [];                // コマごとのカット id
  const changes = [];              // カットの境目
  let last;
  let lastFrame;
  let offsetOutside = 0;           // ★演出区間の外で 0 でなかったコマ数
  for (let f = 0; f / FPS <= total; f += 1) {
    const d = f / FPS;
    const r = auditSceneAt(built, clock, d, VIEW, SCRIPT, { climax });
    for (const h of r.drawn) {
      if (!crossSec.has(h.gate) && h.s >= built.DIST - 1e-6) crossSec.set(h.gate, d);
    }
    /** ★演出が効いてよいのは「先頭の残りが 320〜60m」の間だけ */
    const leadS = Math.max(...r.base.map((h) => h.s));
    const rem = built.DIST - leadS;
    const inWindow = rem < CLIMAX_ENTER_M && rem > CLIMAX_RELEASE_M;
    if (!inWindow) {
      for (const v of r.offsetByGate.values()) if (v !== 0) offsetOutside += 1;
    }
    shots.push(r.scene.shot.id);
    if (last !== undefined && last !== r.scene.shot.id) changes.push(`${d.toFixed(2)}s ${last}→${r.scene.shot.id}`);
    last = r.scene.shot.id;
    lastFrame = r;
  }
  /** ★画面上の着順 = 決勝線を通った表示秒の早い順（同秒なら位置の前） */
  const order = [...crossSec.entries()]
    .sort((a, b) => (a[1] - b[1]) || (b[0] - a[0]))
    .map(([gate]) => gate);
  const finalPos = new Map(lastFrame.drawn.map((h) => [h.gate, h.s]));
  return { order, crossSec, shots, changes, finalPos, offsetOutside };
}

/**
 * ★**全券種を 1 枚ずつ**（★券種の取りこぼしを作らないため `TICKET_KINDS` から回します）。
 *   ⚠️ ★乱数を使いません。買い目は確定着順の上位から機械的に取ります（憲法4）。
 */
function ticketsFor(order) {
  const one = (kind, horses) => ({ selection: { kind, horses }, stake: 100, oddsAtPurchase: 3.5 });
  return [
    /** ★当たる側（上位から） */
    ...TICKET_KINDS.map((kind) => one(kind, order.slice(0, TICKET_ARITY[kind]))),
    /** ★★外れる側（下位から）。★当たり券だけだと「全部 350」で差が出ず、検査が鈍ります */
    ...TICKET_KINDS.map((kind) => one(kind, order.slice(-TICKET_ARITY[kind]))),
  ];
}

console.log('★演出 ON / OFF で、画面から読める結果が一致するかを測ります');
console.log(`★演出が効いてよい区間: 先頭の残り ${CLIMAX_ENTER_M}m 〜 ${CLIMAX_RELEASE_M}m\n`);

let allPass = true;
for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed });
  const clock = auditClock(built);
  const on = walk(built, clock, true);
  const off = walk(built, clock, false);

  /* ① 着順列 */
  const ok1 = JSON.stringify(on.order) === JSON.stringify(off.order);
  /** ★エンジンの確定着順とも一致すること（画面が記録と食い違っていない） */
  const engineOrder = built.result.order.map((row) => {
    const e = built.entrants.find((x) => x.horseId === row.horseId);
    return e?.gate;
  });
  const ok1b = JSON.stringify(on.order) === JSON.stringify(engineOrder);

  /* ② 決勝線を通る表示秒 */
  let maxSecDiff = 0;
  for (const [gate, s] of on.crossSec) maxSecDiff = Math.max(maxSecDiff, Math.abs(s - (off.crossSec.get(gate) ?? NaN)));
  const ok2 = maxSecDiff === 0;

  /* ③ 着差ラベル（エンジンの確定タイム差から組み直す） */
  const labelsOf = (order) => {
    const finishOf = new Map(built.boundaries.map((b) => [b.gate, b.finishSec]));
    let prev = 0;
    return order.map((gate, i) => {
      const gap = (finishOf.get(gate) ?? 0) - (finishOf.get(order[0]) ?? 0);
      const label = i === 0 ? '' : marginLabel(gap - prev);
      prev = gap;
      return label;
    });
  };
  const ok3 = JSON.stringify(labelsOf(on.order)) === JSON.stringify(labelsOf(off.order));

  /* ④ 払戻 */
  const outcomeOf = (order) => ({ order, fieldSize: built.FIELD });
  const payOf = (order) => ticketsFor(engineOrder).map((t) => settle(t, outcomeOf(order)).payout);
  const ok4 = JSON.stringify(payOf(on.order)) === JSON.stringify(payOf(off.order));

  /* ⑤ ゴール時の表示位置 */
  let maxPosDiff = 0;
  for (const [gate, s] of on.finalPos) maxPosDiff = Math.max(maxPosDiff, Math.abs(s - (off.finalPos.get(gate) ?? NaN)));
  const ok5 = maxPosDiff === 0;

  /* ⑥ カットの境目 */
  const ok6 = JSON.stringify(on.changes) === JSON.stringify(off.changes);
  let shotDiffFrames = 0;
  for (let i = 0; i < Math.min(on.shots.length, off.shots.length); i += 1) if (on.shots[i] !== off.shots[i]) shotDiffFrames += 1;

  /* ⑦ 区間の外でオフセット 0 */
  const ok7 = on.offsetOutside === 0;

  /**
   * ⑧ ★**30fps 収録と 60fps 表示で、同じ時刻の位置が一致する**（指示書 §7-2）
   *   ⚠️ ★「毎回同じ」だけでは足りません。★**コマ数が変わっても同じ**でなければ、
   *      ブラウザのフレームレートで攻防の順序が変わってしまいます。
   */
  let maxFpsDiff = 0, fpsAt = 0;
  {
    const total60 = clock.introSec + clock.warp.displaySec;
    for (let f = 0; f / FPS <= total60; f += 1) {
      const d = f / FPS;                                   // 30fps の各コマ
      const a = auditSceneAt(built, clock, d, VIEW, SCRIPT, { climax: true });
      /** ★60fps 側は同じ時刻を「2 倍のコマ番号」から作る（浮動小数の道筋が違う） */
      const d60 = (2 * f) / 60;
      const b = auditSceneAt(built, clock, d60, VIEW, SCRIPT, { climax: true });
      for (let i = 0; i < a.drawn.length; i += 1) {
        const diff = Math.abs(a.drawn[i].s - b.drawn[i].s);
        if (diff > maxFpsDiff) { maxFpsDiff = diff; fpsAt = d; }
      }
    }
  }
  const ok8 = maxFpsDiff === 0;

  const pass = ok1 && ok1b && ok2 && ok3 && ok4 && ok5 && ok6 && ok7 && ok8;
  if (!pass) allPass = false;

  console.log(`seed ${String(seed).padStart(3)}  着順 ${on.order.join('-')}`);
  console.log(`   ① 画面の着順列 ON=OFF                 ${ok1 ? '○' : '×'}   / エンジンの確定着順とも一致 ${ok1b ? '○' : '×'}`);
  console.log(`   ② 決勝線を通る表示秒                  ${ok2 ? '○ 完全一致' : `× 最大 ${maxSecDiff.toFixed(4)}s ずれ`}`);
  console.log(`   ③ 着差ラベル                          ${ok3 ? '○' : '×'}   ${labelsOf(on.order).slice(1).join(' ')}`);
  console.log(`   ④ 払戻（全券種 × 当/外 = 14 枚）      ${ok4 ? '○' : '×'}   ${payOf(on.order).join(' ')}`);
  console.log(`   ⑤ ゴール時の表示位置（全 ${built.FIELD} 頭）    ${ok5 ? '○ 完全一致' : `× 最大 ${maxPosDiff.toFixed(6)}m ずれ`}`);
  console.log(`   ⑥ ★カットの境目（編集の時刻）         ${ok6 ? '○ 完全一致' : '× ★ずれています'}   不一致コマ ${shotDiffFrames}`);
  console.log(`   ⑦ 区間外のオフセットが 0              ${ok7 ? '○' : `× ${on.offsetOutside} 件`}`);
  console.log(`   ⑧ 30fps と 60fps で同時刻の位置       ${ok8 ? '○ 完全一致' : `× 最大 ${maxFpsDiff.toFixed(9)}m（${fpsAt.toFixed(2)}s）`}`);
  console.log(`      （カット: ${on.changes.join(' / ')}）`);
  console.log('');
}
console.log(allPass ? '★①〜⑧ はすべての seed で成立' : '★★成立していない seed があります');
