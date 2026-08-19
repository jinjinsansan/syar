/**
 * ★牧場（わたしの馬）の表示モデルとデータ層 — 正本 design/hud-ds/components/stable-home・horse-detail
 *
 * 【今の状態】
 *   ログイン（Supabase Auth）と「自分の馬だけを読める」ビューがまだ無いので、**デモデータ**を返す。
 *   画面は `StableRepo` だけを見る。実データが来たら `supabaseStableRepo` を差し替えるだけにする（画面は触らない）。
 *   ⚠️ ここに計算を持たない（昇格条件・上限・係数はエンジン／DB が出す値をそのまま）。
 *   ⚠️ `potential` は数値で出さない（★1〜5・半星）。素質の数値は本人にも見せない（正典 §5.5・§12.4）。
 */

export type Condition = 1 | 2 | 3 | 4 | 5;
export type WeekPlan = { readonly kind: 'done'; readonly menu: string } | { readonly kind: 'todo' } | { readonly kind: 'rest' };

export interface StableHorse {
  readonly id: string;
  readonly name: string;
  readonly sexAge: string;
  /** 格（1..6）。5 以上（オープン・重賞）は金チップ */
  readonly classRank: number;
  readonly classLabel: string;
  /** 素質 ★（0.5 刻み・1〜5） */
  readonly stars: number;
  readonly condition: Condition;
  readonly fatigue: number;
  readonly nextRace: string | null;
  readonly week: WeekPlan;
  readonly prizePP: number;
}

export interface StableView {
  readonly demo: boolean;
  readonly weekNo: number;
  readonly weekRange: string;
  readonly horses: readonly StableHorse[];
  /** 今週の出走登録頭数・消費予定 EP（サーバー計算値） */
  readonly entries: number;
  readonly plannedEP: number;
}

export interface StatRow { readonly key: string; readonly label: string; readonly value: number; readonly capRatio: number; readonly delta: number }
export interface RaceRow { readonly week: number; readonly race: string; readonly grade: string; readonly cond: string; readonly place: number; readonly time: string; readonly prizePP: number }
export interface TrainingRow { readonly week: number; readonly menu: string; readonly effect: string; readonly fatigueDelta: number; readonly note: string }
export interface Cross { readonly name: string; readonly label: string; readonly color: string }

export interface HorseDetail extends StableHorse {
  readonly coat: string;
  readonly stableName: string;
  readonly nextClassLabel: string | null;
  readonly promotionHint: string | null;
  readonly starts: number; readonly wins: number; readonly seconds: number; readonly thirds: number;
  readonly stats: readonly StatRow[];
  readonly statCapTotal: number;
  readonly aptitude: readonly { readonly label: string; readonly mark: '◎' | '○' | '△' }[];
  readonly strategyLabel: string;
  readonly races: readonly RaceRow[];
  /** 5 代（2, 4, 8, 16, 32 名）。不明なら空配列 */
  readonly pedigree: readonly (readonly string[])[];
  readonly inbreedCoeff: number | null;
  readonly crosses: readonly Cross[];
  readonly training: readonly TrainingRow[];
  readonly entryFeeEP: number | null;
}

export interface StableRepo {
  stable(): Promise<StableView>;
  horse(id: string): Promise<HorseDetail | null>;
}

