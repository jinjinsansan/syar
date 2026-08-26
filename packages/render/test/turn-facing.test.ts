/**
 * ★**コーナーで馬が向きを変えながら曲がって見えること**（オーナー指摘③・2026-08-26）
 *
 * 【何が起きていたか】
 *   オーナー評「**第4コーナーの馬の曲がり方が斜め向いたまま曲がっている**」。
 *
 *   実測（seed 42・`tools/audit-corner-turn.mjs`）: `fourth-corner-front` は 3.30 秒で
 *   向きが 141.6° → 179.9° と動くのに、★**素材の入替 0 回**・横の短縮も
 *   ★**99 コマ中 67 コマ（67.7%）で倍率 1.000** ＝ 絵が 1 ミリも変わっていませんでした。
 *
 * 【★短縮では直らなかった理由】
 *   viewDeg 141° の正しい見かけ幅は「真横の 82%」です。そこで**斜め前の素材**
 *   （幅÷高さ 0.77）を出していたので、★**正しい幅の 1.8 分の 1**でした。
 *   縮める向きの補正では**逆**なので、効かせるほど悪くなります。
 *   → `broadcastV2TurnFacing` が**素材の選び分け**で向きを作ります。
 */
import { describe, it, expect } from 'vitest';
import {
  broadcastV2TurnFacing,
  broadcastV2ShotById,
  TURN_FACING_SWAP_ALPHA_DEG,
  TURN_SIDE_SQUEEZE_MIN,
} from '../src/broadcast-v2.js';

/** ★素材の外接矩形の実測（幅÷高さ）。`node` で測った値 */
const ASPECT_SIDE = 1.71;
const ASPECT_FRONT = 0.77;

/** その向きで画面に出る「馬の見かけの横幅」（描画高さ 1 のときの値） */
function apparentWidth(viewDeg: number): number {
  const f = broadcastV2TurnFacing(viewDeg);
  return (f.useFront ? ASPECT_FRONT : ASPECT_SIDE) * f.squeezeX;
}

describe('★コーナーで向きを作る（turnFacing）', () => {
  it('★★4 角のカット全域で、絵が細くなり続ける（＝曲がって見える）', () => {
    /**
     * ★実測の範囲（141.6° 〜 179.9°）を 0.5° 刻みで見ます。
     * ★R-14: 直っていない状態（斜め前素材のまま・短縮が 168° からしか効かない）なら、
     *   141〜168° が横ばいになるのでこの検査は落ちます。
     */
    let prev = Infinity;
    for (let deg = 141; deg <= 180; deg += 0.5) {
      const w = apparentWidth(deg);
      expect(w, `${deg}° で細くなっていません`).toBeLessThanOrEqual(prev + 1e-9);
      prev = w;
    }
    /** ★端から端で十分に変わること（横ばいでない） */
    expect(apparentWidth(141) / apparentWidth(179.9)).toBeGreaterThan(2);
  });

  it('★★141° では「真横に近い絵」を出す（正面の絵を出さない）', () => {
    const f = broadcastV2TurnFacing(141);
    expect(f.useFront, '141° で正面の素材を出しています').toBe(false);
    /** ★幾何の答え: w(39°)/w(90°) = 0.824 */
    expect(f.squeezeX).toBeCloseTo(0.824, 2);
  });

  it('★★素材の入替点で、見かけの幅が跳ばない', () => {
    /**
     * ★入替点は `TURN_FACING_SWAP_ALPHA_DEG`（viewDeg = 180 − 4 = 176°）。
     *   幾何どうしの比 w(90°)/w(12°) = 2.210 と
     *   素材どうしの比 1.71 / 0.77 = 2.221 が 0.5% で一致するので、幅は連続になります。
     */
    const cross = 180 - TURN_FACING_SWAP_ALPHA_DEG;
    const before = apparentWidth(cross - 0.01);
    const after = apparentWidth(cross + 0.01);
    expect(broadcastV2TurnFacing(cross - 0.01).useFront).toBe(false);
    expect(broadcastV2TurnFacing(cross + 0.01).useFront).toBe(true);
    /** ★1% 以内なら、1 コマの跳びとしては見えません */
    expect(Math.abs(after - before) / before, '入替点で幅が跳んでいます').toBeLessThan(0.01);
  });

  it('★★コマ間で跳ばない（30fps・実測の最大 1.89°/コマ の 2 倍で見る）', () => {
    for (let deg = 120; deg <= 180 - 4; deg += 0.25) {
      const a = apparentWidth(deg);
      const b = apparentWidth(deg + 4);
      expect(Math.abs(b - a) / a, `${deg}° 付近で跳んでいます`).toBeLessThan(0.25);
    }
  });

  it('★★下限を割らない・上限を超えない', () => {
    for (let deg = 0; deg <= 180; deg += 0.5) {
      const f = broadcastV2TurnFacing(deg);
      expect(f.squeezeX, `${deg}°`).toBeGreaterThanOrEqual(TURN_SIDE_SQUEEZE_MIN - 1e-9);
      expect(f.squeezeX, `${deg}°`).toBeLessThanOrEqual(1);
    }
  });

  it('★★非有限な向きでも壊れない', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const f = broadcastV2TurnFacing(bad);
      expect(f.squeezeX).toBe(1);
    }
  });

  /**
   * ★**承認済みのカットを巻き込んでいないこと**（いちばん大事な対照）
   *
   *   ⚠️ `turnFacing` を全ショットに掛けると、`first-corner-front`（158°）が
   *      **真横素材に変わってしまいます**（158° < 168°）。2026-08-21 の判定で
   *      「前から見る 4 カットは合格」と出ているカットです。★**触ってはいけません。**
   */
  it('★★★どのショットにも turnFacing を付けない（2026-08-26・不合格）', () => {
    /**
     * ★**この方式はオーナー判定で不合格になりました**（指示書 §3-1）。
     *   ・横縮小は回転ではない
     *   ・素材の入替は**1 コマで絵の中身が跳ぶ**（実画面で確認）
     *
     *   ★向きは**編集**で合わせています（4 角のカット窓とカメラの据え位置）。
     *   ⚠️ ★関数と上の検査は**記録として**残していますが、★**描画からは呼びません。**
     *      ここが「どこにも付いていない」ことを固定して、うっかり復活するのを止めます。
     */
    for (const id of ['fourth-corner-front', 'start-front', 'first-corner-front', 'side-drive',
      'homestretch-side', 'homestretch-front', 'finish-line'] as const) {
      expect(broadcastV2ShotById(id).turnFacing, `${id} に turnFacing が付いています`).toBeUndefined();
    }
  });
});
