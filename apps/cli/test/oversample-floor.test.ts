/**
 * ★**`bandSize` の床と、測定の素性の刻印**（★**VP-5 / VP-7 / VP-8**・2026-09-19）
 *
 * 【★VP-5 で分かったこと】
 *   ```
 *   bandSize = min(n, max(fieldSize × OVERSAMPLE_RATIO, round(n × classBand)))
 *   ```
 *   ★**小さい集団では左の項（床）が勝ちます。** ★そのとき帯は `classBand`（6%）ではありません。
 *   ✔ ★実測: ★合成 400 頭 → 帯 **39 頭 ＝ 9.8%** ／ ★配備 3,000 頭 → **180 頭 ＝ 6.0%**。
 *   ✔ ★レースの中の素質の幅は **109.0 対 91.0**（★合成が **19.8% 広い**）。
 *   → ★V-4 は帯が広いほど上がる（D-018）ので、★**合成のゲートは甘く出ます**（★実測 +0.88pp）。
 *
 * 【★VP-8】★「日付・旗・母集団を併記する」という**手順は忘れられます**。
 *   ★私は `measurement.ts` の 32.32% を、旗も母集団も違うのに引き算しかけました。
 *   → ★**`verify-race` の出力そのものに刻みます。**
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CLASS_BAND, FIELD_SIZE, OVERSAMPLE_RATIO, oversampleFloorPoolSize,
} from '../src/race-field.js';
import { POOL_MARES } from '../src/measurement.js';

describe('VP-5 OVERSAMPLE の床', () => {
  it('★境目は 3 つの定数から導かれる（★数を別に置いていない・D-052）', () => {
    const meanField = (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2;
    expect(oversampleFloorPoolSize()).toBe(Math.ceil((meanField * OVERSAMPLE_RATIO) / DEFAULT_CLASS_BAND));
    // ✔ ★いまの定数では 650 頭
    expect(oversampleFloorPoolSize()).toBe(650);
  });

  it('★`classBand` を動かすと境目も動く（★定数を返していないこと・★対照）', () => {
    expect(oversampleFloorPoolSize(0.12)).toBe(325);
    expect(oversampleFloorPoolSize(0.03)).toBe(1300);
    expect(oversampleFloorPoolSize(0.12)).not.toBe(oversampleFloorPoolSize());
  });

  it('★境目のちょうど上下で、どちらの項が勝つかが変わる（R-2）', () => {
    const n = oversampleFloorPoolSize();
    const meanField = (FIELD_SIZE.MIN + FIELD_SIZE.MAX) / 2;
    const floor = meanField * OVERSAMPLE_RATIO;
    // ★境目ちょうど: classBand の項が床に追いつく
    expect(Math.round(n * DEFAULT_CLASS_BAND)).toBeGreaterThanOrEqual(floor);
    // ★1 つ下: 床が勝つ
    expect(Math.round((n - 20) * DEFAULT_CLASS_BAND)).toBeLessThan(floor);
  });

  it('🔴 ★V ゲートの既定の母集団は、境目の**下**にいる（★VP-7 で直す対象）', () => {
    /**
     * ⚠️ ★これは ★**いま赤くしたい検査ではありません**。★事実を固定するものです。
     *    ★`POOL_MARES` を 650 以上にしたら、★この検査を**逆向きに書き換えて**ください
     *    （★そのとき合成集団も配備と同じ regime に入ります）。
     */
    expect(POOL_MARES).toBeLessThan(oversampleFloorPoolSize());
    expect(POOL_MARES).toBe(400);
  });
});

describe('VP-8 測定の素性を出力に刻む', () => {
  const src = readFileSync(path.resolve(__dirname, '..', 'src/verify-race.ts'), 'utf8');

  it('★走査が空でない（R-21）', () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain('function provenance()');
  });

  it('★日付・旗・母集団・標本の 4 つを出す', () => {
    for (const label of ['★日付', '★旗', '★母集団', '★標本']) {
      expect(src, `${label} が出力に無い`).toContain(label);
    }
  });

  it('🔴 ★母集団は**ファイルの中身**で指す（★名前だけだと使い回しに気づけない）', () => {
    expect(src).toMatch(/createHash\('sha256'\)/);
    expect(src).toMatch(/sha256:\$\{digest\}/);
  });

  it('★床の regime なら警告を出す', () => {
    expect(src).toContain('床の regime');
    expect(src).toMatch(/oversampleFloorPoolSize\(\)/);
  });

  it('★旗は「立っているもの」を名前で出す（★既定なら「旗なし」と言う）', () => {
    for (const f of ['--b6-wired', '--real-ability', '--legacy-conditions']) {
      expect(src, `${f} が素性に出ていない`).toContain(f);
    }
    expect(src).toContain('（既定・旗なし）');
  });
});