// ---------------------------------------------------------------------------
// デモデータ（デザインカードのサンプルと同じ。ログイン導入まで）
// ---------------------------------------------------------------------------
const CLASS = ['新馬・未勝利', '1勝クラス', '2勝クラス', '3勝クラス', 'オープン', '重賞'];
const B = ['ブライト', 'ハイランド', 'ウィンド', 'スカーレット', 'オーシャン', 'フォレスト', 'ロイヤル', 'ムーンライト'];
const PEDIGREE: readonly (readonly string[])[] = [
  ['グレートボルト', 'グレートブレイド'],
  ['ゴールデンブレイド', 'シルバーブレイド', 'クリムゾンブレイド', 'エターナルブレイド'],
  B.map((b) => `${b}ブレイド`),
  ['サンライズブレイド', 'アイアンブレイド', 'サンダーボルト', ...['グレート', 'ゴールデン', 'シルバー', 'クリムゾン', 'エターナル', ...B].map((b) => `${b}クラウン`)],
  [
    'サンライズクラウン', 'アイアンクラウン', 'ノーザンスター', 'グレートスター', 'ゴールデンスター', 'ミスティローズ', 'クリムゾンスター', 'エターナルスター',
    ...B.map((b) => `${b}スター`), 'サンライズスター', 'アイアンスター', 'ノーザンアロー', 'グレートアロー', 'ゴールデンアロー', 'サンダーボルト', 'クリムゾンアロー', 'エターナルアロー',
    'ブライトアロー', 'ハイランドアロー', 'ミスティローズ', 'スカーレットアロー', 'オーシャンアロー', 'フォレストアロー', 'ロイヤルアロー', 'ムーンライトアロー',
  ],
];

/** デモの所有馬（画面側の見本にも使う） */
export const DEMO_HORSES: readonly StableHorse[] = [
  { id: 'h1', name: 'サクラブリーズ', sexAge: '牝4', classRank: 6, classLabel: '重賞 GIII', stars: 4.5, condition: 5, fatigue: 24, nextRace: '桜星賞（8/22）', week: { kind: 'done', menu: '追い切り' }, prizePP: 4520 },
  { id: 'h2', name: 'ホクトリュウセイ', sexAge: '牡5', classRank: 5, classLabel: 'オープン', stars: 4, condition: 4, fatigue: 41, nextRace: '若草賞（8/24）', week: { kind: 'done', menu: '坂路' }, prizePP: 3100 },
  { id: 'h3', name: 'トキメキステップ', sexAge: '牝3', classRank: 3, classLabel: '2勝クラス', stars: 3.5, condition: 3, fatigue: 58, nextRace: null, week: { kind: 'todo' }, prizePP: 900 },
  { id: 'h4', name: 'ゲンブノツルギ', sexAge: '牡4', classRank: 2, classLabel: '1勝クラス', stars: 3, condition: 2, fatigue: 72, nextRace: null, week: { kind: 'todo' }, prizePP: 400 },
  { id: 'h5', name: 'シラユキノヒメ', sexAge: '牝3', classRank: 1, classLabel: '未勝利', stars: 2.5, condition: 3, fatigue: 12, nextRace: '新緑賞（8/23）', week: { kind: 'done', menu: 'ウッドチップ' }, prizePP: 0 },
  { id: 'h6', name: 'カガヤキボシ', sexAge: '牡2', classRank: 1, classLabel: '新馬', stars: 5, condition: 4, fatigue: 8, nextRace: null, week: { kind: 'rest' }, prizePP: 0 },
];

