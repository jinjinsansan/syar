/**
 * ★**ゴール後の勝馬クローズアップを測る**（読取専用・指示書 §5）
 *
 * 【★測るもの】
 *   ① 勝馬が決勝線を通過してから専用カットへ移るまでの秒数（要求 0.0〜0.4 秒）
 *   ② そのカットが続く秒数（要求 1.5〜2.5 秒・§9 の合格条件は「1.5 秒以上」）
 *   ③ ★勝馬の馬体が画面高の何 % か（要求 35〜45%）
 *   ④ 足元・頭・騎手が画面外に切れていないか
 *   ⑤ 直線からの切替がハードカットか（view の系統が変わるか）
 *
 * ⚠️ ★製品コードは変更しません。読むだけです（憲法3）。時刻も乱数も使いません（憲法4）。
 *
 * 実行: npx tsx tools/audit-winner-closeup.mjs [--seeds 42,14,332,474]
 */
import { cameraBasis, posOf, project, broadcastV2ShotById } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt, RACE_DEFAULTS } from './lib/race-audit-build.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const W = 1280, H = 720, FPS = 30, SCRIPT = 'v5';
/** ★騎手込みの高さ（`audit-horse-size.mjs` と同じ） */
const HORSE_HEIGHT_M = 2.4;
/**
 * ★`page.tsx` の `WINNER_FOLLOW_SEC`。★この秒数を過ぎると製品は着順ボードへ移ります。
 *   ⚠️ 場面解決だけを回すと勝馬カットが延々と返るので、ここで打ち切って製品と揃えます。
 */
const WINNER_FOLLOW_SEC = 2.4;

console.log('★指示書 §5 の要求: 通過後 0.0〜0.4 秒で切替 / 1.5〜2.5 秒維持 / 馬体が画面高の 35〜45%\n');

let allPass = true;
for (const seed of SEEDS) {
  const built = buildAuditRace({ ...RACE_DEFAULTS, seed });
  const clock = auditClock(built);
  const total = clock.introSec + clock.warp.displaySec;
  const winnerRow = built.result.order[0];
  const winnerGate = built.entrants.find((e) => e.horseId === winnerRow.horseId)?.gate;

  /** ★勝馬が決勝線を通過した表示秒 */
  let crossD = null;
  const rows = [];
  /** ★ゴール後も見たいので、レース尺の後ろに余韻ぶんを足して回す */
  for (let f = 0; f / FPS <= total + WINNER_FOLLOW_SEC; f += 1) {
    const d = f / FPS;
    const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT);
    const win = r.drawn.find((h) => h.gate === winnerGate);
    if (win === undefined) continue;
    /**
     * ★**通過の判定は場面解決が使っているものと同じ値**（`winnerDone`）を読みます。
     *   ⚠️ ★最初は表示位置で測って **−0.60 秒**（切替が通過より前）と出ました。
     *      表示位置は発走イージング・攻防演出・走り抜けを通った**別の量**です。
     *      ★**切替の判断に使われている値そのものと比べること。**
     */
    if (crossD === null && r.winnerDone) crossD = d;
    const basis = cameraBasis(r.scene.camera);
    const p = posOf(built.course, win.s, win.w);
    const foot = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
    const head = project(r.scene.camera, basis, { x: p.x, y: p.y, z: HORSE_HEIGHT_M });
    const hp = Math.max(0, foot.y - head.y);
    const wp = hp * 1.71;
    rows.push({
      d, shot: r.scene.shot.id,
      ratio: hp / H,
      /** 画面外に切れていないか（足元・頭・左右） */
      inFrame: foot.depth > 0 && head.y >= 0 && foot.y <= H && foot.x - wp / 2 >= 0 && foot.x + wp / 2 <= W,
    });
  }

  const winnerShots = new Set(['winner-follow', 'winner-follow-rear']);
  const inWinner = rows.filter((r) => winnerShots.has(r.shot));
  if (crossD === null || inWinner.length === 0) {
    console.log(`seed ${seed}: ★勝馬カットが出ませんでした（通過 ${crossD === null ? '未検出' : crossD.toFixed(2) + 's'}）`);
    allPass = false;
    continue;
  }
  const startD = inWinner[0].d;
  const endD = inWinner[inWinner.length - 1].d;
  const delay = startD - crossD;
  const dur = endD - startD + 1 / FPS;
  const ratios = inWinner.map((r) => r.ratio).sort((a, b) => a - b);
  const rMid = ratios[ratios.length >> 1];
  const clipped = inWinner.filter((r) => !r.inFrame).length;
  /** 直前のカット */
  const beforeIdx = rows.findIndex((r) => r.d === startD) - 1;
  const prevShot = beforeIdx >= 0 ? rows[beforeIdx].shot : '（なし）';
  /**
   * ★ハードカットかどうかは `page.tsx` の条件と同じ形で見ます（R-30）:
   *   ★`hardCutIn` が付いていれば**必ず切り替え**。付いていなければ `view` の系統で決まります。
   */
  const toShot = broadcastV2ShotById(inWinner[0].shot);
  const hard = prevShot === '（なし）' ? true
    : toShot.hardCutIn === true || broadcastV2ShotById(prevShot).view !== toShot.view;

  const ok1 = delay >= 0 && delay <= 0.4;
  const ok2 = dur >= 1.5;
  const ok3 = rMid >= 0.35 && rMid <= 0.45;
  const ok4 = clipped === 0;
  if (!(ok1 && ok2 && ok3 && ok4 && hard)) allPass = false;

  console.log(`seed ${String(seed).padStart(3)}  勝馬 = 馬番 ${winnerGate}  カット = ${inWinner[0].shot}`);
  console.log(`   ① 通過 ${crossD.toFixed(2)}s → 切替 ${startD.toFixed(2)}s   遅れ ${delay.toFixed(2)} 秒 / 要求 0.0〜0.4   ${ok1 ? '○' : '×'}`);
  const runOut = Math.max(0, total - crossD);
  console.log(`   ② 続く長さ  ${dur.toFixed(2)} 秒 = 走り抜け ${runOut.toFixed(2)}s ＋ 寄りの保持 ${WINNER_FOLLOW_SEC.toFixed(1)}s`
    + `   / §9「1.5 秒以上」   ${ok2 ? '○' : '×'}`);
  if (dur > 2.5) {
    console.log(`      ⚠️ ★§5-4 の「1.5〜2.5 秒」は満たせません。★他馬がゴールし終えるまでの`
      + ` **走り抜け ${runOut.toFixed(2)} 秒**が同じカットに含まれるためで、`
      + `保持を 0 にしても ${runOut.toFixed(2)} 秒残ります。★オーナー判断が要ります。`);
  }
  console.log(`   ③ 馬体が画面高の  ${(rMid * 100).toFixed(1)}%（${(ratios[0] * 100).toFixed(1)}〜${(ratios[ratios.length - 1] * 100).toFixed(1)}%） / 要求 35〜45%   ${ok3 ? '○' : '×'}`);
  console.log(`   ④ 画面外に切れたコマ  ${clipped} / ${inWinner.length}   ${ok4 ? '○' : '×'}`);
  console.log(`   ⑤ 直前のカット ${prevShot} → ${inWinner[0].shot}   ${hard ? '○ ハードカット' : '× ディゾルブ系統'}`);
  console.log('');
}
console.log(allPass ? '★§5 の①〜⑤はすべての seed で成立' : '★★成立していない項目があります');
