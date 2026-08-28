/**
 * ★**カメラを「競り合っている場所」へ向ける**（表示専用・馬の位置には触れません）
 *
 * 【★なぜ要るか — 実測で分かったこと】
 *   オーナー要求は「この大きさ（馬体が画面高の 46%）で 4〜5 頭がせめぎ合う」。
 *
 *   ⚠️ ★実測（`tools/audit-straight-spread.mjs`・演出なし）:
 *      上位 5 頭は最後の直線を通してずっと **19〜21m** に伸びています。
 *      ★馬体が画面高の 46% になるまで寄ったとき、画面に入る走路は **6.2m**。
 *      ★**21m は 6.2m の窓に入りません。** → カメラの画角では**絶対に**解決しません。
 *
 *      ⚠️ ★**ここは 2026-08-28 まで 「9.2m」と書いていました。誤りです。**
 *         ★**画面高の 46% を、馬の高さ 1.6m ではなく体長 2.4m と取り違えた**値です。
 *           1280px ÷ (0.46×720px ÷ 2.4m) = **9.28m**　← 誤り（体長）
 *           1280px ÷ (0.46×720px ÷ 1.6m) = **6.18m**　← 正（高さ）
 *         ★実測も **6.15m**（`tools/_screenspan.mjs`・4 seed / 1460 コマ、相似で外挿）です。
 *
 *   ★ところが（`tools/audit-real-overtakes.mjs`・演出なし）:
 *
 *        seed  42  直線での追い抜き **3 回**（10-4 @残り219m / 10-5 @残り611m / 2-5 @残り18m）
 *        seed  14  **9 回** / seed 332  **4 回** / seed 474  **4 回**
 *
 *   ★**差しも追い込みも、エンジンはちゃんと起こしています。**
 *     映らなかったのは、★**カメラが先頭馬に固定されていたから**です。
 *     10 番が 4 番を抜く残り 219m の瞬間、画面は先頭を中心に数 m しか映しておらず、
 *     ★その競り合いは**画面の外**で起きていました。
 *
 * 【★だからここは何をするか】
 *   ★**注視点を、いちばん競り合っている場所へ寄せます。** それだけです。
 *   ⚠️ ★馬の位置・着順・タイム・着差・払戻には**一切触れません**（憲法3）。
 *      `climax-choreography` のように**馬を動かしません**。だから
 *      ★見かけの速度のずれ（あちらは +13.3% / −14.8%）は**原理的に発生しません**。
 *   ⚠️ `Date.now()` / `Math.random()` を使いません。その瞬間の位置だけで決まります（憲法4）。
 *
 * 【★1 コマの跳びを作らないための形】
 *   ⚠️ ★「いちばん近い 2 頭を選ぶ」という**離散的な選び方をしてはいけません。**
 *      組が入れ替わった 1 コマで注視点が飛びます（過去に `front-close` で
 *      **237px 飛んだ**実害があります・`broadcast-v2-scene.ts` の注記）。
 *   ★代わりに、★**各馬が「どれだけ competitive か」を連続な重みにして、加重平均**を取ります。
 *     近くに他馬がいる馬ほど重みが大きくなります。組の入れ替わりは重みが**少しずつ移る**
 *     だけなので、注視点は跳びません。
 */

/** ★「近い」と見なす距離の目安（m）。馬 1 頭ぶん強 */
export const CONTEST_SIGMA_M = 4;
/**
 * ★**先頭からどこまで下がってよいか**（m）。
 *   ⚠️ ★際限なく下がれるようにすると、後方で競っている 2 頭を追いかけて
 *      ★先頭が遠くへ消え、レースの体を成しません。
 *   ★これは**重みが 0 になる距離**であって、頭打ち（clamp）ではありません。
 *   ★これより遠い競り合いは重み 0 になり、注視点は**先頭に戻ります**。
 *
 *   ⚠️ ★**ここは 2026-08-28 まで「9.2m の窓の 1.5 倍」と書いていました。根拠が誤りです。**
 *      ★上のとおり 9.2m は取り違えです。★その上、このカットは 46% ではありません。
 *      ★実測（`tools/_screenspan.mjs`・v6 / `straight-contest` / 4 seed / 1460 コマ）:
 *        馬高比 **p50 26.0%** ・画面に入る走路 **p50 10.9m**。
 *      → ★**12m は「9.2m の 1.5 倍」ではなく、実際の窓 10.9m とほぼ同じ幅**です。
 *
 *   ⚠️ ★**値は変えていません（見え方が変わるため・オーナー判断待ち）。**
 *      ★実測では注視点が先頭から下がる量は **最大 6.97m**（p50 2.22m）で、
 *      ★いま画を決めているのはこの 12m ではなく `CONTEST_LAG_SOFT_M = 5` の方です。
 *      ⚠️ ★過去に 12→6 へ縮めたことがあり、**効きませんでした**（`broadcast-v2.ts` の注記）。
 */
