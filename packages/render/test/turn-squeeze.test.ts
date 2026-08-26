/**
 * ★**こちらへ向き直った分だけ馬を横に縮める**（遠近の短縮）
 *
 * 【なぜ要るか（2026-08-26・オーナー評）】
 *   「**斜め向いたまま曲がる**」。馬の絵は板なので、向きは 3 段の素材でしか変わらず、
 *   ★**真正面の素材はありません**。4 角の固定カメラでは、向きの角度が
 *   **179.4°（＝カメラへ真っすぐ）**になる瞬間があります（実測・seed 42・19.20s）。
 *
 * 【★カメラでは直さないと決めた理由】
 *   一度 4 角を追従カメラにして向きを一定にしましたが、
 *   ★**奥から手前へ向かってくる迫力が丸ごと消え**、オーナー判定で差し戻しです。
 *   ★**カメラは動かさない。絵の側で向きを作る。**
 */
import { describe, it, expect } from 'vitest';
import { broadcastV2TurnSqueezeX, TURN_SQUEEZE_MIN, TURN_ASSET_ALPHA_DEG } from '../src/broadcast-v2.js';

describe('★向きに応じた横の短縮', () => {
  it('★★真横のカットは 1.0（直線の画は変わらない）', () => {
    /** ★直線は 86〜88°、発走は 168°。後者は素材の向きに近いのでほぼ 1.0 */
    expect(broadcastV2TurnSqueezeX(87)).toBe(1);
    expect(broadcastV2TurnSqueezeX(120)).toBe(1);
    /** ★発走（`start-front` 168°）・1 角（158°）は**変えない**。指摘の無いカットを巻き込まない */
    expect(broadcastV2TurnSqueezeX(168)).toBe(1);
    expect(broadcastV2TurnSqueezeX(158)).toBe(1);
    expect(broadcastV2TurnSqueezeX(180 - TURN_ASSET_ALPHA_DEG)).toBe(1);
  });

  it('★★真正面に近づくほど細くなる（単調）', () => {
    const degs = [164, 168, 172, 176, 179, 180];
    const vals = degs.map(broadcastV2TurnSqueezeX);
    for (let i = 1; i < vals.length; i += 1) {
      expect(vals[i]!, `${degs[i]}° で細くなっていません`).toBeLessThanOrEqual(vals[i - 1]!);
    }
    expect(vals[0]).toBe(1);
    /** ★真正面（180°）でも下限を割らないし、十分に細い */
    expect(vals[vals.length - 1]).toBeGreaterThanOrEqual(TURN_SQUEEZE_MIN);
    expect(vals[vals.length - 1]).toBeLessThan(0.6);
  });

  it('★★反転が起きる点（179.4°）では十分に細い — 裏返りを目立たせない', () => {
    /**
     * ★左右反転は `forwardDx` の符号が変わる瞬間、つまり**真正面の瞬間**に起きます
     *   （実測・seed 42 / 49 / 91 / 140 / 217 / 333 の 6 本とも 1 回）。
     *   そこで絵がいちばん細いなら、反転しても見え方の差は小さくなります。
     * ★R-14: この短縮を入れなければ 1.0 のままなので、この検査は落ちます。
     */
    expect(broadcastV2TurnSqueezeX(179.4)).toBeLessThan(0.6);
  });

  it('★★下限を割らない（棒に見えない）・上限を超えない（太らせない）', () => {
    for (let deg = 0; deg <= 180; deg += 0.5) {
      const v = broadcastV2TurnSqueezeX(deg);
      expect(v, `${deg}°`).toBeGreaterThanOrEqual(TURN_SQUEEZE_MIN);
      expect(v, `${deg}°`).toBeLessThanOrEqual(1);
    }
  });

  it('★★コマ間で跳ばない（連続）', () => {
    /**
     * ★この案件の基準は「**カットの途中で跳ぶのは不具合**」です。
     *   ★ 4 角の向きの角度は **1 コマ最大 1.89°** 動きます（実測・`audit-corner-turn.mjs`）。
     *   その幅で、横倍率の変化が目につく跳びにならないことを見ます。
     */
    const STEP_DEG = 1.89;
    let worst = 0;
    for (let deg = 120; deg <= 180 - STEP_DEG; deg += 0.05) {
      worst = Math.max(worst, Math.abs(broadcastV2TurnSqueezeX(deg + STEP_DEG) - broadcastV2TurnSqueezeX(deg)));
    }
    expect(worst, `1 コマ相当で ${worst.toFixed(3)} 変わります`).toBeLessThan(0.08);
  });

  it('★壊れた入力では 1.0（描画を止めない）', () => {
    expect(broadcastV2TurnSqueezeX(Number.NaN)).toBe(1);
    expect(broadcastV2TurnSqueezeX(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
