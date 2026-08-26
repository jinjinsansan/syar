/**
 * ★**最後の直線の攻防（表示専用）**（指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md` §7）
 *
 * 【★この検査がいちばん見ているもの】
 *   ★**結果に触れていないこと。** 演出は「どこに描くか」だけを変えるもので、
 *   着順・確定タイム・着差・払戻に影響してはいけません。
 *   その保証は「残り 60m で**オフセットが厳密に 0**」という 1 点に集約されます。
 *
 * ⚠️ ★数値が合っていても見た目が合格とは限りません（俯瞰の件で実証済み）。最終判定は動画です。
 */
import { describe, it, expect } from 'vitest';
import {
  climaxDisplayPositions,
  climaxEnvelope,
  CLIMAX_ENTER_M,
  CLIMAX_RELEASE_M,
  CLIMAX_LEAD_COUNT,
  CLIMAX_MAX_OFFSET_M,
  CLIMAX_MAX_SURGE_M,
  CLIMAX_SURGE_RELEASE_START_M,
} from '../src/climax-choreography.js';

const DIST = 1600;

/** 12 頭。先頭から 1.5m 刻みで並べ、確定着順は馬番順とする */
function field(leadS: number): { gate: number; s: number; finishPosition: number }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    gate: i + 1,
    s: leadS - i * 1.5,
    finishPosition: i + 1,
  }));
}

const opts = { seed: 42, distanceM: DIST };

