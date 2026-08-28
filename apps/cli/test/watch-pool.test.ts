/**
 * ★**デモの出走表は「同格帯」から組む**（D-018 / 2026-08-28）
 *
 *   正典 D-018: **出走馬を同格帯（クラス）から組む。無作為抽選だと 1 番人気勝率が 51% になり V-4 が壊れる。**
 *
 * 【なぜこの検査が要るか】
 *   ⚠️ ★`apps/web/src/lib/watch-pool.json` は**画面も監査道具も**「連続 12 頭スライス」で読みます
 *      （`page.tsx` の `build()` / `tools/lib/race-audit-build.mjs`）。
 *   ★したがって**プールの並び順そのものが「同格帯かどうか」を決めます。**
 *
 *   ⚠️ ★2026-08-28 まで並びが**能力順ではなく**、12 頭スライスの能力幅は**中央 16.4%**でした
 *      （正典のクラス幅は **6%**）。★レビュー側裁定
 *      `REVIEW_P4_FINISH_CONTEST_VERDICT_20260825.md` §2-2 が測定して指摘しています。
 *   → ★能力順に並べ替えて **3.1%** になりました。
 *
 * ⚠️ ★**このファイルは生成元がありません**（書き出す道具は 1 本もなく、全部が読むだけ）。
 *    ★だから並びが崩れるとしたら**人が差し替えたとき**です。★そのときここで落ちます。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
interface PoolHorse { readonly stats: Readonly<Record<string, number>> }
const pool = JSON.parse(readFileSync(`${ROOT}apps/web/src/lib/watch-pool.json`, 'utf8')) as PoolHorse[];

/** ★能力は engine が使う stats の平均。★ここで独自の指標を作らない（R-30） */
const abilityOf = (h: PoolHorse): number => {
  const v = Object.values(h.stats);
  return v.reduce((a, b) => a + b, 0) / v.length;
};
/** ★12 頭の能力幅（％）。裁定 §2-2 と同じ測り方 */
const spreadOf = (rows: readonly PoolHorse[]): number => {
  const a = rows.map(abilityOf);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return ((Math.max(...a) - Math.min(...a)) / mean) * 100;
};
/** ★`page.tsx` / `race-audit-build.mjs` と同じ取り方 */
const FIELD = 12;
const sliceFor = (seed: number): PoolHorse[] => {
  const start = (seed * 13) % Math.max(1, pool.length - FIELD);
  return pool.slice(start, start + FIELD);
};

describe('★デモの出走表は同格帯から組む（D-018）', () => {
  it('★プールは能力順に並んでいる', () => {
    const a = pool.map(abilityOf);
    for (let i = 1; i < a.length; i += 1) {
      expect(a[i]!, `${i} 番目が ${i - 1} 番目より強い（並びが崩れています）`)
        .toBeLessThanOrEqual(a[i - 1]! + 1e-9);
    }
  });

  it('★★12 頭の能力幅は中央 4% 以内、大半の窓が正典のクラス幅 6% に収まる', () => {
    /**
     * ⚠️ ★**「どの窓も 6% 以内」にはなりません。** 実測（36 頭・12 頭立て・窓 24 通り）:
     *      最小 1.95% / **中央 3.12%** / 最大 **12.33%**
     *      ★**6% を超えるのは 7 窓**で、★**すべてプールの端**（開始 0 と 18〜23）です。
     *      ★能力の飛びが大きいところを窓が跨ぐためで、
     *      ★実際の競馬でも最上位クラスと最下位クラスは内部の幅が広いので、不自然ではありません。
     * ★**並びが崩れて未整列（中央 16.4%）に戻ったら、ここで落ちます。**
     */
    const spreads = Array.from({ length: pool.length - FIELD }, (_, start) =>
      spreadOf(pool.slice(start, start + FIELD))).sort((a, b) => a - b);
    const median = spreads[Math.floor(spreads.length / 2)]!;
    expect(median, '★12 頭スライスの能力幅の中央値').toBeLessThanOrEqual(4);
    const within = spreads.filter((v) => v <= 6).length / spreads.length;
    expect(within, '★6% 以内に収まる窓の割合').toBeGreaterThanOrEqual(0.7);
  });

  it('★使っている seed の窓の幅を記録する（★端の窓は 6% を超える・既知の残件）', () => {
    /**
     * ★**前後の実測**（36 頭・12 頭立て・窓 24 通り）:
     *
     *              中央     最大     6% 以内   seed42
     *   前（未整列） 16.44%  18.61%    0/24     13.41%
     *   後（能力順） ★3.12%  12.33%  ★17/24    ★7.08%
     *
     * ★**実際に使っている seed の窓の幅**（並べ替え後）:
     *
     *   seed  19 → 1.95%   seed   2 → 3.08%   seed 253 → 5.62%   seed  16 → 5.68%
     *   seed  42 → 7.08%   seed  90 → 7.08%   seed   9 → 8.39%   seed  11 → ★12.33%
     *
     * ⚠️ ★**いちばん使っている seed 42 は 7.08% で、正典のクラス幅 6% に届いていません。**
     *    ★`(42×13) % 24 = 18` ＝ **プールの端の窓**を引くためです。端は能力の飛びが大きく、
     *    ★**並べ替えだけでは詰められません**（13.41% → 7.08% と半分にはなっています）。
     * ★**既知の残件**です。詰めるなら ①プールの端の外れ値を落とす
     *    ②窓の選び方 `(seed*13) % N` を端に当たらない形にする、のどちらか。
     *    ⚠️ ②は `page.tsx` / `race-audit-build.mjs` / `shot-race-at.mjs` の**3 か所**にあり、
     *    ★同じ式を 3 か所で持っている**既知の重複**に触ります。
     *
     * ★ここでは**上限だけ**を置きます（改善が戻ったら落ちる）。★恣意的に seed を選びません。
     */
    for (let seed = 1; seed <= 300; seed += 1) {
      expect(spreadOf(sliceFor(seed)), `seed ${seed} の能力幅`).toBeLessThanOrEqual(13);
    }
  });

  it('★対照: 母集団全体は 6% を超える（＝スライスが効いていることの確認）', () => {
    /**
     * ⚠️ ★これが無いと、上の基準は「**プール全体が均一**」でも満たせます（R-16）。
     *    ★母集団に幅があって、なおスライスが狭いことを見ます。
     */
    expect(spreadOf(pool), '母集団に幅が無い').toBeGreaterThan(6);
  });
});
