/**
 * ★**鞍布の生地の陰を塗る／騎手の肌は塗らない**（★2026-09-15・オーナー指示「治してください」）
 *
 * 【★何が起きていたか】
 *   ★鞍布（ゼッケンの布）の縁が、★枠色と白のまだらに残っていました。
 *   ★鞍布の生地の陰は赤みがかったクリーム色の灰で、★R>G>B なので ★肌と判定され、★塗られていませんでした。
 *   ★実測（★side-v8 の 2 コマ・鞍布の窓）: ★肌と判定されて塗らなかった明るい画素 ★4,521。
 *
 * 【★守るもの】
 *   ★① 鞍布だけの窓（`checkSkin: false`）では、★その色を塗る
 *   ★② 上着・兜の窓（★既定）では、★従来どおり肌として塗らない（★首すじ・手を白く潰さない）
 *   ★③ 鞍布の窓でも、★彩度の高い馬の体（鹿毛）は塗らない（★肌の判定を外しても馬体は守られる）
 */
import { describe, it, expect } from 'vitest';
import { silksPaintable } from '../src/silks-pixel.js';
import { isSkinTone } from '../src/silks-skin.js';

/** ★side-v8 の鞍布の窓で、★肌と判定されていた実測の色 */
const SADDLE_SHADES: readonly (readonly [number, number, number])[] = [
  [170, 155, 140], [166, 151, 139], [180, 162, 150], [202, 188, 179], [153, 140, 129], [212, 200, 194],
];
/** ★同じ窓で ★彩度で除外されていた実測の色（★馬の体） */
const HORSE_BODY: readonly (readonly [number, number, number])[] = [
  [153, 82, 38], [201, 125, 59], [213, 132, 65], [162, 94, 40],
];

describe('★鞍布の生地の陰と、騎手の肌', () => {
  it('★前提: 実測の鞍布の陰は、肌の判定に当たる色（★だから塗られていなかった）', () => {
    for (const [r, g, b] of SADDLE_SHADES) expect(isSkinTone(r, g, b), `${r},${g},${b}`).toBe(true);
  });

  it('★★① 鞍布だけの窓では塗る', () => {
    for (const [r, g, b] of SADDLE_SHADES) {
      expect(silksPaintable(r, g, b, 255, false, false), `${r},${g},${b}`).toBe(true);
    }
  });

  it('★★② 上着・兜の窓（★既定）では、従来どおり肌として塗らない', () => {
    for (const [r, g, b] of SADDLE_SHADES) {
      expect(silksPaintable(r, g, b, 255, false), `${r},${g},${b}`).toBe(false);
      expect(silksPaintable(r, g, b, 255, false, true), `${r},${g},${b}`).toBe(false);
    }
  });

  it('★★③ 鞍布の窓でも、馬の体は塗らない', () => {
    for (const [r, g, b] of HORSE_BODY) {
      expect(silksPaintable(r, g, b, 255, false, false), `${r},${g},${b}`).toBe(false);
    }
  });
});
