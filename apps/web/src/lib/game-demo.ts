/**
 * ★ログイン後画面（調教／出走登録／投票／記録／景品交換）の表示モデルとデモデータ
 *   正本: design/hud-ds/components/{training,race-entry,bet-sheet,records,prize-exchange}
 *   ⚠️ 今はデモデータ。EP/PP の残高・上限・疲労の遷移・しきい値の文言は**サーバーが返す値**を表示するだけにする
 *     （ここに式を持たない）。実データ化は Auth と RPC（spend_training_ep / place_bet / exchange_prize）が画面に繋がってから。
 *   ⚠️ 憲法 §0.2: EP と PP を合算しない。「購入」「チャージ」「換金」「円」を使わない。馬券は「投票」。
 */
import type { StableHorse } from './stable';

// ---------------------------------------------------------------------------
// 調教
// ---------------------------------------------------------------------------
export interface TrainingMenu {
  readonly id: string;
  readonly name: string;
  readonly main: string;
  /** 副効果（無ければ '—'） */
  readonly sub: string;
  readonly fatigueDelta: number;
  readonly ep: number;
  /** 警告帯（サーバーが返す文言。画面では色の割り当てだけ） */
  readonly banner?: { readonly kind: 'warn' | 'bad'; readonly text: string } | undefined;
}

/** 正典 §7.2 の 8 メニュー（値は初期値・§13 で調整） */
export const TRAINING_MENUS: readonly TrainingMenu[] = [
  { id: 'hill', name: '坂路', main: 'スピード＋　パワー＋', sub: '—', fatigueDelta: 18, ep: 300 },
  { id: 'wood', name: 'ウッドチップ', main: 'スタミナ＋　根性＋', sub: '—', fatigueDelta: 15, ep: 300 },
  { id: 'pool', name: 'プール', main: 'スタミナ＋', sub: '疲労 −5', fatigueDelta: 6, ep: 400 },
  { id: 'gate', name: 'ゲート練習', main: '賢さ＋', sub: '出遅れ率 ↓', fatigueDelta: 8, ep: 200 },
  { id: 'pair', name: '併せ馬', main: '根性＋　賢さ＋', sub: '気性 −2', fatigueDelta: 20, ep: 500, banner: { kind: 'warn', text: '疲労が高い馬には注意' } },
  { id: 'sharp', name: '追い切り', main: '全能力＋　係数 1.6', sub: '故障率 ↑↑', fatigueDelta: 32, ep: 800, banner: { kind: 'bad', text: '故障リスク 高' } },
  { id: 'light', name: '軽め調整', main: '全能力＋　係数 0.3', sub: '—', fatigueDelta: 4, ep: 100 },
  { id: 'rest', name: '休養', main: '疲労 −35', sub: '気性 −5', fatigueDelta: -35, ep: 0 },
];

export interface TrainingStats { readonly label: string; readonly value: number; readonly capRatio: number }
export const DEMO_TRAINING_STATS: Readonly<Record<string, readonly TrainingStats[]>> = {
  h3: [
    { label: 'スピード', value: 612, capRatio: 0.76 }, { label: 'スタミナ', value: 548, capRatio: 0.70 }, { label: 'パワー', value: 571, capRatio: 0.72 },
    { label: '根性', value: 498, capRatio: 0.64 }, { label: '賢さ', value: 603, capRatio: 0.78 },
  ],
};
/** 疲労に応じた注意文（サーバーの値。ここではデモ） */
export function demoFatigueNote(fatigue: number): string | null {
  if (fatigue > 60) return '疲労が高い状態です。重いメニューは故障につながります';
  if (fatigue > 50) return '疲労が中程度です。重いメニューは翌週に影響します';
  return null;
}

