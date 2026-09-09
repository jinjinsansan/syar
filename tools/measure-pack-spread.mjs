/**
 * ★**馬群がどれだけ縦に伸びているか**を測る（★2026-09-09）
 *
 * ⚠️ ★**この道具が生まれたきっかけは、開発側の誤読でした**（★2026-09-09・撤回済み）。
 *    ★`shot-race-at.mjs` の「横広がり 6.6m」を ★**馬群の前後長だと読み違え**、
 *    ★「設計の半分以下に縮んでいる」と ★誤った照会を出しました。
 *    ★正しい前後長は ★**27.4m（617m 地点）／ 25.7m（920m 地点）**で、★設計どおりです。
 *    ★`REPORT_P4_PACK_SPREAD_RETRACTION_20260909.md` を参照。
 *
 * 【★それでも残す理由】
 *   ★「設計値」と「収束の重みを掛けた後」を並べて見られる道具は、★他にありません。
 *   ★ただし ★**画面の実測は `shot-race-at.mjs` の「★前後長」列**を見ること。
 *   ★この道具は ★**設計値の計算**であって、★画面の実測ではありません。
 *
 * 【★どこで縮むか】
 *   ★`replay-model.ts` :219 ★`truth + a * (form - truth)`
 *     ★`form`  … 隊列が言う位置（★`packSpreadM` は 24〜50m に散らす設計）
 *     ★`truth` … エンジンが言う真の位置（★ほぼ同着なので密集）
 *     ★`a`     … `convergeAt`（収束の重み。★ゴールで必ず 0＝着順を守るため）
 *   → ★`a` が小さいと隊列が効かず、★真の位置＝密集になります。
 *
 * ⚠️ ★**この値を勝手に変えないこと。** ★Q-P4-38（2026-08-15 裁定）で
 *    ★「道中の順位＝最終着順」という漏洩を塞ぐために設計されています。
 *    ★この道具は ★**測るだけ**です。
 *
 * ★実行: npx tsx tools/measure-pack-spread.mjs
 */
import { packSpreadM, convergeAt } from '@star/render';

const DIST = 1600;
console.log('# ★馬群の広がり（★設計値と、実際に効く量）');
console.log();
console.log('  走破位置   ★隊列の設計   ★収束の重み a   ★実際に効く広がり（設計 × a）');
for (let s = 0; s <= DIST; s += 100) {
  const left = DIST - s;
  const design = packSpreadM(left, 'middle', s);
  const a = convergeAt(left);
  console.log(`  ${String(s).padStart(6)}m   ${design.toFixed(1).padStart(7)}m`
    + `   ${a.toFixed(2).padStart(9)}   ${(design * a).toFixed(1).padStart(12)}m`);
}
console.log();
console.log('⚠️ ★これは ★**設計値の計算**です。★画面の実測ではありません。');
console.log('   ★画面の実測は `npx tsx tools/shot-race-at.mjs` の ★**「前後長」列**を見ること。');
console.log('   ★実測（2026-09-09）: ★617m で 27.4m ／ 920m で 25.7m ／ 1401m で 43.3m。★設計どおりです。');
