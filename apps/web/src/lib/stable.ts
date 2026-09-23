/**
 * ★牧場（わたしの馬）の表示モデルとデータ層 — 正本 design/hud-ds/components/stable-home・horse-detail
 *
 * 【今の状態】
 *   ログイン（Supabase Auth）と「自分の馬だけを読める」ビューがまだ無いので、**デモデータ**を返す。
 *   画面は `StableRepo` だけを見る。実データが来たら `supabaseStableRepo` を差し替えるだけにする（画面は触らない）。
 *   ⚠️ ここに計算を持たない（昇格条件・上限・係数はエンジン／DB が出す値をそのまま）。
 *   ⚠️ `potential` は数値で出さない（★1〜5・半星）。素質の数値は本人にも見せない（正典 §5.5・§12.4）。
 */

import type { StableGrade } from '@star/training';

export type Condition = 1 | 2 | 3 | 4 | 5;
export type WeekPlan = { readonly kind: 'done'; readonly menu: string } | { readonly kind: 'todo' } | { readonly kind: 'rest' };

export interface StableHorse {
  readonly id: string;
  readonly name: string;
  readonly sexAge: string;
  /** 格（1..6）。5 以上（オープン・重賞）は金チップ */
  readonly classRank: number;
  readonly classLabel: string;
  // ⚠️ ★**素質（`stars` / 段）は持ちません** — ★2026-09-18・**D-114 ②**・T-10・AL-2。
  //    ★型に列があると「埋めるために読む」が起きるので、★**型から消してあります**。
  readonly condition: Condition;
  readonly fatigue: number;
  readonly nextRace: string | null;
  /**
   * ★**次走までの週数**（★今週が出走週なら 0・★予定が無ければ null）。
   * ⚠️ ★`nextRace`（文字列）だけでは ★**`race-week` と `after-race` が構造的に出せません**でした
   *    （★2026-09-16・D12-3 のバッジを 4 値で出すために足しました）。
   * ★判定は `@star/training` の `raceWeekMarkOf` が 1 か所で行います（★画面に条件を持たない）。
   */
  readonly weeksToNextRace: number | null;
  /** ★**前走からの週数**（★まだ走っていなければ null） */
  readonly weeksSinceLastRace: number | null;
  readonly week: WeekPlan;
  readonly prizePP: number;
  /**
   * ★**厩舎の格**（★D-103・2026-09-16・D12-6）。★馬ごとに持ちます（★厩舎全体ではない）。
   * ⚠️ ★**上の格は「速く仕上がる」だけ**です — ★伸びと費用に同じ倍率が掛かるので、
   *    ★**同じ EP を注いだときの強さはどの格でも同じ**（`gainPerEpRatio` が 1.0）。
   * ⚠️ ★**素質の天井（★）は変わりません**（★§7.3 の `current ≤ potential`）。
   * ★倍率も値段も `@star/training` から引きます（★画面に表を持たない）。
   */
  readonly stableGrade: StableGrade;
}

/**
 * 会員ホーム 4 カード（R-4）の表示値 — すべてサーバー計算値をそのまま写す。
 *   ⚠️ EP と PP は別の値のまま持つ（合算しない・憲法 §0.2）。
 *   ⚠️ デイリー額・初期 EP は較正定数（D-075）— サーバーが出す値を表示するだけで、ここに定数を持たない。
 */
export interface StableHome {
  readonly displayName: string;
  readonly stableName: string;
  readonly epBalance: number;
  readonly ppBalance: number;
  /** お知らせ件数（0 ならピルを出さない） */
  readonly notices: number;
  /** デイリーログイン EP（D-075 の較正定数・サーバー値） */
  readonly dailyEP: number;
  readonly dailyClaimed: boolean;
  /** 次の発走（'15:40'）と締切までの残り（'2:24'）。開催が無ければ null */
  readonly nextStartAt: string | null;
  readonly closesIn: string | null;
  /** 発走 3 分前から中継ボタンが押せる */
  readonly liveOpen: boolean;
  readonly myEntries: number;
  readonly pendingBets: number;
  /** 次走（最も近い 1 件）。無ければ null */
  readonly nextRun: { readonly race: string; readonly horse: string } | null;
}

