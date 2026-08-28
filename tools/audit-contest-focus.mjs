/**
 * ★**競り合いが画面に映っているか / 注視点が跳んでいないか**（読取専用）
 *
 *   ⚠️ 場面解決は実画面と同じ `auditSceneAt` を通します（R-30）。
 *   ⚠️ 製品コードは変更しません。時刻も乱数も使いません（憲法4）。
 */
import { DEFAULT_RACE_BALANCE } from '@star/race-engine';
import { DEFAULT_RACE_SCRIPT, DEMO_CONTEST_GAMMA, CLIMAX_LEAD_COUNT, cameraBasis, posOf, project } from '@star/render';
import { buildAuditRace, auditClock, auditSceneAt } from './lib/race-audit-build.mjs';

const W = 1280, H = 720, FPS = 30;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = String(arg('seeds', '42,14,332,474')).split(',').map(Number);
const SCRIPT = arg('script', DEFAULT_RACE_SCRIPT);
/**
 * ★**着差の見せ方（γ）を差し替えて測る**（`--gamma 1.3`）。
 *
 *   ★`REVIEW_P4_FINISH_CONTEST_VERDICT_20260825.md` が開いた自由度です。
 *   ★写像はスコア差について単調なので**着順は動きません**。総差も定義から不変で、
 *     V-4/V-5/V-6・払戻・人気には**定義上触れません**（正典 D-064）。
 *   ⚠️ ★既定は 1.0 ＝ 本番の既定（`DEFAULT_RACE_BALANCE`）そのままです。
 *      ★この道具は**本番の既定を書き換えません。** 測る間だけ差し替えます。
 */
const GAMMA = Number(arg('gamma', DEMO_CONTEST_GAMMA));
if (!(GAMMA > 0)) throw new Error(`★--gamma が正の数ではありません: ${GAMMA}`);
  /**
   * ⚠️ ★**`undefined` を渡してはいけません**（2026-08-28）。
   *    ★`buildAuditRace` の既定は**画面の既定（γ=1.3）**に変わりました（R-31）。
   *    ★`undefined` だとそちらへ落ち、★**印字した γ と実際に測った γ が食い違います。**
   *    ★実際にこの道具が「γ=1（本番の既定）」と印字しながら 1.3 で測っていました。
   */
const BALANCE = GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA
  ? DEFAULT_RACE_BALANCE
  : { ...DEFAULT_RACE_BALANCE, TIME_GAP_SHAPE_GAMMA: GAMMA };

/** ★R-8: 何で測ったかを毎回出す。★`BALANCE` の有無ではなく**値そのもの**から出す */
console.log(`台本=${SCRIPT}  γ=${GAMMA.toFixed(2)}`
  + `${GAMMA === DEFAULT_RACE_BALANCE.TIME_GAP_SHAPE_GAMMA ? '（★エンジンの既定）' : ''}`
  + `  演出=なし（馬は動かしていません）
`);

