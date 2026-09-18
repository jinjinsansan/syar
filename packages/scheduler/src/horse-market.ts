/**
 * ★**馬の購入**（★正典 §3.3・§6・§10.5・**D-102**・オーナー決定 T-5）
 *
 * 【★2026-09-19・**T-11** — ★「帯が価格を決める」のをやめました】
 *   ★旧: ★**素質の帯**が ★**価格**と ★**品揃えの幅**の両方を決めていました
 *        （`LISTED_BANDS` × `LISTINGS_PER_BAND` ＝ 5 × 3）。
 *   ★新（**D-102 ③**・2026-09-18 改訂）:
 *     ★**候補** … ★**走った実績のある馬**（★`is_initial_horse_candidate` の補集合）
 *     ★**価格** … ★**§10.5 の式**〔`3,000 + G1勝利数 × 8,000 + 総獲得賞金/20`〕＝ `npcStudFee()`
 *                  → ★**素質を入力に取らない**ので、★**価格からの逆算が原理的に起きない**
 *     ★**品揃え** … ★**価格の帯** 5 段 × 3 口（★口数も水準も変えない）
 *
 * 【🔴 ★なぜ品揃えに「素質の帯」を使わないか — ★**T11-1 ①**】
 *   ★帯そのものは残ります（★**D-114 ③**: 内部の 24 段は初期馬の付与・**在庫の下限監視**に使う）。
 *   🔴 ★しかし ★**棚を素質の帯で並べると、「どの棚にいるか」が帯を教えます。**
 *      → ★D-114 ② が塞いだ口が ★**「棚」という形で開き直り**、★逆算が復活します。
 *   → ★**並べる鍵に素質（`potential`・段・帯）を使いません。** ★価格＝戦績＝公開情報だけで並べます。
 *
 * 【★D-102 の条件をどう満たすか】
 *   ① ★**EP で買う。PP では買わせない** … ★この層は EP の額しか返しません（★PP を表す型も引数もありません）
 *   ② ★**売る馬は NPC 世界から取る** … ★候補は ★**渡された現役プールから選ぶだけ**で、★ここで馬を作りません
 *      ⚠️ ★**引退馬は入れません**（★**T11-3**）— ★§10.5 が引退した NPC 名馬を**種牡馬市場**へ流すと定めており、
 *        ★2 つの経路で同じ馬を売ると ★**在庫が二重に数えられ**、★D-102 ⑤ の下限監視が壊れます。
 *   ③ ★**振り直しが成立しない** … ★価格は戦績から決まり、★手放して戻る EP は買った額の `SELL_BACK_RATE`
 *   ④ ★**配合より割高** … ★§1.1「血をつなぐ」を中核に保つため（★GB-6 の収支で報告）
 *   ⑤ ★**在庫の下限監視** … ★`marketStockAlert` が下限を割ったことを返します（★黙って広げない・D-079 ⑦）
 */

/**
 * ⚠️ ★**この層は馬の記録（`HorseRecord`）を知りません。**
 *    ★`@star/scheduler` は ★**依存ゼロ**（`package.json` の `dependencies: {}`）です。
 *    → ★価格は ★**呼び出し側が `npcStudFee(g1Wins, totalEarningsPP)` で出して渡します**
 *      （★`stud-fee.ts` は同じ package の中なので、★式は 1 か所のままです）。
 */

/** ★最低価格 [EP]。⚠️ ★`npcStudFee` の基礎額（3,000）と同じ値で、★式が下限を保証します */
export const MIN_PRICE_EP = 3000;
/**
 * ★**手放したときに戻る割合**（★D-102 ③「買った額より十分小さく」）。
 * ⚠️ ★高くすると ★**買って売ってを繰り返す振り直し**が成立します。★0.2 は「4/5 が消える」形です。
 * 🔴 ★**掛ける先は「買った額」です**（★**T11-4**）。★いまの式の値に掛けてはいけません —
 *    ★勝たせて売ると ★**EP が増える経路**になり、★EP は購入できないという二種ポイント制（憲法 2）の
 *    ★前提が崩れ、★§3.4 の収支が別のものになります。
 */
export const SELL_BACK_RATE = 0.2;
/** ★NPC の現役プールの在庫の下限（★D-102 ⑤・D-079 ⑧） */
export const MARKET_STOCK_MIN = 200;

/**
 * ★**出品**（★NPC 世界の馬を、買える形で見せたもの）。
 * ⚠️ ★**段を持ちません**（★D-114 ②。★持つと `horse_market_listing` と公開ビュー経由で外に出ます）。
 *    ★買う人に見えるのは ★**馬そのもの（戦績・オッズ）と価格**だけです。
 */