function detailOf(h: StableHorse): HorseDetail {
  const hero = h.id === 'h1';
  return {
    ...h,
    coat: '鹿毛', stableName: '高瀬厩舎',
    nextClassLabel: h.classRank >= 6 ? '重賞 GII' : CLASS[h.classRank] ?? null,
    promotionHint: h.classRank >= 6 ? '重賞 2 勝で昇格' : '1 勝で昇格',
    starts: hero ? 12 : 4, wins: hero ? 4 : 1, seconds: hero ? 3 : 1, thirds: hero ? 2 : 0,
    stats: [
      { key: 'speed', label: 'スピード', value: 842, capRatio: 0.90, delta: 12 },
      { key: 'stamina', label: 'スタミナ', value: 706, capRatio: 0.82, delta: 4 },
      { key: 'power', label: 'パワー', value: 768, capRatio: 0.88, delta: 8 },
      { key: 'guts', label: '根性', value: 655, capRatio: 0.76, delta: 0 },
      { key: 'intelligence', label: '賢さ', value: 721, capRatio: 0.84, delta: 6 },
    ],
    statCapTotal: 4200,
    aptitude: [
      { label: '芝', mark: '◎' }, { label: 'ダート', mark: '△' }, { label: '1400〜1800m', mark: '◎' },
      { label: '2000m 以上', mark: '○' }, { label: '良', mark: '◎' }, { label: '重', mark: '△' },
    ],
    strategyLabel: '差し',
    races: hero ? [
      { week: 32, race: '若草賞', grade: '重賞 GIII', cond: '芝1600 良', place: 1, time: '1:34.8', prizePP: 2400 },
      { week: 28, race: '陽春特別', grade: 'オープン', cond: '芝1800 良', place: 3, time: '1:47.2', prizePP: 420 },
      { week: 24, race: '初雪賞', grade: '3勝クラス', cond: '芝1600 稍', place: 2, time: '1:35.5', prizePP: 600 },
      { week: 19, race: '霜月賞', grade: '3勝クラス', cond: '芝1400 良', place: 1, time: '1:21.9', prizePP: 1100 },
      { week: 15, race: '紅葉特別', grade: '2勝クラス', cond: '芝1600 良', place: 5, time: '1:36.4', prizePP: 0 },
    ] : [],
    pedigree: PEDIGREE,
    inbreedCoeff: 0.0469,
    crosses: [{ name: 'サンダーボルト', label: '4×5', color: '#7ad0ff' }, { name: 'ミスティローズ', label: '5×5', color: '#f3a5c8' }],
    training: [
      { week: 32, menu: '追い切り', effect: 'スピード +12', fatigueDelta: 18, note: '好調を維持' },
      { week: 31, menu: '坂路', effect: 'パワー +9', fatigueDelta: 14, note: '—' },
      { week: 30, menu: 'プール', effect: 'スタミナ +7', fatigueDelta: -6, note: '疲労を抜いた' },
      { week: 29, menu: '併せ馬', effect: '根性 +11', fatigueDelta: 16, note: '気合が乗ってきた' },
      { week: 28, menu: '軽め調整', effect: '賢さ +4', fatigueDelta: -10, note: '出走後の調整' },
      { week: 27, menu: 'ウッドチップ', effect: 'スタミナ +8', fatigueDelta: 9, note: '—' },
    ],
    entryFeeEP: h.nextRace === null ? null : 400,
  };
}

export const demoStableRepo: StableRepo = {
  stable: async () => ({ demo: true, weekNo: 32, weekRange: '8/18 〜 8/24', horses: DEMO_HORSES, entries: 3, plannedEP: 1150 }),
  horse: async (id) => { const h = DEMO_HORSES.find((x) => x.id === id); return h === undefined ? null : detailOf(h); },
};

/** 一覧の並び: 未指示 → 指示済み → 休養中。同順位内は格の高い順、次に獲得賞金の多い順（カードの規則） */
export function sortStable(horses: readonly StableHorse[]): StableHorse[] {
  const rank = (w: WeekPlan): number => (w.kind === 'todo' ? 0 : w.kind === 'done' ? 1 : 2);
  return [...horses].sort((a, b) => rank(a.week) - rank(b.week) || b.classRank - a.classRank || b.prizePP - a.prizePP);
}

/** 調子の表示（記号・語・色）。エンジンの 1〜5 をそのまま写す */
export function conditionView(c: Condition): { readonly mark: string; readonly label: string; readonly color: string } {
  return [
    { mark: '▲', label: '不安', color: '#a81a13' },
    { mark: '△', label: 'やや不安', color: '#a9741a' },
    { mark: '○', label: '普通', color: '#4a6178' },
    { mark: '○', label: '好調', color: '#2f9e4f' },
    { mark: '◎', label: '絶好調', color: '#1e7a3a' },
  ][c - 1]!;
}

/** 疲労の色: ≤30 緑・≤60 黄・>60 赤 */
export function fatigueColor(f: number): string {
  return f <= 30 ? '#1e7a3a' : f <= 60 ? '#8a5a06' : '#a81a13';
}
