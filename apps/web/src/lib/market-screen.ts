/**
 * ★**馬の市場の画面が使う形**（★D-102・2026-09-26）
 *   ★オーナー指示「繋いでください」。★8 段のループのうち ★**ここだけ画面が繋がっていませんでした**。
 *
 * 【🔴 ★何が起きていたか — ★仕組みは全部在って、呼ぶ側が居ませんでした】
 *   ✔ ★`buy_horse`（`0025`）・★`sell_horse`（`0026`）… ★本番に在る
 *   ✔ ★`horse_market_listing` … ★ワーカーが出品を書く
 *   ✔ ★`horse_market_listing_public`（`0085`）… ★名前と戦績を返す
 *   🔴 ★しかし ★`/stable/market` は ★**`DEMO_MARKET_PRICES_EP` を並べるだけ**でした。
 *     ★買う口も売る口も ★**どの画面からも呼ばれていません**（★2026-09-26 に grep で 0 件）。
 *   ★これは ★D-119 の族です（★決めた・裏は在る・呼ぶ側が居ない）。
 *
 * 【⚠️ ★この層が持たないもの】
 *   ⚠️ ★**値段を決めません。** ★`price_ep` / `sell_back_ep` は ★サーバーが書いた値です
 *      （★D-102 ④「馬の購入は配合より割高」はサーバー側の設計。★画面で式を作らない）。
 *   ⚠️ ★**素質・能力・発見度を出しません**（★D-114）。★手がかりは ★**戦績だけ**です。
 *   ⚠️ ★`Date.now()` を使いません（★憲法 4）。★年齢は ★世界の週から出します。
 */
import { readClient, authClient } from './supabase';
import { SignInRequiredError } from './stable-repo';

/** ★出品の 1 行（★`horse_market_listing_public` の列と同じ） */
export interface MarketListingView {
  readonly horseId: string;
  readonly horseName: string;
  readonly sex: string;
  /** ★買うのに要る EP（★サーバーが書いた値） */
  readonly priceEP: number;
  /** ★手放したときに戻る EP（★D-102・★買った額より必ず小さい） */
  readonly sellBackEP: number;
  readonly starts: number;
  readonly wins: number;
  readonly g1Wins: number;
  /** ★ゲーム内の何週に生まれたか（★年齢は画面が世界の週と引き算します） */
  readonly birthWeek: number;
}

export interface MarketScreenData {
  readonly listings: readonly MarketListingView[];
  /** ★いまのゲーム内の週（★年齢を出すため・★`world_state_public`） */
  readonly gameWeek: number;
}

/**
 * ★**市場の一覧を読む**（★誰でも見られます・★LR-6）。
 * ⚠️ ★**失敗を空にしません**（★「出品が無い」に見えてしまう・R-16）。★投げます。
 */
export async function loadMarketScreen(): Promise<MarketScreenData> {
  const read = readClient();

  const worldRes = await read.from('world_state_public').select('game_week').limit(1);
  if (worldRes.error !== null) {
    throw new Error(`world_state_public を読めませんでした: ${worldRes.error.message}`);
  }
  const gameWeek = Number(worldRes.data?.[0]?.game_week ?? 0);

  const res = await read.from('horse_market_listing_public')
    .select('horse_id, horse_name, horse_sex, horse_birth_week, price_ep, sell_back_ep, starts, wins, g1_wins')
    .order('price_ep', { ascending: true });
  if (res.error !== null) {
    throw new Error(`市場の出品を読めませんでした: ${res.error.message}`);
  }

  const listings: MarketListingView[] = (res.data ?? []).map((r) => ({
    horseId: String(r.horse_id),
    horseName: String(r.horse_name),
    sex: String(r.horse_sex),
    priceEP: Number(r.price_ep),
    sellBackEP: Number(r.sell_back_ep),
    starts: Number(r.starts),
    wins: Number(r.wins),
    g1Wins: Number(r.g1_wins),
    birthWeek: Number(r.horse_birth_week),
  }));
  return { listings, gameWeek };
}

/** ★買う・売るの結果（★失敗の理由は ★**サーバーの言葉をそのまま出しません**） */
export type MarketActionResult =
  | { readonly ok: true; readonly horseId: string }
  | { readonly ok: false; readonly reason: string };

/**
 * 🔴 ★**サーバーの失敗を、画面の言葉に写します**。
 *   ⚠️ ★生の `error.message` を画面に出さないこと（★2026-09-25 に `/records` で実害が出た形）。
 *   ⚠️ ★**知らない失敗は「そのまま」にしません** — ★「いま買えませんでした」と言い、
 *      ★詳しくは console に残します（★黙って飲み込まない・R-27）。
 */
function readMarketError(message: string): string {
  if (/EP が不足|insufficient/i.test(message)) return 'EP が足りません';
  if (/所有上限|OWNERSHIP|limit/i.test(message)) return '持てる頭数の上限です';
  if (/出品されていない|not listed|active/i.test(message)) return 'この馬はもう出品されていません';
  if (/自分の馬|own/i.test(message)) return '自分の馬は買えません';
  if (/setup|未セットアップ/i.test(message)) return '先に厩舎の設定を済ませてください';
  return 'いま手続きできませんでした（しばらくしてからお試しください）';
}

/**
 * ★**馬を買う**（★`buy_horse`・`0025`）。
 *
 * @param clientToken ★**冪等キー**。⚠️ ★再送のたびに作り直さないこと
 *   （★作り直すと ★**2 回買えます**。★`create_account` と同じ穴・V-19 ⑭）。
 */
export async function buyHorse(horseId: string, clientToken: string): Promise<MarketActionResult> {
  const auth = authClient();
  /** 🔴 ★DB に触る前にセッションを見ます（★網 `owner-scoped-needs-session`） */
  const { data: s } = await auth.auth.getSession();
  if (s.session === null) throw new SignInRequiredError();

  const { error } = await auth.rpc('buy_horse', { p_horse_id: horseId, p_client_token: clientToken });
  if (error !== null) {
    console.error('[market] buy_horse が失敗しました', error);
    return { ok: false, reason: readMarketError(error.message) };
  }
  return { ok: true, horseId };
}

/**
 * ★**馬を手放す**（★`sell_horse`・`0026`）。
 * ⚠️ ★戻る額は ★**買った額より小さい**（★D-102）。★画面で計算しません。
 */
export async function sellHorse(horseId: string, clientToken: string): Promise<MarketActionResult> {
  const auth = authClient();
  const { data: s } = await auth.auth.getSession();
  if (s.session === null) throw new SignInRequiredError();

  const { error } = await auth.rpc('sell_horse', { p_horse_id: horseId, p_client_token: clientToken });
  if (error !== null) {
    console.error('[market] sell_horse が失敗しました', error);
    return { ok: false, reason: readMarketError(error.message) };
  }
  return { ok: true, horseId };
}