export interface StableView {
  readonly demo: boolean;
  readonly weekNo: number;
  readonly weekRange: string;
  readonly horses: readonly StableHorse[];
  /** 今週の出走登録頭数・消費予定 EP（サーバー計算値） */
  readonly entries: number;
  readonly plannedEP: number;
  readonly home: StableHome;
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
  /**
   * ⚠️ ★**週数は 4 値がすべて出るように割り当てています**（★D12-3・2026-09-16）。
   *    ★h1 = 今週出走（0）／h2 = 次走前（1）／h3 = 出走あと（前走から 1）／h4 = 印なし。
   *    ★以前は週数を持っておらず、★`race-week` と `after-race` が**画面に一度も出ませんでした**。
   */
  { id: 'h1', name: 'サクラブリーズ', sexAge: '牝4', classRank: 6, classLabel: '重賞 GIII', condition: 5, fatigue: 24, nextRace: '桜星賞（8/22）', weeksToNextRace: 0, weeksSinceLastRace: 8, stableGrade: 'gold', week: { kind: 'done', menu: '追い切り' }, prizePP: 4520 },
  { id: 'h2', name: 'ホクトリュウセイ', sexAge: '牡5', classRank: 5, classLabel: 'オープン', condition: 4, fatigue: 41, nextRace: '若草賞（8/24）', weeksToNextRace: 1, weeksSinceLastRace: 6, stableGrade: 'bronze', week: { kind: 'done', menu: '坂路' }, prizePP: 3100 },
  { id: 'h3', name: 'トキメキステップ', sexAge: '牝3', classRank: 3, classLabel: '2勝クラス', condition: 3, fatigue: 58, nextRace: null, weeksToNextRace: null, weeksSinceLastRace: 1, stableGrade: 'silver', week: { kind: 'todo' }, prizePP: 900 },
  { id: 'h4', name: 'ゲンブノツルギ', sexAge: '牡4', classRank: 2, classLabel: '1勝クラス', condition: 2, fatigue: 72, nextRace: null, weeksToNextRace: null, weeksSinceLastRace: null, stableGrade: 'bronze', week: { kind: 'todo' }, prizePP: 400 },
  { id: 'h5', name: 'シラユキノヒメ', sexAge: '牝3', classRank: 1, classLabel: '未勝利', condition: 3, fatigue: 12, nextRace: '新緑賞（8/23）', weeksToNextRace: 1, weeksSinceLastRace: null, stableGrade: 'bronze', week: { kind: 'done', menu: 'ウッドチップ' }, prizePP: 0 },
  { id: 'h6', name: 'カガヤキボシ', sexAge: '牡2', classRank: 1, classLabel: '新馬', condition: 4, fatigue: 8, nextRace: null, weeksToNextRace: null, weeksSinceLastRace: null, stableGrade: 'bronze', week: { kind: 'rest' }, prizePP: 0 },
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
  stable: async () => ({
    demo: true, weekNo: 32, weekRange: '8/18 〜 8/24', horses: DEMO_HORSES, entries: 3, plannedEP: 1150,
    home: {
      displayName: 'たかせ みのる', stableName: 'サクラ牧場',
      epBalance: 4200, ppBalance: 18600,
      notices: 2, dailyEP: 200, dailyClaimed: true,
      nextStartAt: '15:40', closesIn: '2:24', liveOpen: true,
      myEntries: 3, pendingBets: 1,
      nextRun: { race: '桜星賞（8/22）', horse: 'サクラブリーズ' },
    },
  }),
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

/**
 * ★**調教画面の顔（3 種）を選ぶ**（★2026-09-23・`design/art/prompts/train-face-*.txt`）
 *
 *   ★素材は ★**3 枚しかありません**（上機嫌・平常・疲れ）。★段を増やさないこと。
 *   ★決め方は ★**疲労が先**です — ★調子が良くても、疲れていれば疲れた顔にします
 *     （★「休ませる」を促すのがこの画面の役目で、★疲労の色も `fatigueColor` が 60 で赤にします）。
 *
 * ⚠️ ★境目は `fatigueColor` と揃えてあります（★60 超で赤 ＝ 疲れた顔）。★別の数を置かないこと。
 * ⚠️ ★調教中（`running`）は ★**顔を変えません** — ★走っている最中に表情が跳ねると、
 *    ★「調教の内容で表情が決まった」と誤って読まれます（★実際は調子と疲労で決まります）。
 */
export type TrainFace = 'happy' | 'normal' | 'tired';
export function trainFaceOf(condition: Condition, fatigue: number): TrainFace {
  if (fatigue > 60) return 'tired';
  if (condition >= 4) return 'happy';
  if (condition <= 2) return 'tired';
  return 'normal';
}

/** 疲労の色: ≤30 緑・≤60 黄・>60 赤 */
export function fatigueColor(f: number): string {
  return f <= 30 ? '#1e7a3a' : f <= 60 ? '#8a5a06' : '#a81a13';
}
