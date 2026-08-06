/**
 * 馬券の型（正典 §9）
 *
 * 【憲法 §0.2 の担保】
 *   購入は **EP（参加ポイント）**、払戻は **PP（賞金ポイント）**。
 *   この型では金額を素の number にせず、**どちらのポイントかを型で分ける**。
 *   1つの型に種別フラグを持たせると混同できてしまう（§4 の台帳分離と同じ理由）。
 */

/** 参加ポイント。**金銭で購入できる経路を作らない**（憲法・賭博構造の分水嶺） */
export type EntryPoints = number & { readonly __brand: 'EntryPoints' };
/** 賞金ポイント */
export type PrizePoints = number & { readonly __brand: 'PrizePoints' };

export const ep = (n: number): EntryPoints => n as EntryPoints;
export const pp = (n: number): PrizePoints => n as PrizePoints;

/** 券種7種（正典 §9.1） */
export type TicketKind =
  | 'win' // 単勝
  | 'place' // 複勝
  | 'quinella_place' // ワイド
  | 'quinella' // 馬連
  | 'exacta' // 馬単
  | 'trio' // 三連複
  | 'trifecta'; // 三連単

export const TICKET_KINDS: readonly TicketKind[] = [
  'win',
  'place',
  'quinella_place',
  'quinella',
  'exacta',
  'trio',
  'trifecta',
] as const;

/** 券種ごとに必要な馬番の数 */
export const TICKET_ARITY: Readonly<Record<TicketKind, number>> = {
  win: 1,
  place: 1,
  quinella_place: 2,
  quinella: 2,
  exacta: 2,
  trio: 3,
  trifecta: 3,
};

/*
 * ★削除: TICKET_ORDERED（着順を問う券種かの表）
 *   `settle` の of 判定が着順を直接見ているので、この表は**同じ事実の2つ目の置き場**だった。
 *   券種を足したときに片方だけ更新される（L-2 で潰したクラス）。判定は一箇所に置く。
 */

/** 買い目。`horses` は馬番（1始まり）。順序を問う券種では**配列の順が着順** */
export interface Selection {
  readonly kind: TicketKind;
  readonly horses: readonly number[];
}

export interface Ticket {
  readonly selection: Selection;
  /** 購入額（EP） */
  readonly stake: EntryPoints;
  /**
   * ★購入時に固定したオッズ（正典 §9.2）。
   *   後からオッズ計算を修正しても既存馬券の配当は変わらない — 公正性の要。
   *   **払戻はこの値だけを使い、現在のオッズを参照しない。**
   */
  readonly oddsAtPurchase: number;
}

/** 確定した着順。`order[i]` = i+1着の馬番。同着は `deadHeats` で表す */
export interface RaceOutcome {
  readonly order: readonly number[];
  /** 出走頭数（7頭以下だと複勝・ワイドが2着までになる・§9.1） */
  readonly fieldSize: number;
  /**
   * 同着の組。`[[3, 5]]` なら3番と5番が同着。
   * 同着馬は `order` 上で連続して並び、配当は均等分割する（§9.1）。
   */
  readonly deadHeats?: readonly (readonly number[])[];
  /** 取消・除外馬（含む馬券は全額返還・§9.1） */
  readonly scratched?: readonly number[];
}