export const CONTEST_MAX_LAG_M = 12;
/**
 * ★**先頭からここまでは満額で数える**（m）。
 *   ⚠️ ★これが無いと、★**離れた 2 つの集団を平均して「誰もいない場所」を見ます。**
 *      実測（seed 42・残り241m）: 4 番と 10 番が **0.9m 差で競っている**のに、
 *      14m 後ろの別集団（5・2・6）と平均され、注視点が★**その中間 1348.8m**へ。
 *      ★画面（9.3m）にはどちらの集団も入らず、主役が **1 頭**しか映りませんでした。
 *   ★先頭側の競り合いを優先します。JRA 中継も、まず先頭の攻防を映します。
 */
export const CONTEST_LAG_SOFT_M = 5;
/**
 * ★**「競り合っている」と見なす近さの下限・上限**（`Math.exp(-(d/σ)²)` の値）。
 *   ★`CONTEST_WEAK` を下回れば先頭を見る／`CONTEST_STRONG` を超えれば競り合いを見る。
 *   ★σ=4m のとき、おおむね **7m 離れれば 0 ／ 3.6m まで近づけば 1** になります。
 */
export const CONTEST_WEAK = 0.05;
export const CONTEST_STRONG = 0.40;

/**
 * ★**競り合っている場所（m）**を返す。
 *
 * @param positions その瞬間の対象馬の位置（m）。★上位 5 頭だけを渡す想定
 * @param sigmaM    「近い」の目安
 * @param maxLagM   先頭から下がってよい上限
 *
 *   ★対象が 0〜1 頭なら、そのまま（または 0）を返します。
 */
export function contestFocusMeters(
  positions: readonly number[],
  sigmaM: number = CONTEST_SIGMA_M,
  maxLagM: number = CONTEST_MAX_LAG_M,
): number {
  if (positions.length === 0) return 0;
  const lead = positions.reduce((m, s) => (s > m ? s : m), positions[0]!);
  if (positions.length === 1) return lead;

  let sum = 0;
  let weight = 0;
  /** ★いちばん競り合っている組の「近さ」（0〜1）。これが弱ければ先頭を見ます */
  let best = 0;
  for (const s of positions) {
    let w = 0;
    for (const other of positions) {
      if (other === s) continue;
      const d = (s - other) / sigmaM;
      const near = Math.exp(-d * d);
      w += near;
      /**
       * ★「競り合いが在るか」は**先頭寄りの組だけ**で判定します（後方の小競り合いで寄らない）。
       *
       * ⚠️ ★ここを `lead - s <= maxLagM` のような**不連続な条件**にしてはいけません。
       *    組が境目を跨いだ 1 コマで `best` が跳び、注視点ごと跳びます。
       *    ★実測（seed 42・20.67s）で **1 コマ 2.99m**（馬は 0.52m/コマ）動きました。
       * ★組の**後ろ側の馬**の遅れで、下と同じ滑らかな重みを掛けます。
       */
      const pairLag = lead - Math.min(s, other);
      const pu = Math.max(0, Math.min(1,
        (pairLag - CONTEST_LAG_SOFT_M) / Math.max(1e-6, maxLagM - CONTEST_LAG_SOFT_M)));
      const paired = near * (1 - pu * pu * (3 - 2 * pu));
      if (paired > best) best = paired;
    }
    /**
     * ★先頭から離れた馬は重みを落とす（`CONTEST_LAG_SOFT_M` の注記・境目を作らない）。
     *   ★`CONTEST_LAG_SOFT_M` までは満額、`maxLagM` で 0。
     */
    const u = Math.max(0, Math.min(1,
      (lead - s - CONTEST_LAG_SOFT_M) / Math.max(1e-6, maxLagM - CONTEST_LAG_SOFT_M)));
    w *= 1 - u * u * (3 - 2 * u);
    sum += s * w;
    weight += w;
  }
  if (weight <= 1e-6) return lead;

  /**
   * ★**競り合いが無いときは、先頭を見ます。**
   *
   *   ⚠️ ★これが無いと、★**退行になります。** 実測（seed 42・残り301m）で、
   *      上位 5 頭が 20m に伸びているのに後方の 2 頭へカメラが寄り、
   *      ★画面に映る主役が **2 頭 → 1 頭**に減りました。
   *   ★「誰も competitive でないなら、先頭を映す」が中継の既定です。
   *
   *   ★`best`（いちばん近い組の近さ）で連続に混ぜます。
   *     馬 1.5 頭ぶん（3.6m）まで近づけば ほぼ 1、7m 離れれば 0。
   *     ★境目を作らないので、寄り始め・戻り始めで跳びません。
   */
  const t = Math.max(0, Math.min(1, (best - CONTEST_WEAK) / (CONTEST_STRONG - CONTEST_WEAK)));
  const strength = t * t * (3 - 2 * t);
  const focus = lead + (sum / weight - lead) * strength;
  /** ★念のための上下限。先頭より前は見ないし、`maxLagM` より後ろへは行かない */
  return Math.max(lead - maxLagM, Math.min(lead, focus));
}