// ---------------------------------------------------------------------------
// 出走登録
// ---------------------------------------------------------------------------
export interface EntryRace {
  readonly id: string;
  readonly time: string;
  readonly raceNo: string;
  readonly classRank: number;
  readonly classLabel: string;
  readonly course: string;
  readonly going: string;
  readonly heads: number;
  readonly feeEP: number;
  /** 残り時間の表記。締切後は null */
  readonly deadline: string | null;
  readonly state: 'ok' | 'class' | 'closed';
  readonly weightKg: number;
}
export const DEMO_ENTRY_RACES: readonly EntryRace[] = [
  { id: 'e1', time: '15:50', raceNo: '12R', classRank: 2, classLabel: '1勝クラス', course: '芝 2000m 右', going: '稍重', heads: 14, feeEP: 400, deadline: '2:24', state: 'ok', weightKg: 56 },
  { id: 'e2', time: '16:10', raceNo: '2R', classRank: 2, classLabel: '1勝クラス', course: '芝 1200m 右', going: '良', heads: 11, feeEP: 400, deadline: '22:24', state: 'ok', weightKg: 56 },
  { id: 'e3', time: '16:30', raceNo: '4R', classRank: 2, classLabel: '1勝クラス', course: 'ダート 1400m 右', going: '良', heads: 9, feeEP: 400, deadline: '42:24', state: 'ok', weightKg: 56 },
  { id: 'e4', time: '16:20', raceNo: '3R', classRank: 4, classLabel: '3勝クラス', course: '芝 1800m 左', going: '良', heads: 12, feeEP: 700, deadline: '32:24', state: 'class', weightKg: 56 },
  { id: 'e5', time: '16:40', raceNo: '5R', classRank: 6, classLabel: '重賞 GIII', course: '芝 2400m 左', going: '良', heads: 16, feeEP: 1200, deadline: '52:24', state: 'class', weightKg: 56 },
  { id: 'e6', time: '15:10', raceNo: '9R', classRank: 2, classLabel: '1勝クラス', course: '芝 1400m 右', going: '良', heads: 12, feeEP: 400, deadline: null, state: 'closed', weightKg: 56 },
];
export const STRATEGY_OPTIONS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'nige', label: '逃げ' }, { key: 'senko', label: '先行' }, { key: 'sashi', label: '差し' }, { key: 'oikomi', label: '追込' },
];

// ---------------------------------------------------------------------------
// 投票（馬券）
// ---------------------------------------------------------------------------
export interface BetHorse { readonly gate: number; readonly name: string }
export const DEMO_BET_RACE = {
  id: 'demo', raceNo: '11R', raceName: '桜星賞', cond: '芝1600m 左', fieldSize: 12, deadline: '2:24',
  horses: [
    'アオバハヤテ', 'コトブキノホシ', 'ライトニングボウ', 'ミライノツバサ', 'セイランオー', 'ハナカゼマル',
    'サクラブリーズ', 'ゲンブノツルギ', 'トキメキステップ', 'ホクトリュウセイ', 'シラユキノヒメ', 'カガヤキボシ',
  ].map((name, i): BetHorse => ({ gate: i + 1, name })),
  /** みんなの投票状況（支持の目安・単勝）。オッズには影響しない */
  shares: [[7, 28], [3, 19], [4, 14], [10, 11], [11, 8], [8, 7]] as readonly (readonly [number, number])[],
  /** 自馬が出走しているか（§9.5: 出走レースは投票不可） */
  ownGate: null as number | null,
  epBalance: 4200,
  capPerBet: 5000,
};
/** 券種（正典 §9.1 の 7 券種。枠連は無い）: 必要な選択数と区切り */
export const BET_TYPES: readonly { readonly key: string; readonly label: string; readonly picks: number; readonly ordered: boolean }[] = [
  { key: 'win', label: '単勝', picks: 1, ordered: false },
  { key: 'place', label: '複勝', picks: 1, ordered: false },
  { key: 'quinella_place', label: 'ワイド', picks: 2, ordered: false },
  { key: 'quinella', label: '馬連', picks: 2, ordered: false },
  { key: 'exacta', label: '馬単', picks: 2, ordered: true },
  { key: 'trio', label: '三連複', picks: 3, ordered: false },
  { key: 'trifecta', label: '三連単', picks: 3, ordered: true },
];

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------
export interface RunRow { readonly week: number; readonly date: string; readonly race: string; readonly classRank: number; readonly classLabel: string; readonly horse: string; readonly cond: string; readonly place: number; readonly prizePP: number }
export interface LedgerRow { readonly at: string; readonly reason: string; readonly desc: string; readonly delta: number; readonly balance: number }
export const DEMO_RUNS: readonly RunRow[] = [
  { week: 32, date: '8/18', race: '桜星賞', classRank: 6, classLabel: '重賞 GI', horse: 'サクラブリーズ', cond: '芝1600 良', place: 1, prizePP: 6200 },
  { week: 32, date: '8/18', race: '新緑賞', classRank: 1, classLabel: '未勝利', horse: 'シラユキノヒメ', cond: '芝1400 良', place: 4, prizePP: 0 },
  { week: 31, date: '8/11', race: '若草賞', classRank: 6, classLabel: '重賞 GIII', horse: 'サクラブリーズ', cond: '芝1600 良', place: 1, prizePP: 2400 },
  { week: 31, date: '8/11', race: '水無月特別', classRank: 5, classLabel: 'オープン', horse: 'ホクトリュウセイ', cond: 'ダート1800 良', place: 3, prizePP: 520 },
  { week: 30, date: '8/4', race: '陽春特別', classRank: 5, classLabel: 'オープン', horse: 'ホクトリュウセイ', cond: 'ダート1800 稍', place: 6, prizePP: 0 },
];
export const DEMO_EP_LEDGER: readonly LedgerRow[] = [
  { at: '8/18 15:44', reason: '投票', desc: '三連単　11R 桜星賞', delta: -1000, balance: 3200 },
  { at: '8/18 15:12', reason: '出走料', desc: '11R 桜星賞　サクラブリーズ', delta: -400, balance: 4200 },
  { at: '8/18 09:02', reason: '調教', desc: '追い切り　サクラブリーズ', delta: -800, balance: 4600 },
  { at: '8/17 21:30', reason: '返還', desc: '取消　9R 新緑賞　カガヤキボシ', delta: 400, balance: 5400 },
  { at: '8/17 09:10', reason: '調教', desc: '坂路　ホクトリュウセイ', delta: -300, balance: 5000 },
  { at: '8/16 20:04', reason: '投票', desc: '馬連　7R 皐月特別', delta: -500, balance: 5300 },
];
export const DEMO_PP_LEDGER: readonly LedgerRow[] = [
  { at: '8/18 15:47', reason: '払戻', desc: '三連単　11R 桜星賞', delta: 117300, balance: 135900 },
  { at: '8/18 15:46', reason: '賞金', desc: '11R 桜星賞　1着　サクラブリーズ', delta: 6200, balance: 18600 },
  { at: '8/11 16:44', reason: '賞金', desc: '5R 若草賞　1着　サクラブリーズ', delta: 2400, balance: 12400 },
  { at: '8/11 16:12', reason: '払戻', desc: '複勝　4R 水無月特別', delta: 1800, balance: 10000 },
  { at: '8/4 12:00', reason: '景品交換', desc: '特製ブランケット', delta: -8000, balance: 8200 },
  { at: '8/3 16:20', reason: '賞金', desc: '3R 陽春特別　3着　ホクトリュウセイ', delta: 520, balance: 16200 },
];