export interface MarketListing {
  readonly horseId: string;
  readonly priceEP: number;
}

/**
 * ★**出品の候補**（★**T-11**）。
 * ⚠️ ★`priceEP` は ★**呼ぶ側が `npcStudFee()` で出した値**です。★ここで式を持ちません。
 * ⚠️ ★**素質の欄がありません**（★T11-1 ①。★型に無ければ、並べ替えにも使えません）。
 */
export interface MarketCandidate {
  readonly horseId: string;
  readonly priceEP: number;
}

/**
 * ★**手放したときに戻る額**（★D-102 ③）。
 * ⚠️ ★引数は ★**実際に払った額**です（★いまの式の値ではありません・T11-4）。
 */
export function sellBackEP(paidEP: number): number {
  return Math.floor(paidEP * SELL_BACK_RATE);
}

/**
 * ★**価格の帯の下限** [EP]（★**T11-1 ②**・★較正定数）。
 *
 * ★昇順。★`PRICE_TIERS_EP[i]` 以上・`PRICE_TIERS_EP[i+1]` 未満が帯 `i`。
 * ⚠️ ★**較正値ではなく品揃えの決め**です（★旧 `LISTED_BANDS` と同じ扱い）。★着順にも成長にも入りません。
 * ⚠️ ★**5 段のまま**にしています（★口数 5 × 3 ＝ 15 口も、水準も、T-10 から変えていません）。
 *    ★段を増やすと口数が増え、★D-102 ③「選び直しが成立しない」に近づきます。
 */
export const PRICE_TIERS_EP: readonly number[] = [3_000, 4_000, 6_000, 10_000, 20_000];

/**
 * ★価格 → 帯の添字（0 以上・`PRICE_TIERS_EP.length` 未満）。
 * ⚠️ ★**下限を割る価格は投げます** — ★`npcStudFee` の基礎額が 3,000 なので、
 *    ★それ未満が来たのは ★**式を通っていない値**です（★黙って帯 0 に入れない・R-27）。
 */
export function priceTierOf(priceEP: number): number {
  if (!Number.isFinite(priceEP) || priceEP < PRICE_TIERS_EP[0]!) {
    throw new Error(`priceTierOf: 価格が下限を割っています（${priceEP} < ${PRICE_TIERS_EP[0]}）`);
  }
  let tier = 0;
  for (let i = 0; i < PRICE_TIERS_EP.length; i += 1) {
    if (priceEP >= PRICE_TIERS_EP[i]!) tier = i;
  }
  return tier;
}

/**
 * ★**帯ごとに出しておく口数**。
 * ⚠️ ★較正値ではなく ★**品揃えの決め**。★多くすると「選び直し」に近づくので、少なく保ちます（D-102 ③）。
 */
export const LISTINGS_PER_TIER = 3;

/**
 * ★**出品の入れ替えの計画**（★D-102 ②③⑤・**T-11**）。
 *
 * ★`pool` … ★いま買える NPC の現役馬と、★その戦績から出した価格（★呼ぶ側が `npcStudFee` で出す）
 * ★`active` … ★いま出ている出品（★**凍結された価格**を持つ）
 * ★`rotation` … ★**帯の中のどこから取るか**（★**T11-1 ③**）。★呼ぶ側が週やサイクルの番号を渡します
 *
 * 【★**下ろすもの** — ★T11-2 ① で変えました】
 *   ★**プールから消えた馬だけ**（★買われた・引退した）。
 *   🔴 ★**価格が変わっても下ろしません**（★旧はそうしていました）。
 *      ★式が `総獲得賞金/20` を含むので、★**出品中の馬が 1 回走るたびに価格が動きます**。
 *      ★そのたびに下ろすと ★**ほぼ毎日 総入れ替え**になり、★店が落ち着きません。
 *      → ★**出した時点の価格で凍結**します（★「押してから値段が変わる」を作らない・BT-5 の家族）。
 *   ⚠️ ★凍結は ★**「気づかない」を作りやすい**ので（R-16）、★ずれは `listingDrift()` が返します。
 *
 * 【★**足すもの**】★価格の帯ごとに `LISTINGS_PER_TIER` に足りないぶん
 *
 * ⚠️ ★**乱数も時刻も持ちません**（★憲法 4）。★`rotation` は呼ぶ側が渡す整数です。
 */
