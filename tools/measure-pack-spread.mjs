/**
 * ★**馬群がどれだけ縦に伸びているか**を測る（★2026-09-09）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★コーナーが不自然」。★実測すると、★12 頭が ★**6.5〜8.1m** に
 *   ★詰まっていました（★1600m のレース中ずっと）。★実際の競馬では数十 m に伸びます。
 *   ★コーナーで前後差が出ないので、★**横一列に見えます**。
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
console.log('⚠️ ★実測（★画面上・`tools/shot-race-at.mjs`）は ★6.5〜8.1m でした。');
console.log('   ★「実際に効く広がり」がそれより大きい場合、★別の所でも縮んでいます。');