/** ★０ コマだった seed。★1 つでもあれば異常終了する（下） */
const emptySeeds = [];
for (const seed of SEEDS) {
  const built = buildAuditRace({ seed, balance: BALANCE });
  const clock = auditClock(built);
  const place = new Map(built.result.order.map((row, i) => {
    const g = built.entrants.find((e) => e.horseId === row.horseId)?.gate;
    return [g, row.finishPosition ?? i + 1];
  }));
  const top5 = [...place.entries()].filter(([, p]) => p <= CLIMAX_LEAD_COUNT).map(([g]) => g);
  /**
   * ★**跳びは「馬の動きとの差」で測ります。**
   *   ⚠️ ★注視点の 1 コマ移動量そのものを見てはいけません。時間圧縮が効いている区間では
   *      ★**馬自身が 1 コマ 2.7m 進みます**。実測でそれを「跳び 2.99m」と誤読しました（R-21）。
   */
  let prev = null, prevLead = null, maxJump = 0, jumpAt = 0, maxAbs = 0;
  let sec2 = 0, sec3 = 0, sec4 = 0, frames = 0, contestFrames = 0, maxOnAll = 0, sumOnAll = 0;
  const total = clock.introSec + clock.warp.displaySec;
  for (let f = 0; f <= Math.ceil(total * FPS); f++) {
    const d = f / FPS;
    if (d < clock.introSec) continue;
    const r = auditSceneAt(built, clock, d, { width: W, height: H }, SCRIPT, { climax: false });
    if (r.scene.shot.id !== 'straight-contest') { prev = null; continue; }
    frames++;
    const lead = Math.max(...r.drawn.map((h) => h.s));
    if (prev !== null && prevLead !== null) {
      const j = Math.abs((r.scene.focusS - prev) - (lead - prevLead));
      if (j > maxJump) { maxJump = j; jumpAt = d; }
      const a = Math.abs(r.scene.focusS - prev);
      if (a > maxAbs) maxAbs = a;
    }
    prev = r.scene.focusS;
    prevLead = lead;
    const basis = cameraBasis(r.scene.camera);
    let on = 0;
    /**
     * ★**描かれている全馬**のうち画面内の頭数（着外も含む）。
     *   ⚠️ ★以前はここを「上位 5 頭のうち」しか数えておらず、
     *      ★**着外の馬が同じ画面に入って 10 頭が重なる**のを見落としていました
     *      （オーナー指摘・seed 99 残り218m）。
     */
    let onAll = 0;
    for (const h of r.scene.visibleHorses) {
      const p = posOf(built.course, h.s, h.w);
      const pr = project(r.scene.camera, basis, { x: p.x, y: p.y, z: 0 });
      if (pr.depth > 0 && pr.x >= 0 && pr.x <= W) {
        onAll++;
        if (top5.includes(h.gate)) on++;
      }
    }
    if (onAll > maxOnAll) maxOnAll = onAll;
    sumOnAll += onAll;
    if (on >= 2) { sec2 += 1 / FPS; contestFrames++; }
    if (on >= 3) sec3 += 1 / FPS;
    if (on >= 4) sec4 += 1 / FPS;
  }
  /**
   * ★**1 コマも出ていないのは「異常なし」ではありません**（R-3 / R-21）。
   *
   * ⚠️ ★以前はここを素通りしており、`frames = 0` のとき
   *    ★**跳び 0.00m/コマ・割合 NaN%** と出て、★**「異常なし」に見えて**いました。
   *    ★台本にこのカットが無ければ（v5 など）、全 seed がそうなります。
   * ★**測れなかったことを、測った結果として扱わない。**
   */
  if (frames === 0) {
    emptySeeds.push(seed);
    console.log(`seed ${String(seed).padStart(3)}  ★★このカット（straight-contest）が 1 コマも出ていません`);
    console.log(`   ★台本 ${SCRIPT} にこのカットがあるか確かめてください（v5 には在りません）。`);
    console.log('   ★数字は出しません。0.00 や NaN% を「異常なし」と読ませないためです。');
    continue;
  }
  const cutSec = frames / FPS;
  console.log(`seed ${String(seed).padStart(3)}  競り合いカット 計 ${cutSec.toFixed(1)}秒`);
  console.log(`   ★画面に描かれる頭数（着外も含む）: 最大 ${maxOnAll} 頭 / 平均 ${(sumOnAll / Math.max(1, frames)).toFixed(1)} 頭`);
  console.log(`   主役が 2 頭以上 ${sec2.toFixed(1)}秒 (${(sec2 / cutSec * 100).toFixed(0)}%)` +
    ` / 3 頭以上 ${sec3.toFixed(1)}秒 / 4 頭以上 ${sec4.toFixed(1)}秒`);
  console.log(`   ★注視点が馬から離れる最大量 ${maxJump.toFixed(2)}m/コマ（${jumpAt.toFixed(2)}s）` +
    `  ／ 注視点の 1 コマ移動そのものは最大 ${maxAbs.toFixed(2)}m（馬もほぼ同じだけ進みます）`);
}

/* ── ★0 コマだった seed があれば異常終了する ─────────────── */
if (emptySeeds.length > 0) {
  console.log(`
★★${emptySeeds.length} / ${SEEDS.length} seed で straight-contest が 1 コマも出ていません`);
  console.log(`   seed: ${emptySeeds.join(', ')}`);
  console.log('   ★これは「異常なし」ではありません。終了コードを 1 にします（R-3 / R-21）。');
  process.exitCode = 1;
}
