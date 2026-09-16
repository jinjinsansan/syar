/**
 * ★**馬の購入**（★GB-4・2026-09-16・正典 §3.3・§6・§10.5・**D-102**・オーナー決定 T-5）
 *
 * 【★この便では純関数と検査だけ】（★指示書 `DEV_INSTRUCTIONS_GAME_BODY_1_20260916.md` §4）
 *   ★**DB の書き込みと RPC は次の便**です（★利用者向け RPC はまだ 1 つも無い）。
 *   ★ここにあるのは ★**候補の選び方・値付け・在庫の見張り**の純関数だけで、★DB も時刻も乱数も持ちません。
 *
 * 【★D-102 の条件をどう満たすか】
 *   ① ★**EP で買う。PP では買わせない** … ★この層は EP の額しか返しません（★PP を表す型も引数もありません）
 *   ② ★**売る馬は NPC 世界から取る** … ★候補は ★**渡された現役プールから選ぶだけ**で、★ここで馬を作りません
 *   ③ ★**振り直しが成立しない** … ★候補は ★**★表示が同じ帯**から出し（`starsOf`）、★手放して戻る EP は買った額の `SELL_BACK_RATE`
 *   ④ ★**配合より割高** … ★§1.1「血をつなぐ」を中核に保つため、★価格は ★配合の費用より高く置きます（§4-1 の註記）
 *   ⑤ ★**在庫の下限監視** … ★`marketStockAlert` が下限を割ったことを返します（★黙って帯を広げない・D-079 ⑦）
 */

/**
 * ⚠️ ★**この層は馬の記録（`HorseRecord`）を知りません。**
 *    ★`@star/scheduler` は ★**依存ゼロ**（`package.json` の `dependencies: {}`）で、
 *    ★`@star/sim-engine` を引くとその約束が壊れます。
 *    → ★**★は呼び出し側が `starsOf`（`@star/sim-engine`）で出して渡します。**
 *      ★算出は 1 か所（`stars.ts`）のままで、★この層は「★ → 価格・帯・在庫」だけを持ちます。
 */

/**
 * ★**★1 つあたりの価格 [EP]**（★較正定数・D-102 ④）。
 *
 * ⚠️ ★**値そのものをゲートにしません**（★指示書 §4）。★GB-6 の収支の取り直しで、
 *    ★この額込みの 1 キャリアの収支と ★「同じ EP での期待する★」を報告します。
 * ★置き方: ★★3.0 の馬で 6,000 EP（★デイリー 200 EP の 30 日分・初期 EP 2,000 の 3 倍）。
 *   ★**配合（種付料）より割高**という条件は、★**種付料の式が正典にも実装にも無い**ため、
 *   ★いまは ★**下限として `MIN_PRICE_EP` を置き、比較は GB-6 の収支で報告**します（★§4-1 の註記・△）。
 */
export const STAR_PRICE_EP = 2000;
/** ★最低価格 [EP]（★どんなに★が低くてもこれ以下では売らない） */
export const MIN_PRICE_EP = 3000;
/**
 * ★**手放したときに戻る割合**（★D-102 ③「買った額より十分小さく」）。
 * ⚠️ ★高くすると ★**買って売ってを繰り返す振り直し**が成立します。★0.2 は「4/5 が消える」形です。
 */
export const SELL_BACK_RATE = 0.2;
/** ★NPC の現役プールの在庫の下限（★D-102 ⑤・D-079 ⑧） */
export const MARKET_STOCK_MIN = 200;

/** ★出品（★NPC 世界の馬を、買える形で見せたもの） */
export interface MarketListing {
  readonly horseId: string;
  /** ★見せるのは★だけ（★素質の数値は出さない・§5.5） */
  readonly stars: number;
  readonly priceEP: number;
}

/**
 * ★**値付け**（★★から決める・★素質の数値は使わない）。
 * ⚠️ ★★が同じなら ★**価格も同じ**です（★価格から中身を読めないように）。
 */
export function priceOfStars(stars: number): number {
  return Math.max(MIN_PRICE_EP, Math.round(stars * STAR_PRICE_EP));
}

/** ★手放したときに戻る EP（★買った額より十分小さい） */
export function sellBackEP(paidEP: number): number {
  return Math.floor(paidEP * SELL_BACK_RATE);
}

/**
 * ★**候補を選ぶ**（★D-102 ②③）。
 *
 * ★`pool` … ★NPC の現役プール（★この関数は馬を作りません）
 * ★`stars` … ★出す★の帯（★`starsOf` と同じ量で選ぶ — ★見た目と中身の帯を一致させる）
 * ★`count` … ★見せる頭数
 * ⚠️ ★**並べ替えも抽選もしません**（★乱数を持たない層）。★呼び出し側が渡した順に、帯に合う馬を前から取ります。
 *    ★「毎回違う候補を見せる」ための抽選は ★DB の便で入れますが、★**帯が同じなので観測できる差は出ません**。
 */
export function listingsFromPool(
  pool: readonly { readonly horseId: string; readonly stars: number }[],
  stars: number,
  count: number,
): MarketListing[] {
  const price = priceOfStars(stars);
  const out: MarketListing[] = [];
  for (const h of pool) {
    if (out.length >= count) break;
    if (h.stars !== stars) continue;
    out.push({ horseId: h.horseId, stars, priceEP: price });
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
