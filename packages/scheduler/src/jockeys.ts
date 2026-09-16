/**
 * ★**騎手**（★GB-3・2026-09-16・正典 §10.4・**D-105**・オーナー決定 T-8／O-7）
 *
 * 【★この便では着順に効かせません】（★指示書 §3・R-15「入っているが使われない」）
 *   ★`JOCKEY_EFFECT` は ★**0 の定数**です。★効かせる便で ★V-4・V-5・V-6・V-17・V-18・V-13 を取り直します（D-105 ③）。
 *   ★接続の前後で対照が取れるよう、★**先に「効果 0 で入っている」状態**を作ります。
 *
 * 【★憲法・正典の条件】
 *   ① ★**架空の名前**（★実在の騎手の名前・顔を使わない・正典 §0.1）
 *   ② ★**料金は EP**。★**賞金からの差し引き（報酬率）にしない**（★「PP を払って勝ちやすさを買う」形を作らない・S-5／L-4 の近縁・D-105 ②）
 *   ③ ★**出走登録で凍結する**（★`entrant_snapshot` と同じ扱い・D-055・D-071）
 *   ④ ★**親密度は早く頭打ち**（★長時間・複数口座の一方的な有利を防ぐ・D-077 の考え方）
 *   ⑤ ★**AI 代行（§8b.5）の質を騎手で変えない**（★変えると V-8 が騎手ごとに崩れる）
 *
 * 【★この層の約束】★依存ゼロ・純粋関数。★DB も時刻も乱数も持ちません。
 */

export type JockeyId = string;

export interface Jockey {
  readonly id: JockeyId;
  /** ★架空の名前（★正典 §0.1） */
  readonly name: string;
  /** ★出走 1 回あたりの料金 [EP]（★§10.4 の登録料と同じ形のシンク） */
  readonly feeEP: number;
}

/**
 * ★**騎手の名簿**（★架空）。
 * ⚠️ ★料金は ★**正典の登録料（200 EP）と同じ桁**に置いています。★較正定数ではなく**規則の写しの延長**で、
 *    ★値そのものをゲートにしません（★GB-6 の収支の取り直しで、この額込みの収支を報告します）。
 * ⚠️ ★**強さの差を料金に持たせていません**（★この便では効果が 0 なので、料金は「指名の手数料」だけを意味します）。
 *    ★効かせる便で ★料金と効果の関係（上限つき）を決めます（D-105 ③）。
 */
export const JOCKEYS: readonly Jockey[] = [
  { id: 'j-aoi', name: '青井 はやと', feeEP: 200 },
  { id: 'j-kurata', name: '倉田 みなと', feeEP: 200 },
  { id: 'j-shinozaki', name: '篠崎 れん', feeEP: 300 },
  { id: 'j-tsuji', name: '辻 さやか', feeEP: 300 },
  { id: 'j-himura', name: '桧村 たくみ', feeEP: 400 },
  { id: 'j-narita', name: '成田 ゆう', feeEP: 400 },
];

export function jockeyById(id: JockeyId): Jockey | undefined {
  return JOCKEYS.find((j) => j.id === id);
}

/**
 * ★**着順への効果**（★この便は 0）。
 * ⚠️ ★**0 であることを検査が固定します**（★`jockeys.test.ts` の対照 ①）。
 *    ★ここを 0 でない値にする便では、★上限を ★介入の ±10%（`INTERVENTION_CAP`・§1.5-1）と
 *    ★突き合わせて決め、★V-4・V-5・V-6・V-17・V-18・V-13 を取り直します（D-105 ③）。
 */
export const JOCKEY_EFFECT = 0;

/**
 * ★**親密度**（★D-105 ⑤「早く頭打ちにする」）。
 *   ★1 レースごとに 1 段。★`JOCKEY_BOND_MAX` で止まります（★数戦で上限）。
 * ⚠️ ★**着順には効きません**（★この便では効果 0）。★いまは「何回乗せたか」の表示のための値です。
 */
export const JOCKEY_BOND_MAX = 5;

export function jockeyBondAfterRides(rides: number): number {
  if (rides <= 0) return 0;
  return Math.min(JOCKEY_BOND_MAX, Math.floor(rides));
}

/**
 * ★**出走登録で凍結する騎手の記録**（★D-105 ④）。
 *
 * ⚠️ ★`RaceEntrant`（`@star/race-engine`）には足していません。★あれは ★**着順の計算に入る形**で、
 *    ★この便では騎手を着順に入れないからです（★型の上でも「効かない」を示す）。
 *    ★凍結は ★**出走登録の側**（`race_entries` の `entrant_snapshot` と並ぶ列）に置きます。
 * ⚠️ ★確定・再計算は ★**この凍結を読み、名簿を引き直しません**（★名簿を後から変えても過去のレースが動かない）。
 */
export interface FrozenJockey {
  readonly v: 1;
  readonly jockeyId: JockeyId;
  readonly name: string;
  readonly feeEP: number;
  /** ★登録の時点の親密度（★0〜`JOCKEY_BOND_MAX`） */
  readonly bond: number;
  /** ★着順への効果（★この便は 0。★効かせる便でここに値が入る） */
  readonly effect: number;
}

/** ★登録の時点で凍結する（★名簿の値をその場で写す） */
export function freezeJockey(id: JockeyId, rides: number): FrozenJockey {
  const j = jockeyById(id);
  if (j === undefined) throw new Error(`騎手が名簿にいません: ${id}`);
  return { v: 1, jockeyId: j.id, name: j.name, feeEP: j.feeEP, bond: jockeyBondAfterRides(rides), effect: JOCKEY_EFFECT };
}

/**
 * ★**料金の記帳の形**（★D-105 ②・§3.3 のシンク）。
 *
 * ★`ep_ledger.reason` は ★`inflow / training / entry_fee / bet / refund / stud_fee` に**閉じて**います（`0001_init.sql`）。
 * ★騎手の料金は ★**出走登録と同じ払い方**なので `entry_fee` で記帳します（★新しい語を足すと移行が要り、本便の対象外）。
 * ⚠️ ★**PP には触れません**（★賞金からの差し引きにしない）。
 */
export const JOCKEY_FEE_LEDGER_REASON = 'entry_fee';

/** ★出走 1 回に払う EP（★登録料 ＋ 騎手の料金） */
export function entryCostEP(entryFeeEP: number, jockey: FrozenJockey | null): number {
  return entryFeeEP + (jockey === null ? 0 : jockey.feeEP);
}