describe('★最後の直線の攻防（表示専用）', () => {
  /* ── §7-1 結果不変 ────────────────────────────── */

  it('★★残り 60m 以下ではオフセットが厳密に 0（＝確定着順・確定着差でゴール）', () => {
    /**
     * ★これが**結果不変の根拠**です。ここが 0 でないと、画面のゴールが記録と食い違います。
     * ★R-14: 解除距離を伸ばす（例 40m）とこの検査は落ちます。
     */
    for (let rem = CLIMAX_RELEASE_M; rem >= 0; rem -= 0.5) {
      const posed = climaxDisplayPositions(field(DIST - rem), opts);
      for (const p of posed) {
        expect(p.offsetM, `残り ${rem}m で馬番 ${p.gate} が動いています`).toBe(0);
      }
    }
  });

  it('★★演出が始まる前（残り 320m より手前）も 0', () => {
    for (let rem = CLIMAX_ENTER_M; rem <= 800; rem += 10) {
      const posed = climaxDisplayPositions(field(DIST - rem), opts);
      expect(posed.every((p) => p.offsetM === 0)).toBe(true);
    }
  });

  it('★★`disabled` を渡すと、どこでも本来の位置そのもの', () => {
    for (let rem = 400; rem >= 0; rem -= 5) {
      const base = field(DIST - rem);
      const posed = climaxDisplayPositions(base, { ...opts, disabled: true });
      for (const [i, p] of posed.entries()) {
        expect(p.s).toBe(base[i]!.s);
        expect(p.offsetM).toBe(0);
      }
    }
  });

  /* ── §7-2 決定論 ──────────────────────────────── */

  it('★★同じ入力なら毎回まったく同じ（乱数も時刻も使っていない）', () => {
    const a = climaxDisplayPositions(field(DIST - 180), opts);
    const b = climaxDisplayPositions(field(DIST - 180), opts);
    expect(a).toEqual(b);
  });

  it('★★seed が違えば振り付けも違う（毎レース同じ動きにしない）', () => {
    const a = climaxDisplayPositions(field(DIST - 180), { ...opts, seed: 42 });
    const b = climaxDisplayPositions(field(DIST - 180), { ...opts, seed: 43 });
    expect(a).not.toEqual(b);
  });

  /* ── §7-3 連続性 ──────────────────────────────── */

  it('★★区間の継ぎ目で跳ばない（1m 刻みの差が滑らか）', () => {
    /**
     * ★効き具合 `climaxEnvelope` の**二階差分**を見ます。
     *   ⚠️ 一階差分（＝速さ）が大きいのは追い抜きなので不具合ではありません。
     *      跳びは**加速**に出ます。
     */
    let maxAcc = 0;
    for (let rem = 400; rem >= 0; rem -= 0.25) {
      const a = climaxEnvelope(rem + 0.25);
      const b = climaxEnvelope(rem);
      const c = climaxEnvelope(rem - 0.25);
      maxAcc = Math.max(maxAcc, Math.abs(c - 2 * b + a));
    }
    expect(maxAcc, '効き具合が継ぎ目で跳んでいます').toBeLessThan(0.002);
  });

  it('★★表示位置そのものも滑らか（1 頭ずつ 0.25m 刻みで二階差分を見る）', () => {
    let maxAcc = 0;
    for (let rem = 400; rem >= 1; rem -= 0.25) {
      const p0 = climaxDisplayPositions(field(DIST - (rem + 0.25)), opts);
      const p1 = climaxDisplayPositions(field(DIST - rem), opts);
      const p2 = climaxDisplayPositions(field(DIST - (rem - 0.25)), opts);
      for (let i = 0; i < p1.length; i += 1) {
        /** ★先頭の進み（0.25m）を引いた「相対の動き」で見る */
        const a = p0[i]!.offsetM, b = p1[i]!.offsetM, c = p2[i]!.offsetM;
        maxAcc = Math.max(maxAcc, Math.abs(c - 2 * b + a));
      }
    }
    expect(maxAcc, '表示位置が継ぎ目で跳んでいます').toBeLessThan(0.01);
  });

  /* ── §4-2 の約束 ──────────────────────────────── */

  it('★★上位 5 頭以外はまったく動かさない', () => {
    for (let rem = 320; rem >= 60; rem -= 5) {
      const posed = climaxDisplayPositions(field(DIST - rem), opts);
      for (const p of posed) {
        if (p.gate > CLIMAX_LEAD_COUNT) {
          expect(p.offsetM, `馬番 ${p.gate}（着外）が動いています`).toBe(0);
        }
      }
    }
  });

  it('★★その瞬間の先頭馬は動かさない（カメラと決勝線が素直なまま）', () => {
    for (let rem = 320; rem >= 60; rem -= 5) {
      const base = field(DIST - rem);
      const leadS = Math.max(...base.map((h) => h.s));
      const posed = climaxDisplayPositions(base, opts);
      const leadIdx = base.findIndex((h) => h.s === leadS);
      expect(posed[leadIdx]!.offsetM).toBe(0);
    }
  });

  it('★★オフセットは上限を超えない（寄せの上限 ＋ 波の上限）', () => {
    /**
     * ⚠️ ★上限は**2 本立て**です（`CLIMAX_MAX_SURGE_M` の注記）。
     *    「寄せ」と「波」は戻し始める距離が違うので、別々に上限を持ちます。
     */
    const cap = CLIMAX_MAX_OFFSET_M + CLIMAX_MAX_SURGE_M;
    for (let rem = 400; rem >= 0; rem -= 1) {
      const posed = climaxDisplayPositions(field(DIST - rem), opts);
      for (const p of posed) {
        expect(Math.abs(p.offsetM)).toBeLessThanOrEqual(cap + 1e-9);
      }
    }
  });

  it('★★自馬を優遇しない（役どころは確定着順だけで決まる）', () => {
    /**
     * ★同じ確定着順・同じ本来位置なら、馬番が違っても**同じ役**が付きます。
     *   ⚠️ 振り付けの微差（seed と馬番のずらし）は残りますが、
     *      ★**役（波の中心と向き）は着順だけ**で決まることを見ます。
     */
    const at = (rem: number, gates: number[]) => climaxDisplayPositions(
      gates.map((g, i) => ({ gate: g, s: DIST - rem - i * 1.5, finishPosition: i + 1 })),
      opts,
    );
    const a = at(180, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const b = at(180, [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    for (let i = 0; i < 5; i += 1) {
      /** ★符号（進出か後退か）が一致すること */
      expect(Math.sign(a[i]!.offsetM), `${i + 1} 着の役が馬番で変わっています`)
        .toBe(Math.sign(b[i]!.offsetM));
    }
  });

  /**
   * ★★**見かけの速さが競馬として在り得る範囲か**（指示書 §4-3④「突発的に増えない」）
   *
   * 【★これが無いと何が起きたか】
   *   ⚠️ ★戻しを 100m→60m でやっていたとき、実測（`tools/audit-climax-release.mjs`）で
   *      残り 78〜81m の馬が★**本来の 0.545〜0.632 倍**にしか見えませんでした。
   *      ★4 割減速して見えるのは「脱落」ではなく**故障**の絵です。
   *   ★逆に掛け始めを 320m→260m にしていたときは★**1.33 倍**＝早送りでした。
   *
   * 【★何を見るか】
   *   ★オフセットの**距離あたりの傾き**（＝見かけの速さのずれ）です。
   *     `|d(offset)/d(先頭の進み)|` が `MAX_SPEED_SKEW` を超えないこと。
   *
   * ★R-14: `CLIMAX_ENTER_M` を 320 に、`CLIMAX_RELEASE_START_M` を 100 に戻すと落ちます。
   */
  it('★★見かけの速さが本来から ±20% を超えてずれない', () => {
    const MAX_SPEED_SKEW = 0.20;
    const STEP = 0.25;
    /**
     * ⚠️ ★**実際の隊列で測ること。** 1.5m 刻みの詰まった隊列だと「寄せ」の量が小さく、
     *    ★戻しが乱暴でもこの検査を素通りします。
     *    ★実測（`tools/audit-climax-camera.mjs`・演出なし）で、主役 5 頭の広がりは
     *      **19〜21m**（＝ 5m 刻み）でした。そこで測ります。
     */
    const spread = (leadS: number) => Array.from({ length: 12 }, (_, i) => ({
      gate: i + 1, s: leadS - i * 5, finishPosition: i + 1,
    }));
    let worst = 0, worstRem = 0, worstGate = 0;
    for (let rem = 420; rem >= 0; rem -= STEP) {
      const a = climaxDisplayPositions(spread(DIST - (rem + STEP)), opts);
      const b = climaxDisplayPositions(spread(DIST - rem), opts);
      for (let i = 0; i < b.length; i += 1) {
        const skew = Math.abs(b[i]!.offsetM - a[i]!.offsetM) / STEP;
        if (skew > worst) { worst = skew; worstRem = rem; worstGate = b[i]!.gate; }
      }
    }
    expect(worst, `残り ${worstRem}m の馬番 ${worstGate} が本来の ${(worst * 100).toFixed(0)}% ずれて見えます`)
      .toBeLessThan(MAX_SPEED_SKEW);
  });

  /**
   * ★★**役どころの波が、指示書 §4-2 の「180〜100m」で生きていること**
   *   ⚠️ ★「寄せ」と同じ距離で戻すと、★差し・差し返しが残り 150m あたりで消えます。
   *   ★R-14: `CLIMAX_SURGE_RELEASE_START_M` を `CLIMAX_RELEASE_START_M` と同じにすると落ちます。
   */
  it('★★残り 180〜100m でも役どころの波が効いている', () => {
    expect(climaxEnvelope(150, CLIMAX_SURGE_RELEASE_START_M),
      '残り 150m で波が消えています').toBeGreaterThan(0.9);
    expect(climaxEnvelope(110, CLIMAX_SURGE_RELEASE_START_M)).toBeGreaterThan(0.9);
    /** ★対照: 「寄せ」のほうは同じ地点でもう半分ほど戻っている */
    expect(climaxEnvelope(150)).toBeLessThan(0.75);
  });

  it('★★★演出が効いている（R-14: 何もしない実装では落ちる）', () => {
    /**
     * ★オフセットが全部 0 の実装でも通ってしまう検査にしないこと。
     *   残り 180m で、上位 5 頭が**実際に詰まっている**ことを見ます。
     */
    const base = field(DIST - 180);
    const posed = climaxDisplayPositions(base, opts);
    const spreadBefore = base[0]!.s - base[4]!.s;
    const spreadAfter = posed[0]!.s - posed[4]!.s;
    expect(spreadAfter, '上位 5 頭が詰まっていません').toBeLessThan(spreadBefore * 0.8);
    /** ★少なくとも 1 頭は 1m 以上動いていること */
    expect(Math.max(...posed.map((p) => Math.abs(p.offsetM)))).toBeGreaterThan(1);
  });
});