export interface ListingPlan {
  readonly add: readonly MarketListing[];
  readonly deactivate: readonly string[];
}

export function planListings(
  pool: readonly MarketCandidate[],
  active: readonly { readonly horseId: string; readonly priceEP: number }[],
  rotation: number,
): ListingPlan {
  if (!Number.isInteger(rotation) || rotation < 0) {
    throw new Error(`planListings: rotation が不正（${rotation}）`);
  }
  const inPool = new Set(pool.map((h) => h.horseId));
  const deactivate: string[] = [];
  /** ⚠️ ★出ている出品は ★**凍結された価格**で帯を数えます（★いまの式の帯ではありません） */
  const keptByTier = new Map<number, number>();
  const listed = new Set<string>();
  for (const a of active) {
    // 🔴 ★下ろすのは「プールから消えたとき」だけ（★T11-2 ①）
    if (!inPool.has(a.horseId)) { deactivate.push(a.horseId); continue; }
    listed.add(a.horseId);
    const t = priceTierOf(a.priceEP);
    keptByTier.set(t, (keptByTier.get(t) ?? 0) + 1);
  }

  const add: MarketListing[] = [];
  for (let tier = 0; tier < PRICE_TIERS_EP.length; tier += 1) {
    const need = LISTINGS_PER_TIER - (keptByTier.get(tier) ?? 0);
    if (need <= 0) continue;
    const candidates = pool.filter((h) => !listed.has(h.horseId) && priceTierOf(h.priceEP) === tier);
    if (candidates.length === 0) continue;
    /**
     * ★**毎日同じ馬にならないように、取り始める場所をずらします**（★**T11-1 ③**）。
     * ⚠️ ★**素質で選びません**（★T11-1 ①）。★**乱数も使いません**（★憲法 4）。
     *    ★`rotation` は呼ぶ側が渡す整数で、★同じ `rotation` なら同じ結果です（★再現できる）。
     */
    const start = rotation % candidates.length;
    let taken = 0;
    for (let k = 0; k < candidates.length && taken < need; k += 1) {
      const c = candidates[(start + k) % candidates.length]!;
      if (listed.has(c.horseId)) continue;
      add.push({ horseId: c.horseId, priceEP: c.priceEP });
      listed.add(c.horseId);
      taken += 1;
    }
  }
  return { add, deactivate };
}

/**
 * ★**凍結した額と、いまの式の額のずれ**（★**T11-2 ①**の監視）。
 *
 * 🔴 ★凍結は ★**「気づかない」を作りやすい**形です（R-16）。
 *    ★ずれが大きくなっても、★誰も困らないので誰も気づきません。
 *    → ★**数として出します。** ★閾値はここに持ちません（★見る側が決める）。
 */
export interface ListingDrift {
  readonly horseId: string;
  /** ★出したときの額（★買う人が払う額） */
  readonly listedEP: number;
  /** ★いまの式の額 */
  readonly currentEP: number;
  /** ★`currentEP - listedEP`（★正なら「安く売っている」） */
  readonly diffEP: number;
}

export function listingDrift(
  active: readonly { readonly horseId: string; readonly priceEP: number }[],
  pool: readonly MarketCandidate[],
): readonly ListingDrift[] {
  const now = new Map(pool.map((h) => [h.horseId, h.priceEP]));
  const out: ListingDrift[] = [];
  for (const a of active) {
    const cur = now.get(a.horseId);
    if (cur === undefined || cur === a.priceEP) continue;
    out.push({ horseId: a.horseId, listedEP: a.priceEP, currentEP: cur, diffEP: cur - a.priceEP });
  }
  return out;
}

/**
 * ★**在庫の下限の見張り**（★D-102 ⑤）。
 * ★下限を割ったら ★**警報を返します**（★黙って帯を広げたり、候補を作ったりしない・D-079 ⑦）。
 */
export interface MarketStockAlert {
  readonly ok: boolean;
  readonly available: number;
  readonly min: number;
}

export function marketStockAlert(availableActiveNpc: number): MarketStockAlert {
  return { ok: availableActiveNpc >= MARKET_STOCK_MIN, available: availableActiveNpc, min: MARKET_STOCK_MIN };
}

/**
 * ★**買えるか**（★EP だけで判定・★PP は受け取らない）。
 * ⚠️ ★引数に ★**PP を渡す口がありません**（★§17.2 C-2 と同じ形で、経路そのものを作らない）。
 */
export function canBuyWithEP(epBalance: number, priceEP: number): boolean {
  return epBalance >= priceEP;
}