// ---------------------------------------------------------------------------
// 景品交換
// ---------------------------------------------------------------------------
export interface Prize {
  readonly id: string; readonly category: string; readonly name: string; readonly pp: number;
  readonly stock: number | null; readonly until: string | null; readonly tag: 'limited' | 'few' | null;
}
export const DEMO_PRIZES: readonly Prize[] = [
  { id: 'p1', category: '雑貨', name: '特製ブランケット', pp: 8000, stock: 12, until: null, tag: null },
  { id: 'p2', category: '雑貨', name: '牧場ロゴ入りキャップ', pp: 5000, stock: 34, until: null, tag: null },
  { id: 'p3', category: '体験', name: '厩舎見学ツアー 招待', pp: 42000, stock: null, until: '8/31', tag: 'limited' },
  { id: 'p4', category: 'コレクション', name: '蹄鉄レプリカ 額装', pp: 26000, stock: 3, until: null, tag: 'few' },
  { id: 'p5', category: 'ゲーム内', name: '勝負服デザイン 追加枠', pp: 15000, stock: null, until: '8/31', tag: null },
  { id: 'p6', category: 'コレクション', name: '年間チャンピオン記念盾', pp: 120000, stock: 1, until: null, tag: 'few' },
];
export const DEMO_PRIZE_HISTORY: readonly { readonly at: string; readonly name: string; readonly pp: number; readonly state: 'shipped' | 'preparing' }[] = [
  { at: '8/4 12:00', name: '特製ブランケット', pp: 8000, state: 'shipped' },
  { at: '7/21 18:12', name: '牧場ロゴ入りキャップ', pp: 5000, state: 'shipped' },
  { at: '7/2 11:40', name: '蹄鉄レプリカ 額装', pp: 26000, state: 'preparing' },
];
export const DEMO_PP_BALANCE = 18600;

/** 出走登録の対象（休養中を除く） */
export function entryCandidates(horses: readonly StableHorse[]): StableHorse[] {
  return horses.filter((h) => h.week.kind !== 'rest');
}
